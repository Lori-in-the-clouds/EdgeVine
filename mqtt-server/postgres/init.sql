CREATE TABLE IF NOT EXISTS vineyard (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    altitude FLOAT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL
);

CREATE TABLE IF NOT EXISTS vine_zone (
    id SERIAL PRIMARY KEY,
    number INTEGER NOT NULL,
    vineyard_id INTEGER NOT NULL,
    UNIQUE (vineyard_id, number),
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    vine_zone_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL,
    moisture FLOAT NOT NULL,
    FOREIGN KEY (vine_zone_id) REFERENCES vine_zone(id) ON DELETE CASCADE
);

-- SEED DATA PER LA PRESENTAZIONE (EdgeVine)
INSERT INTO vineyard (name, owner, altitude, latitude, longitude) 
VALUES ('Vineyard Toscana', 'EdgeVine', 200, 43.0573, 11.4891)
ON CONFLICT DO NOTHING;

INSERT INTO vine_zone (number, vineyard_id) VALUES 
(1, 1), (2, 1), (3, 1), (4, 1), (5, 1)
ON CONFLICT DO NOTHING;

INSERT INTO sensor_data (vine_zone_id, timestamp, temperature, humidity, moisture) VALUES
(1, NOW() - INTERVAL '10 minutes', 24.5, 55.0, 35.5), -- Zona 1: Verde (Moisture > 30)
(2, NOW() - INTERVAL '5 minutes', 26.1, 45.0, 22.0),  -- Zona 2: Arancione (Moisture 20-30)
(3, NOW() - INTERVAL '2 minutes', 27.5, 40.0, 15.5),  -- Zona 3: Rosso (Moisture < 20)
(4, NOW() - INTERVAL '30 seconds', 23.0, 60.0, 40.0), -- Zona 4: Verde
(5, NOW() - INTERVAL '1 minute', 28.0, 38.0, 18.0);   -- Zona 5: Rosso
