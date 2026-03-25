import json
import os
import re
import socket
import time
from datetime import datetime, timezone
from threading import Lock

import paho.mqtt.client as mqtt
import psycopg

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

ZONE_TOPIC_RE = re.compile(r"^zone/(?P<zone>\d+)/sensor/(?P<sensor>[A-Za-z0-9_-]+)$")
DEVICE_TOPIC_RE = re.compile(r"^sensori/(?P<device>[^/]+)/(?P<sensor>[A-Za-z0-9_-]+)$")
DEVICE_ZONE_SUFFIX_RE = re.compile(r"(?P<zone>\d+)$")
SENSOR_ALIASES = {
    "temperature": "temperature",
    "humidity": "humidity",
    "moisture": "moisture",
    "mosture": "moisture",
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


def get_or_create_vine_zone_id(zone_number):
    cached_id = zone_id_cache.get(zone_number)
    if cached_id is not None:
        return cached_id

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM vine_zone
            WHERE vineyard_id = %s AND number = %s
            """,
            (VINEYARD_ID, zone_number),
        )
        existing_row = cur.fetchone()
        if existing_row is not None:
            zone_id = existing_row[0]
            zone_id_cache[zone_number] = zone_id
            return zone_id

        cur.execute(
            """
            INSERT INTO vine_zone (number, vineyard_id)
            VALUES (%s, %s)
            RETURNING id
            """,
            (zone_number, VINEYARD_ID),
        )
        zone_id = cur.fetchone()[0]

    zone_id_cache[zone_number] = zone_id
    return zone_id


def insert_sensor_data(zone_number, timestamp_value, measurements):
    zone_id = get_or_create_vine_zone_id(zone_number)

    query = """
        INSERT INTO sensor_data (
            vine_zone_id,
            timestamp,
            temperature,
            humidity,
            moisture
        )
        VALUES (%s, %s, %s, %s, %s)
    """
    values = (
        zone_id,
        timestamp_value,
        measurements["temperature"],
        measurements["humidity"],
        measurements["moisture"],
    )

    try:
        with db_conn.cursor() as cur:
            cur.execute(query, values)
    except Exception as exc:
        print(f"Errore insert DB: {exc}")
        reconnect_db()
        zone_id = get_or_create_vine_zone_id(zone_number)
        retry_values = (
            zone_id,
            timestamp_value,
            measurements["temperature"],
            measurements["humidity"],
            measurements["moisture"],
        )
        with db_conn.cursor() as cur:
            cur.execute(query, retry_values)


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
        zone_number = int(zone_match.group("zone"))
        sensor_name = zone_match.group("sensor").lower()
    elif device_match is not None:
        zone_number = parse_zone_from_device(device_match.group("device"))
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

    value = float(raw_value)
    return zone_number, canonical_sensor, value, timestamp_value


def register_measurement(zone_number, sensor_name, value, timestamp_value):
    with zone_state_lock:
        state = zone_state.setdefault(
            zone_number,
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
        state["updated_sensors"].clear()

    return measurement_timestamp, measurements


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

        measurement_timestamp, measurements = batch
        insert_sensor_data(zone_number, measurement_timestamp, measurements)
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


def main():
    connect_db()
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
