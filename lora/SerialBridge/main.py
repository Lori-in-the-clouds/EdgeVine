import serial
import json
import psycopg
import time

def main():
    ser = serial.Serial('/dev/cu.usbmodemF412FA651F542', 9600, timeout=1)

    conn = psycopg.connect(
        host="localhost",
        port=5432,
        dbname="sensori",
        user="sensore_user",
        password="sensore_password"
    )

    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50),
            temperature FLOAT,
            humidity FLOAT,
            moisture FLOAT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    while True:
        line = ser.readline()

        if not line:
            continue

        try:
            decoded = line.decode('utf-8').strip()

            data = json.loads(decoded)

            print(f"Received: {data}")
            
            cur.execute("""
                INSERT INTO sensor_data (device_id, temperature, humidity, moisture, timestamp)
                VALUES (%s, %s, %s, %s, NOW())
            """, (data['id'], data['temperature'], data['humidity'], data['moisture']))

            conn.commit()
            print("Data inserted into database.")

        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing data: {e}")
        except psycopg.Error as e:
            print(f"Database error: {e}")
        time.sleep(1)

if __name__ == "__main__":
    main()
