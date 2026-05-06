import os
import time
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine
import openmeteo_requests
import requests_cache
from retry_requests import retry

# Configurazione intervalli
SYNC_INTERVAL = 3600  # Sincronizza ogni ora

# Database e Coordinate
DB_HOST = os.getenv('POSTGRES_HOST', 'postgres')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB', 'sensori')
DB_USER = os.getenv('POSTGRES_USER', 'sensore_user')
DB_PASS = os.getenv('POSTGRES_PASSWORD', 'sensore_password')
LAT = float(os.getenv('VINEYARD_LATITUDE', '43.0573'))
LON = float(os.getenv('VINEYARD_LONGITUDE', '11.4891'))

PARQUET_PATH = "/app/archive/dataset_vigna.parquet"

def get_db_engine():
    return create_engine(f'postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}')

def get_weather_data(start_date, end_date):
    print(f"Recupero dati meteo da Open-Meteo per {LAT}, {LON} ({start_date} -> {end_date})...")
    cache_session = requests_cache.CachedSession('.cache', expire_after=-1)
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    openmeteo = openmeteo_requests.Client(session=retry_session)

    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": LAT,
        "longitude": LON,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ["temperature_2m", "relative_humidity_2m", "rain"]
    }
    responses = openmeteo.weather_api(url, params=params)
    response = responses[0]

    hourly = response.Hourly()
    hourly_data = {
        "timestamp": pd.date_range(
            start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
            end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
            freq=pd.Timedelta(seconds=hourly.Interval()),
            inclusive="left"
        ),
        "weather_temp": hourly.Variables(0).ValuesAsNumpy(),
        "weather_humidity": hourly.Variables(1).ValuesAsNumpy(),
        "weather_rain": hourly.Variables(2).ValuesAsNumpy()
    }
    return pd.DataFrame(data=hourly_data)

def sync_data():
    print(f"\n[{datetime.now()}] Inizio sincronizzazione...")
    
    # 1. Carica il dataset storico se esiste
    df_old = pd.DataFrame()
    last_timestamp = None
    if os.path.exists(PARQUET_PATH):
        try:
            df_old = pd.read_parquet(PARQUET_PATH)
            if not df_old.empty:
                last_timestamp = pd.to_datetime(df_old['timestamp']).max()
                print(f"Dataset esistente caricato. Ultimo dato salvato: {last_timestamp}")
        except Exception as e:
            print(f"Impossibile leggere il file parquet esistente: {e}")

    # 2. Prendi nuovi dati da Postgres
    engine = get_db_engine()
    query = "SELECT * FROM sensor_data"
    if last_timestamp:
        # Convertiamo il timestamp per la query SQL
        ts_str = last_timestamp.strftime('%Y-%m-%d %H:%M:%S')
        query += f" WHERE timestamp > '{ts_str}'"
    
    try:
        df_new_sensors = pd.read_sql(query, engine)
    except Exception as e:
        print(f"Errore query Postgres: {e}")
        return
    
    if df_new_sensors.empty:
        print("Nessun nuovo dato trovato in Postgres.")
        return

    print(f"Trovati {len(df_new_sensors)} nuovi record dai sensori.")
    df_new_sensors['timestamp'] = pd.to_datetime(df_new_sensors['timestamp'], utc=True).dt.round('h')

    # 3. Scarica il meteo per il periodo mancante
    start_date = df_new_sensors['timestamp'].min().strftime('%Y-%m-%d')
    end_date = df_new_sensors['timestamp'].max().strftime('%Y-%m-%d')
    
    try:
        df_weather = get_weather_data(start_date, end_date)
        # Merge locale
        df_merged = pd.merge(df_new_sensors, df_weather, on='timestamp', how='left')
        
        # 4. Concatenazione (Incremental update)
        if not df_old.empty:
            df_final = pd.concat([df_old, df_merged])
        else:
            df_final = df_merged
            
        # Rimuovi eventuali duplicati per sicurezza
        df_final = df_final.drop_duplicates(subset=['sensor_id', 'timestamp'], keep='last')
        
        # Ordina per tempo
        df_final = df_final.sort_values('timestamp')

        # Salva
        df_final.to_parquet(PARQUET_PATH)
        print(f"Sincronizzazione completata. Record totali archiviati: {len(df_final)}")
        
    except Exception as e:
        print(f"Errore durante il recupero meteo o salvataggio: {e}")

if __name__ == "__main__":
    print("Servizio EdgeVine Analytics avviato in modalità automatica.")
    print(f"Intervallo di controllo: {SYNC_INTERVAL} secondi.")
    
    # Prima esecuzione immediata
    try:
        sync_data()
    except Exception as e:
        print(f"Errore nella prima esecuzione: {e}")

    # Loop infinito
    while True:
        time.sleep(SYNC_INTERVAL)
        try:
            sync_data()
        except Exception as e:
            print(f"Errore durante il ciclo di sync: {e}")
