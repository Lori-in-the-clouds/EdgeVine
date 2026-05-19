CREATE TABLE IF NOT EXISTS vineyard (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    altitude FLOAT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    province TEXT,
    region TEXT,
    address TEXT,
    email TEXT,
    name_vineyard VARCHAR(255),
    area TEXT DEFAULT '---',
    sectors JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_row_meters INTEGER NOT NULL DEFAULT 0,
    total_rows_count INTEGER NOT NULL DEFAULT 0,
    sectors_count INTEGER NOT NULL DEFAULT 0,
    sector_names TEXT
);

CREATE TABLE IF NOT EXISTS vine_zone (
    id SERIAL PRIMARY KEY,
    number INTEGER NOT NULL,
    vineyard_id INTEGER NOT NULL,
    name VARCHAR(255),
    external_id VARCHAR(50),
    latitude FLOAT,
    longitude FLOAT,
    sector_id VARCHAR(100),
    UNIQUE (vineyard_id, number),
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL,
    external_id VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (zone_id, external_id),
    FOREIGN KEY (zone_id) REFERENCES vine_zone(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_measurements (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER NOT NULL,
    zone_id INTEGER NOT NULL,
    vineyard_id INTEGER NOT NULL,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL,
    moisture FLOAT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE CASCADE,
    FOREIGN KEY (zone_id) REFERENCES vine_zone(id) ON DELETE CASCADE,
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sensor_zone ON sensor(zone_id);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_sensor_time ON sensor_measurements(sensor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_zone_time ON sensor_measurements(zone_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_vineyard_time ON sensor_measurements(vineyard_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS computer_vision_data (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER,
    zone_id INTEGER,
    vineyard_id INTEGER NOT NULL,
    sensor_measurement_id INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    image_url TEXT NOT NULL,
    processed_image_url TEXT,
    grape_count INTEGER,
    health_status TEXT,
    estimated_liters FLOAT,
    estimated_liters_min FLOAT,
    estimated_liters_max FLOAT,
    leaf_healthy_count INTEGER NOT NULL DEFAULT 0,
    leaf_stress_count INTEGER NOT NULL DEFAULT 0,
    leaf_disease_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE SET NULL,
    FOREIGN KEY (zone_id) REFERENCES vine_zone(id) ON DELETE CASCADE,
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE,
    FOREIGN KEY (sensor_measurement_id) REFERENCES sensor_measurements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_computer_vision_zone_time ON computer_vision_data(zone_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_computer_vision_vineyard_time ON computer_vision_data(vineyard_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_computer_vision_image ON computer_vision_data(image_url);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SEED DATA PER LA PRESENTAZIONE (EdgeVine)
INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude, name_vineyard)
VALUES (1, 'Vineyard Toscana', 'EdgeVine', 200, 43.0573, 11.4891, 'Vineyard Toscana')
ON CONFLICT (id) DO NOTHING;

SELECT setval(
    pg_get_serial_sequence('vineyard', 'id'),
    COALESCE((SELECT MAX(id) FROM vineyard), 1),
    true
);

INSERT INTO vine_zone (number, vineyard_id, external_id) VALUES
(1, 1, 'S-01'), (2, 1, 'S-02'), (3, 1, 'S-03'), (4, 1, 'S-04'), (5, 1, 'S-05')
ON CONFLICT DO NOTHING;

INSERT INTO sensor (zone_id, external_id, name)
SELECT id, COALESCE(external_id, 'zone-' || id), COALESCE(name, 'Sensor ' || number)
FROM vine_zone
WHERE vineyard_id = 1
ON CONFLICT (zone_id, external_id) DO NOTHING;

INSERT INTO sensor_measurements (sensor_id, zone_id, vineyard_id, timestamp, temperature, humidity, moisture)
SELECT
    s.id,
    vz.id,
    vz.vineyard_id,
    reading.timestamp,
    reading.temperature,
    reading.humidity,
    reading.moisture
FROM (
    VALUES
      (1, NOW() - INTERVAL '10 minutes', 24.5, 55.0, 35.5),
      (2, NOW() - INTERVAL '5 minutes', 26.1, 45.0, 22.0),
      (3, NOW() - INTERVAL '2 minutes', 27.5, 40.0, 15.5),
      (4, NOW() - INTERVAL '30 seconds', 23.0, 60.0, 40.0),
      (5, NOW() - INTERVAL '1 minute', 28.0, 38.0, 18.0)
) AS reading(zone_number, timestamp, temperature, humidity, moisture)
JOIN vine_zone vz ON vz.vineyard_id = 1 AND vz.number = reading.zone_number
JOIN sensor s ON s.zone_id = vz.id
ON CONFLICT DO NOTHING;
