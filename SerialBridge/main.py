import json
import os
import time

import psycopg
import serial


SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/cu.usbmodemF412FA651F542")
SERIAL_BAUDRATE = int(os.getenv("SERIAL_BAUDRATE", "9600"))

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "sensori")
POSTGRES_USER = os.getenv("POSTGRES_USER", "sensore_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "sensore_password")


def insert_measurement(cur, vineyard_id, device_id, temperature, humidity, moisture):
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
        (device_id, vineyard_id, temperature, humidity, moisture),
    )


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
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")
            continue

        print(f"Received: {data}")

        if data["type"] == "measurement":
            try:
                with conn.cursor() as cur:
                    insert_measurement(
                        cur,
                        vineyard_id=data["vineyard_id"],
                        device_id=data["id"],
                        temperature=data["temperature"],
                        humidity=data["humidity"],
                        moisture=data["moisture"],
                    )
                conn.commit()
            except psycopg.Error as e:
                conn.rollback()
                print(f"Database error: {e}")

            print("Sensor measurement inserted into database.")

        if data["type"] == "Request":
            print(f"Node {data['id']} status: {data['status']}")
        time.sleep(1)


if __name__ == "__main__":
    main()
