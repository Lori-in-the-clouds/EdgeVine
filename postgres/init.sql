CREATE TABLE IF NOT EXISTS vineyard (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    altitude FLOAT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    name_vineyard VARCHAR(255),
    email VARCHAR(255),
    area VARCHAR(255),
    sectors TEXT,
    total_row_meters INTEGER,
    total_rows_count INTEGER,
    sectors_count INTEGER,
    sector_names TEXT,
    province VARCHAR(255),
    region VARCHAR(255),
    address VARCHAR(255)
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

CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL,
    moisture FLOAT NOT NULL,
    image_url TEXT,
    grape_count INTEGER,
    health_status TEXT,
    estimated_liters FLOAT,
    estimated_liters_min FLOAT,
    estimated_liters_max FLOAT,
    processed_image_url TEXT,
    leaf_healthy_count INTEGER DEFAULT 0,
    leaf_stress_count INTEGER DEFAULT 0,
    leaf_disease_count INTEGER DEFAULT 0,
    FOREIGN KEY (sensor_id) REFERENCES vine_zone(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL
);

-- SEED DATA PER LA PRESENTAZIONE (EdgeVine)
INSERT INTO vineyard (name, owner, altitude, latitude, longitude) 
VALUES ('Vineyard Toscana', 'EdgeVine', 200, 43.0573, 11.4891)
ON CONFLICT DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('vision', '{"depth_uncertainty_pct": 10}')
ON CONFLICT DO NOTHING;

INSERT INTO vine_zone (number, vineyard_id, external_id) VALUES 
(1, 1, 'S-01'), (2, 1, 'S-02'), (3, 1, 'S-03'), (4, 1, 'S-04'), (5, 1, 'S-05')
ON CONFLICT DO NOTHING;

INSERT INTO sensor_data (sensor_id, timestamp, temperature, humidity, moisture) VALUES
(1, NOW() - INTERVAL '10 minutes', 24.5, 55.0, 35.5), 
(2, NOW() - INTERVAL '5 minutes', 26.1, 45.0, 22.0),  
(3, NOW() - INTERVAL '2 minutes', 27.5, 40.0, 15.5),  
(4, NOW() - INTERVAL '30 seconds', 23.0, 60.0, 40.0), 
(5, NOW() - INTERVAL '1 minute', 28.0, 38.0, 18.0);
