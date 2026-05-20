import json
import os
import re
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

VINEYARD_ID = int(os.getenv("VINEYARD_ID", "1"))
VINEYARD_NAME = os.getenv("VINEYARD_NAME", f"Vineyard {VINEYARD_ID}")


def parse_node_number(device_id):
    match = re.search(r"(\d+)", str(device_id))
    return int(match.group(1)) if match else 0


def ensure_vineyard(cur):
    cur.execute(
        """
        INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
        """,
        (VINEYARD_ID, VINEYARD_NAME, "Serial Bridge", 0, 0, 0),
    )


def get_or_create_monitoring_node(cur, device_id):
    cur.execute(
        """
        SELECT id
        FROM monitoring_node
        WHERE vineyard_id = %s AND (external_id = %s OR number::text = %s)
        LIMIT 1
        """,
        (VINEYARD_ID, str(device_id), str(device_id)),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    node_number = parse_node_number(device_id)
    cur.execute(
        """
        INSERT INTO monitoring_node (number, vineyard_id, external_id, name)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (vineyard_id, number)
        DO UPDATE SET
            external_id = COALESCE(monitoring_node.external_id, EXCLUDED.external_id),
            name = COALESCE(monitoring_node.name, EXCLUDED.name),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
        """,
        (node_number, VINEYARD_ID, str(device_id), f"Node {device_id}"),
    )
    return cur.fetchone()[0]


def insert_measurement(cur, device_id, temperature, humidity, moisture):
    monitoring_node_id = get_or_create_monitoring_node(cur, device_id)
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
        (monitoring_node_id, VINEYARD_ID, temperature, humidity, moisture),
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

    with conn.cursor() as cur:
        ensure_vineyard(cur)
    conn.commit()

    while True:
        line = ser.readline()

        if not line:
            continue

        try:
            decoded = line.decode("utf-8").strip()
            data = json.loads(decoded)

            print(f"Received: {data}")

            with conn.cursor() as cur:
                insert_measurement(
                    cur,
                    data["id"],
                    data["temperature"],
                    data["humidity"],
                    data["moisture"],
                )
            conn.commit()
            print("Sensor measurement inserted into database.")

        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing data: {e}")
        except psycopg.Error as e:
            conn.rollback()
            print(f"Database error: {e}")
        time.sleep(1)


if __name__ == "__main__":
    main()
