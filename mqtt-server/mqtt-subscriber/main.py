import json
import os
import re
import socket
import time
from datetime import datetime, timezone
from threading import Lock

import paho.mqtt.client as mqtt
import psycopg
import shutil
import threading
import subprocess
import pandas as pd
from sqlalchemy import create_engine
import openmeteo_requests
import requests_cache
from retry_requests import retry

MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPICS = [
    topic.strip()
    for topic in os.getenv("MQTT_TOPICS", os.getenv("MQTT_TOPIC", "zone/+/sensor/+,sensori/+/+")).split(",")
    if topic.strip()
]
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "arduino")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "mosquitto")
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))
MQTT_CLIENT_ID = os.getenv(
    "MQTT_CLIENT_ID",
    f"mqtt-subscriber-{socket.gethostname()}-{os.getpid()}",
)

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "sensori")
POSTGRES_USER = os.getenv("POSTGRES_USER", "sensore_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "sensore_password")

VINEYARD_ID = int(os.getenv("VINEYARD_ID", "1"))
VINEYARD_NAME = os.getenv("VINEYARD_NAME", f"Vineyard {VINEYARD_ID}")
VINEYARD_OWNER = os.getenv("VINEYARD_OWNER", "Unknown")
VINEYARD_ALTITUDE = float(os.getenv("VINEYARD_ALTITUDE", "0"))
VINEYARD_LATITUDE = float(os.getenv("VINEYARD_LATITUDE", "0"))
VINEYARD_LONGITUDE = float(os.getenv("VINEYARD_LONGITUDE", "0"))
AUTO_CREATE_VINEYARD = os.getenv("AUTO_CREATE_VINEYARD", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

DB_CONNINFO = (
    f"host={POSTGRES_HOST} "
    f"port={POSTGRES_PORT} "
    f"dbname={POSTGRES_DB} "
    f"user={POSTGRES_USER} "
    f"password={POSTGRES_PASSWORD}"
)

ZONE_TOPIC_RE = re.compile(r"^zone/(?P<zone>[A-Za-z0-9_-]+)/sensor/(?P<sensor>[A-Za-z0-9_-]+)$")
DEVICE_TOPIC_RE = re.compile(r"^sensori/(?P<device>[^/]+)/(?P<sensor>[A-Za-z0-9_-]+)$")
DEVICE_ZONE_SUFFIX_RE = re.compile(r"(?P<zone>[A-Za-z0-9_-]+)$")
SENSOR_ALIASES = {
    "temperature": "temperature",
    "humidity": "humidity",
    "moisture": "moisture",
    "mosture": "moisture",
    "image": "image_url",
    "camera": "image_url",
}
REQUIRED_SENSORS = ("temperature", "humidity", "moisture")
DEVICE_ZONE_MAP = {
    key: int(value)
    for key, value in json.loads(os.getenv("DEVICE_ZONE_MAP", "{}")).items()
}

db_conn = None
zone_id_cache = {}
zone_state = {}
zone_state_lock = Lock()


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_timestamp(value):
    if value in (None, ""):
        return None

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)

    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None

        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"

        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt
        return dt.astimezone(timezone.utc).replace(tzinfo=None)

    raise ValueError(f"Timestamp non supportato: {value!r}")


def connect_db():
    global db_conn, zone_id_cache

    while True:
        try:
            db_conn = psycopg.connect(DB_CONNINFO)
            db_conn.autocommit = True
            zone_id_cache = {}
            ensure_vineyard_exists()
            print("Connesso a PostgreSQL")
            return
        except Exception as exc:
            print(f"PostgreSQL non disponibile o configurazione non valida: {exc}")
            try:
                if db_conn is not None:
                    db_conn.close()
            except Exception:
                pass
            time.sleep(3)


def reconnect_db():
    global db_conn

    try:
        if db_conn is not None:
            db_conn.close()
    except Exception:
        pass

    connect_db()


def ensure_vineyard_exists():
    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM vineyard WHERE id = %s", (VINEYARD_ID,))
        if cur.fetchone():
            return

        if not AUTO_CREATE_VINEYARD:
            raise RuntimeError(
                "Vineyard non presente nel DB. Inserisci la riga in `vineyard` "
                "oppure abilita AUTO_CREATE_VINEYARD."
            )

        cur.execute(
            """
            INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                VINEYARD_ID,
                VINEYARD_NAME,
                VINEYARD_OWNER,
                VINEYARD_ALTITUDE,
                VINEYARD_LATITUDE,
                VINEYARD_LONGITUDE,
            ),
        )
        cur.execute(
            """
            SELECT setval(
                pg_get_serial_sequence('vineyard', 'id'),
                COALESCE((SELECT MAX(id) FROM vineyard), 1),
                true
            )
            """
        )
        print(
            "Creato vineyard mancante "
            f"(id={VINEYARD_ID}, name={VINEYARD_NAME!r})"
        )


def get_or_create_sensor_id(zone_identifier):
    # zone_identifier può essere un numero o una stringa come "S-01"
    cached_id = zone_id_cache.get(zone_identifier)
    if cached_id is not None:
        return cached_id

    with db_conn.cursor() as cur:
        # Cerchiamo prima per external_id, poi per number se è numerico
        cur.execute(
            """
            SELECT id
            FROM vine_zone
            WHERE vineyard_id = %s AND (external_id = %s OR number::text = %s)
            """,
            (VINEYARD_ID, str(zone_identifier), str(zone_identifier)),
        )
        existing_row = cur.fetchone()
        if existing_row is not None:
            zone_id = existing_row[0]
            zone_id_cache[zone_identifier] = zone_id
            return zone_id

        # Se non esiste, lo creiamo usando l'identificativo come external_id
        # Proviamo a ricavare un numero se l'ID è del tipo "S-01"
        try:
            numeric_match = re.search(r"(\d+)", str(zone_identifier))
            zone_number = int(numeric_match.group(1)) if numeric_match else 0
        except:
            zone_number = 0

        cur.execute(
            """
            INSERT INTO vine_zone (number, external_id, vineyard_id)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (zone_number, str(zone_identifier), VINEYARD_ID),
        )
        zone_id = cur.fetchone()[0]

    zone_id_cache[zone_identifier] = zone_id
    return zone_id


def extract_json(stdout):
    """Robustly extracts JSON from a string that might contain other text (like YOLO banners)"""
    try:
        # Tenta il match più esterno di parentesi graffe
        import re
        match = re.search(r'(\{.*\})', stdout, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return json.loads(stdout.strip())
    except Exception:
        return None

def run_ai_analysis(image_path):
    """Runs the YOLO inference script and returns results"""
    if not image_path:
        return None
    
    # Ignore remote URLs - only local captures allowed
    if image_path.startswith('http'):
        print(f"--- ⚠️ Skipping non-local image URL: {image_path} ---")
        return None
        
    # Detect if we are in Docker or local
    is_docker = os.path.exists("/.dockerenv")
    
    if is_docker:
        if image_path.startswith('/'):
            abs_image_path = f"/app/public{image_path}" if image_path.startswith('/captures') else image_path
        else:
            abs_image_path = f"/app/public/captures/{image_path}" if not image_path.startswith('captures') else f"/app/public/{image_path}"
        python_script = "/CV/inference.py"
        python_cmd = "python3"
    else:
        # Local path handling
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
        if image_path.startswith('/'):
            abs_image_path = os.path.join(project_root, "vineyard-dashboard/public", image_path.lstrip('/'))
        else:
            abs_image_path = os.path.join(project_root, "vineyard-dashboard/public/captures", image_path)
        python_script = os.path.join(project_root, "CV/inference.py")
        python_cmd = "python3"

    save_name = f"auto_{os.path.basename(image_path)}"
    
    if not os.path.exists(abs_image_path):
        print(f"--- ❌ Image file not found: {abs_image_path} ---")
        return None

    try:
        # We run the script and capture JSON output
        result = subprocess.run(
            [python_cmd, python_script, abs_image_path, save_name],
            capture_output=True, text=True, check=True, timeout=120
        )
        
        parsed_results = extract_json(result.stdout)
        if not parsed_results:
            print(f"--- ❌ Failed to parse JSON from AI script output: {result.stdout[:200]}... ---")
            return None

        # Path definitions for results movement
        if is_docker:
            generated_path = f"/CV/images/{save_name}"
            final_path = f"/app/public/cv_results/{save_name}"
        else:
            generated_path = os.path.join(project_root, "CV/images", save_name)
            final_path = os.path.join(project_root, "vineyard-dashboard/public/cv_results", save_name)

        if os.path.exists(generated_path):
            os.makedirs(os.path.dirname(final_path), exist_ok=True)
            shutil.copy2(generated_path, final_path)
            os.remove(generated_path)
            
        return parsed_results
    except Exception as e:
        print(f"AI Analysis Error for {image_path}: {e}")
        if hasattr(e, 'stderr') and e.stderr:
            print(f"Stderr: {e.stderr}")
        return None

def async_ai_analysis(record_id, image_url):
    """Worker to run AI in background and update the record"""
    print(f"--- 🧠 Async AI Analysis: Starting for ID {record_id} ({image_url}) ---")
    results = run_ai_analysis(image_url)
    if results:
        try:
            with psycopg.connect(DB_CONNINFO) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE sensor_data 
                        SET 
                            grape_count = %s,
                            health_status = %s,
                            estimated_liters = %s,
                            processed_image_url = %s,
                            leaf_healthy_count = %s,
                            leaf_stress_count = %s,
                            leaf_disease_count = %s
                        WHERE id = %s
                    """, (
                        results.get("grape_count"),
                        results.get("health_prediction"),
                        results.get("liters_estimated"),
                        results.get("processed_image_url"),
                        results.get("leaf_healthy_count", 0),
                        results.get("leaf_stress_count", 0),
                        results.get("leaf_disease_count", 0),
                        record_id
                    ))
                    conn.commit()
            print(f"--- ✅ Async AI Analysis: ID {record_id} completed successfully ---")
        except Exception as e:
            print(f"--- ❌ Async AI Analysis Error (DB Update): {e} ---")

def insert_sensor_data(zone_identifier, timestamp_value, measurements, image_url=None):
    zone_id = get_or_create_sensor_id(zone_identifier)

    query = """
        INSERT INTO sensor_data (
            sensor_id,
            timestamp,
            temperature,
            humidity,
            moisture,
            image_url
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    
    values = (
        zone_id,
        timestamp_value,
        measurements["temperature"],
        measurements["humidity"],
        measurements["moisture"],
        image_url
    )

    try:
        record_id = None
        with db_conn.cursor() as cur:
            cur.execute(query, values)
            record_id = cur.fetchone()[0]
        
        # If there's an image, trigger AI in a separate thread so we don't block MQTT
        if image_url and record_id:
            threading.Thread(
                target=async_ai_analysis, 
                args=(record_id, image_url), 
                daemon=True
            ).start()
            
    except Exception as exc:
        print(f"Errore insert DB: {exc}")
        reconnect_db()
        # In case of retry
        with db_conn.cursor() as cur:
            cur.execute(query, values)
            record_id = cur.fetchone()[0]
            if image_url and record_id:
                threading.Thread(
                    target=async_ai_analysis, 
                    args=(record_id, image_url), 
                    daemon=True
                ).start()


def parse_zone_from_device(device_name):
    mapped_zone = DEVICE_ZONE_MAP.get(device_name)
    if mapped_zone is not None:
        return mapped_zone

    suffix_match = DEVICE_ZONE_SUFFIX_RE.search(device_name)
    if suffix_match is None:
        raise ValueError(
            "Impossibile ricavare la zona dal device "
            f"{device_name!r}. Configura DEVICE_ZONE_MAP."
        )

    return int(suffix_match.group("zone"))


def parse_message(topic, payload):
    zone_match = ZONE_TOPIC_RE.fullmatch(topic)
    device_match = DEVICE_TOPIC_RE.fullmatch(topic)

    if zone_match is not None:
        zone_identifier = zone_match.group("zone")
        sensor_name = zone_match.group("sensor").lower()
    elif device_match is not None:
        zone_identifier = parse_zone_from_device(device_match.group("device"))
        sensor_name = device_match.group("sensor").lower()
    else:
        raise ValueError(f"Topic non supportato: {topic}")

    canonical_sensor = SENSOR_ALIASES.get(sensor_name)
    if canonical_sensor is None:
        raise ValueError(f"Sensore non gestito nel topic {topic}")

    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError:
        decoded = payload

    if isinstance(decoded, dict):
        raw_value = None
        for key in ("value", "valore", canonical_sensor, sensor_name):
            if key in decoded:
                raw_value = decoded[key]
                break

        if raw_value is None:
            raise ValueError(f"Payload JSON senza valore leggibile: {payload}")

        timestamp_value = parse_timestamp(decoded.get("timestamp"))
    else:
        raw_value = decoded
        timestamp_value = None

    if canonical_sensor == "image_url":
        value = raw_value  # Keep as string
    else:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            raise ValueError(f"Impossibile convertire valore in float: {raw_value!r}")
            
    return zone_identifier, canonical_sensor, value, timestamp_value


def register_measurement(zone_identifier, sensor_name, value, timestamp_value):
    with zone_state_lock:
        state = zone_state.setdefault(
            zone_identifier,
            {
                "latest_values": {},
                "updated_sensors": set(),
                "sensor_timestamps": {},
            },
        )

        state["latest_values"][sensor_name] = value
        state["updated_sensors"].add(sensor_name)
        state["sensor_timestamps"][sensor_name] = timestamp_value or utcnow_naive()

        if not all(sensor in state["latest_values"] for sensor in REQUIRED_SENSORS):
            return None

        if not all(sensor in state["updated_sensors"] for sensor in REQUIRED_SENSORS):
            return None

        measurements = {
            sensor: state["latest_values"][sensor] for sensor in REQUIRED_SENSORS
        }
        measurement_timestamp = max(
            state["sensor_timestamps"][sensor] for sensor in REQUIRED_SENSORS
        )
        image_url = state["latest_values"].get("image_url")
        state["updated_sensors"].clear()

    return measurement_timestamp, measurements, image_url


def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"Connesso al broker MQTT con codice: {reason_code}")
    subscriptions = [(topic, 0) for topic in MQTT_TOPICS]
    client.subscribe(subscriptions)
    print(f"Sottoscritto a: {', '.join(MQTT_TOPICS)}")


def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode("utf-8", errors="replace").strip()

    if not payload:
        print(f"Messaggio ignorato: payload vuoto sul topic {topic}")
        return

    try:
        zone_number, sensor_name, value, timestamp_value = parse_message(topic, payload)
        batch = register_measurement(zone_number, sensor_name, value, timestamp_value)
        print(
            "Ricevuto -> "
            f"topic={topic}, zone={zone_number}, sensore={sensor_name}, valore={value}"
        )
        if batch is None:
            return

        measurement_timestamp, measurements, image_url = batch
        insert_sensor_data(zone_number, measurement_timestamp, measurements, image_url)
        print(
            "Salvata misura -> "
            f"vineyard={VINEYARD_ID}, zone={zone_number}, "
            f"timestamp={measurement_timestamp.isoformat()}, dati={measurements}"
        )
    except Exception as exc:
        print(f"Messaggio ignorato ({topic}): {exc}")


def build_mqtt_client():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=MQTT_CLIENT_ID,
    )
    client.on_connect = on_connect
    client.on_message = on_message

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    return client



def process_backlog():
    """Scans the database for images without analysis and processes them in background"""
    print("--- 🔍 Background AI Worker: Scanning for un-analyzed images ---")
    while True:
        try:
            with psycopg.connect(DB_CONNINFO) as conn:
                with conn.cursor() as cur:
                    # Find records with image but no AI data
                    cur.execute("""
                        SELECT id, image_url 
                        FROM sensor_data 
                        WHERE image_url IS NOT NULL 
                          AND grape_count IS NULL 
                          AND image_url NOT LIKE 'http%'
                        LIMIT 5
                    """)
                    backlog = cur.fetchall()
            
            if not backlog:
                # No more backlog, wait before checking again
                time.sleep(60)
                continue

            for record_id, image_url in backlog:
                print(f"--- 🧠 Backlog Analysis: Processing ID {record_id} ({image_url}) ---")
                results = run_ai_analysis(image_url)
                
                if results:
                    with psycopg.connect(DB_CONNINFO) as conn:
                        with conn.cursor() as cur:
                            cur.execute("""
                                UPDATE sensor_data 
                                SET 
                                    grape_count = %s,
                                    health_status = %s,
                                    estimated_liters = %s,
                                    processed_image_url = %s,
                                    leaf_healthy_count = %s,
                                    leaf_stress_count = %s,
                                    leaf_disease_count = %s
                                WHERE id = %s
                            """, (
                                results.get("grape_count"),
                                results.get("health_prediction"),
                                results.get("liters_estimated"),
                                results.get("processed_image_url"),
                                results.get("leaf_healthy_count", 0),
                                results.get("leaf_stress_count", 0),
                                results.get("leaf_disease_count", 0),
                                record_id
                            ))
                            conn.commit()
                    print(f"--- ✅ Backlog Analysis: ID {record_id} completed ---")
                else:
                    # Mark as failed/missing to avoid infinite loop
                    print(f"--- ⚠️ Backlog Analysis: ID {record_id} failed or file missing. Marking to skip. ---")
                    with psycopg.connect(DB_CONNINFO) as conn:
                        with conn.cursor() as cur:
                            cur.execute("UPDATE sensor_data SET grape_count = -1 WHERE id = %s", (record_id,))
                            conn.commit()
                
                # Small sleep to avoid over-taxing the CPU if there are many
                time.sleep(1)

        except Exception as e:
            print(f"Background AI Worker Error: {e}")
            time.sleep(10)

def run_analytics_worker():
    """Thread per la sincronizzazione dei dati e del meteo in formato Parquet"""
    print("--- 📊 Analytics Worker: Avviato ---")
    PARQUET_PATH = "/app/archive/dataset_vigna.parquet"
    SYNC_INTERVAL = 3600 # 1 ora
    
    # Assicuriamoci che la cartella archive esista
    os.makedirs(os.path.dirname(PARQUET_PATH), exist_ok=True)

    def get_weather_data(lat, lon, start_date, end_date):
        cache_session = requests_cache.CachedSession('.cache', expire_after=-1)
        retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
        openmeteo = openmeteo_requests.Client(session=retry_session)
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": lat, "longitude": lon,
            "start_date": start_date, "end_date": end_date,
            "hourly": ["temperature_2m", "relative_humidity_2m", "rain"]
        }
        responses = openmeteo.weather_api(url, params=params)
        response = responses[0]
        hourly = response.Hourly()
        return pd.DataFrame(data={
            "timestamp": pd.date_range(
                start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
                end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
                freq=pd.Timedelta(seconds=hourly.Interval()), inclusive="left"
            ),
            "weather_temp": hourly.Variables(0).ValuesAsNumpy(),
            "weather_humidity": hourly.Variables(1).ValuesAsNumpy(),
            "weather_rain": hourly.Variables(2).ValuesAsNumpy()
        })

    while True:
        try:
            print(f"[{datetime.now()}] Analytics: Inizio sync incrementale...")
            
            # 1. Carica storico
            df_old = pd.DataFrame()
            last_ts = None
            if os.path.exists(PARQUET_PATH):
                df_old = pd.read_parquet(PARQUET_PATH)
                if not df_old.empty:
                    # Forza il timestamp a UTC se caricato come naive
                    df_old['timestamp'] = pd.to_datetime(df_old['timestamp']).dt.tz_localize('UTC', ambiguous='infer')
                    last_ts = df_old['timestamp'].max()

            # 2. Leggi nuovi dati da DB con JOIN per avere il numero del settore
            engine = create_engine(f'postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}')
            query = """
                SELECT sd.*, vz.number as sector_id, vz.external_id 
                FROM sensor_data sd
                JOIN vine_zone vz ON sd.sensor_id = vz.id
            """
            if last_ts:
                query += f" WHERE sd.timestamp > '{last_ts.strftime('%Y-%m-%d %H:%M:%S')}'"
            
            df_new = pd.read_sql(query, engine)
            
            if not df_new.empty:
                df_new['timestamp'] = pd.to_datetime(df_new['timestamp'], utc=True).dt.round('h')
                start_d = df_new['timestamp'].min().strftime('%Y-%m-%d')
                end_d = df_new['timestamp'].max().strftime('%Y-%m-%d')
                
                # 3. Meteo e Merge (get_weather_data restituisce UTC aware)
                df_weather = get_weather_data(VINEYARD_LATITUDE, VINEYARD_LONGITUDE, start_d, end_d)
                df_merged = pd.merge(df_new, df_weather, on='timestamp', how='left')
                
                # 4. Unisci e Pulisci
                df_final = pd.concat([df_old, df_merged])
                df_final = df_final.drop_duplicates(subset=['sensor_id', 'timestamp'], keep='last').sort_values('timestamp')
                df_final = df_final.reset_index(drop=True)

                # Rimuoviamo le colonne delle immagini (non utili per analisi numerica)
                cols_to_drop = ['image_url', 'processed_image_url']
                df_final = df_final.drop(columns=[c for c in cols_to_drop if c in df_final.columns])

                # Rimuoviamo il fuso orario e convertiamo in STRINGA per massima compatibilità
                df_to_save = df_final.copy()
                df_to_save['timestamp'] = df_to_save['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')

                print(f"--- 📊 Analytics: Tipi di dati in salvataggio:\n{df_to_save.dtypes} ---")
                print(f"--- 📊 Analytics: Prime righe:\n{df_to_save[['sensor_id', 'timestamp']].head()} ---")
                
                df_to_save.to_parquet(PARQUET_PATH, index=False)
                print(f"--- ✅ Analytics: Archivio aggiornato con successo. Record totali: {len(df_final)} ---")
            else:
                print("--- 📊 Analytics: Nessun nuovo dato da archiviare. ---")

        except Exception as e:
            print(f"--- ⚠️ Analytics Error: {e} ---")
            import traceback
            traceback.print_exc()
            
        time.sleep(SYNC_INTERVAL)

def main():
    connect_db()
    
    # Start the backlog processor in a separate thread
    backlog_thread = threading.Thread(target=process_backlog, daemon=True)
    backlog_thread.start()

    # Start the analytics worker thread
    analytics_thread = threading.Thread(target=run_analytics_worker, daemon=True)
    analytics_thread.start()
    
    client = build_mqtt_client()

    while True:
        try:
            print(
                f"Connessione a MQTT {MQTT_BROKER}:{MQTT_PORT} "
                f"per vineyard_id={VINEYARD_ID} ..."
            )
            client.connect(MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE)
            client.loop_forever()
        except Exception as exc:
            print(f"Errore MQTT: {exc}")
            time.sleep(5)


if __name__ == "__main__":
    main()
