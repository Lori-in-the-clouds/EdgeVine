import json
import os
import time

import psycopg
import serial


SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/cu.usbmodemF412FA651F542")
SERIAL_BAUDRATE = int(os.getenv("SERIAL_BAUDRATE", "9600"))

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "EdgeVine")
POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")

VINEYARD_ID = os.getenv("VINEYARD_ID", "1")


def insert_measurement(cur, device_id, temperature, humidity, moisture):
    cur.execute(
        """
        INSERT INTO sensor_measurements (
            monitoring_node_id,
            vineyard_id,
            temperature,
            humidity,
            moisture,
            timestamp
        )
        VALUES (%s, %s, %s, %s, %s, NOW())
        """,
        (device_id, VINEYARD_ID, temperature, humidity, moisture),
    )

def fetch_measurements_response(cur):
    response = {
        "type" : "response",
        "strings" : []
    }
    cur.execute(
        """
        SELECT id, name FROM vineyard_sector
        WHERE vineyard_id = %s
        """,
        (VINEYARD_ID,)
    )

    sectors = cur.fetchall()
    print("Sectors in vineyard:")
    print(sectors)

    for sector in sectors:
        cur.execute(
            """
            SELECT DISTINCT ON (mn.id) sm.temperature, sm.humidity, sm.moisture
            FROM monitoring_node mn
            JOIN sensor_measurements sm ON mn.id = sm.monitoring_node_id
            WHERE mn.sector_id = %s
            ORDER BY mn.id, sm.timestamp DESC
            """,
            (sector[0],)
        )
        measurements = cur.fetchall()
        print(f"Measurements for sector {sector[1]}:")
        print(measurements)
        temperature = 0
        humidity = 0
        moisture = 0
        for measurement in measurements:
            temperature += measurement[0]
            humidity += measurement[1]
            moisture += measurement[2]

        temperature = f"{temperature / len(measurements):.2f}°C" if len(measurements) > 0 else "N/A"
        humidity = f"{humidity / len(measurements):.2f}%" if len(measurements) > 0 else "N/A"
        moisture = f"{moisture / len(measurements):.2f}%" if len(measurements) > 0 else "N/A"

        response["strings"].append(f"{sector[1]} - Temp: {temperature}, Humidity: {humidity}, Moisture: {moisture}")
    
    return response

def main():
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=1)

    conn = psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )

    while True:
        line = ser.readline()

        if not line:
            continue

        decoded = line.decode("utf-8").strip()
        try:
            data = json.loads(decoded)
            print(f"Received: {data}")

            if data["type"] == "measurement":
                with conn.cursor() as cur:
                    insert_measurement(
                        cur,
                        device_id=data["id"],
                        temperature=data["temperature"],
                        humidity=data["humidity"],
                        moisture=data["moisture"],
                    )
                conn.commit()
                print("Sensor measurement inserted into database.")

            if data["type"] == "request":
                with conn.cursor() as cur:
                    response = fetch_measurements_response(cur)
                    decoded_response = json.dumps(response)
                    ser.write(decoded_response.encode("utf-8") + b"\n")
                    print("Response sent to device.")
                conn.commit()
        
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")
        except psycopg.Error as e:
            conn.rollback()
            print(f"Database error: {e}")
        time.sleep(1)


if __name__ == "__main__":
    main()
