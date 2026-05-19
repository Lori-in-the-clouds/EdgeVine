import psycopg
import datetime
import random

conn_info = "host=localhost port=5432 dbname=sensori user=sensore_user password=sensore_password"

try:
    with psycopg.connect(conn_info) as conn:
        with conn.cursor() as cur:
            # 1. Clear old data
            print("Cleaning old sensor data...")
            cur.execute("DELETE FROM computer_vision_data")
            cur.execute("DELETE FROM sensor_measurements")
            
            # 2. Get active vine zones
            cur.execute("SELECT id FROM vine_zone LIMIT 5")
            zones = [row[0] for row in cur.fetchall()]
            
            if not zones:
                print("No vine zones found. Seeding first...")
                cur.execute("INSERT INTO vine_zone (number, vineyard_id) VALUES (1, 1), (2, 1), (3, 1), (4, 1), (5, 1) ON CONFLICT DO NOTHING")
                cur.execute("SELECT id FROM vine_zone LIMIT 5")
                zones = [row[0] for row in cur.fetchall()]

            print(f"Seeding {len(zones)} zones...")

            # 3. Insert History (last 24h)
            now = datetime.datetime.now()
            for h in range(24, 0, -1):
                ts = now - datetime.timedelta(hours=h)
                for zone_id in zones:
                    temp = 20 + random.random() * 10
                    hum = 40 + random.random() * 20
                    moist = 25 + random.random() * 15
                    cur.execute(
                        """
                        INSERT INTO sensor (zone_id, external_id, name)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (zone_id, external_id)
                        DO UPDATE SET name = COALESCE(EXCLUDED.name, sensor.name)
                        RETURNING id
                        """,
                        (zone_id, f"zone-{zone_id}", f"Sensor {zone_id}")
                    )
                    sensor_id = cur.fetchone()[0]
                    cur.execute(
                        """
                        INSERT INTO sensor_measurements
                          (sensor_id, zone_id, vineyard_id, temperature, humidity, moisture, timestamp)
                        SELECT %s, vz.id, vz.vineyard_id, %s, %s, %s, %s
                        FROM vine_zone vz
                        WHERE vz.id = %s
                        """,
                        (sensor_id, temp, hum, moist, ts, zone_id)
                    )

            # 4. Insert Live Data (Latest for each zone)
            # Special case for zone 2 (index 1): Stress!
            for i, zone_id in enumerate(zones):
                if i == 1: # Zone 2
                    temp, hum, moist = 28.5, 35.0, 14.2 # Stress
                else:
                    temp, hum, moist = 24.0 + random.random()*2, 50.0 + random.random()*5, 30.0 + random.random()*5
                
                cur.execute(
                    """
                    INSERT INTO sensor (zone_id, external_id, name)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (zone_id, external_id)
                    DO UPDATE SET name = COALESCE(EXCLUDED.name, sensor.name)
                    RETURNING id
                    """,
                    (zone_id, f"zone-{zone_id}", f"Sensor {zone_id}")
                )
                sensor_id = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO sensor_measurements
                      (sensor_id, zone_id, vineyard_id, temperature, humidity, moisture, timestamp)
                    SELECT %s, vz.id, vz.vineyard_id, %s, %s, %s, %s
                    FROM vine_zone vz
                    WHERE vz.id = %s
                    """,
                    (sensor_id, temp, hum, moist, now, zone_id)
                )

            conn.commit()
            print("Successfully seeded 24h history and live alert data.")

except Exception as e:
    print(f"Error connecting to database: {e}")
    print("Make sure Docker is running and Postgres is available on port 5432.")
