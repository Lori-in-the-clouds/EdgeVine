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
    total_row_meters INTEGER NOT NULL DEFAULT 0,
    total_rows_count INTEGER NOT NULL DEFAULT 0,
    sectors_count INTEGER NOT NULL DEFAULT 0,
    sector_names TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vineyard_sector (
    id TEXT PRIMARY KEY,
    vineyard_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    perimeter JSONB NOT NULL,
    rows JSONB NOT NULL DEFAULT '[]'::jsonb,
    row_orientation FLOAT NOT NULL DEFAULT 0,
    row_spacing FLOAT NOT NULL DEFAULT 2,
    target_row_count INTEGER,
    show_rows BOOLEAN NOT NULL DEFAULT TRUE,
    color_theme JSONB NOT NULL DEFAULT '{"poly":"#228B22","rows":"#FFD700"}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    area_square_meters FLOAT NOT NULL DEFAULT 0,
    total_row_meters FLOAT NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vineyard_id, name),
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monitoring_node (
    id SERIAL PRIMARY KEY,
    vineyard_id INTEGER NOT NULL,
    sector_id TEXT,
    number INTEGER NOT NULL,
    external_id VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    latitude FLOAT,
    longitude FLOAT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vineyard_id, number),
    UNIQUE (vineyard_id, external_id),
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE,
    FOREIGN KEY (sector_id) REFERENCES vineyard_sector(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sensor_measurements (
    id SERIAL PRIMARY KEY,
    monitoring_node_id INTEGER NOT NULL,
    vineyard_id INTEGER NOT NULL,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL,
    moisture FLOAT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (monitoring_node_id) REFERENCES monitoring_node(id) ON DELETE CASCADE,
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vineyard_sector_vineyard ON vineyard_sector(vineyard_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_node_vineyard ON monitoring_node(vineyard_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_node_sector ON monitoring_node(sector_id);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_node_time ON sensor_measurements(monitoring_node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_vineyard_time ON sensor_measurements(vineyard_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS computer_vision_data (
    id SERIAL PRIMARY KEY,
    monitoring_node_id INTEGER,
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
    FOREIGN KEY (monitoring_node_id) REFERENCES monitoring_node(id) ON DELETE SET NULL,
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE,
    FOREIGN KEY (sensor_measurement_id) REFERENCES sensor_measurements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_computer_vision_node_time ON computer_vision_data(monitoring_node_id, timestamp DESC);
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

INSERT INTO vineyard_sector (
    id,
    vineyard_id,
    name,
    perimeter,
    rows,
    row_orientation,
    row_spacing,
    target_row_count,
    show_rows,
    color_theme,
    display_order,
    area_square_meters,
    total_row_meters,
    row_count
)
VALUES
(
    'north',
    1,
    'North Block',
    '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.4880,43.0584],[11.4888,43.0584],[11.4888,43.0578],[11.4880,43.0578],[11.4880,43.0584]]]},"properties":{}}'::jsonb,
    '[]'::jsonb,
    0,
    2,
    5,
    true,
    '{"poly":"#10B981","rows":"#FCD34D"}'::jsonb,
    1,
    3500,
    100,
    5
),
(
    'east',
    1,
    'East Block',
    '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.4898,43.0580],[11.4906,43.0580],[11.4906,43.0574],[11.4898,43.0574],[11.4898,43.0580]]]},"properties":{}}'::jsonb,
    '[]'::jsonb,
    0,
    2,
    5,
    true,
    '{"poly":"#3B82F6","rows":"#FFFFFF"}'::jsonb,
    2,
    3500,
    100,
    5
),
(
    'south',
    1,
    'South Block',
    '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.4896,43.0569],[11.4904,43.0569],[11.4904,43.0563],[11.4896,43.0563],[11.4896,43.0569]]]},"properties":{}}'::jsonb,
    '[]'::jsonb,
    0,
    2,
    5,
    true,
    '{"poly":"#EA580C","rows":"#22D3EE"}'::jsonb,
    3,
    3500,
    100,
    5
),
(
    'west',
    1,
    'West Block',
    '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.4875,43.0572],[11.4883,43.0572],[11.4883,43.0566],[11.4875,43.0566],[11.4875,43.0572]]]},"properties":{}}'::jsonb,
    '[]'::jsonb,
    0,
    2,
    5,
    true,
    '{"poly":"#7C3AED","rows":"#4ADE80"}'::jsonb,
    4,
    3500,
    100,
    5
),
(
    'central',
    1,
    'Central Block',
    '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.4887,43.0576],[11.4895,43.0576],[11.4895,43.0570],[11.4887,43.0570],[11.4887,43.0576]]]},"properties":{}}'::jsonb,
    '[]'::jsonb,
    0,
    2,
    5,
    true,
    '{"poly":"#DC2626","rows":"#FACC15"}'::jsonb,
    5,
    3500,
    100,
    5
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO monitoring_node (number, vineyard_id, sector_id, external_id, name, latitude, longitude) VALUES
(1, 1, 'north', 'S-01', 'S-01', 43.0581, 11.4884),
(2, 1, 'east', 'S-02', 'S-02', 43.0577, 11.4902),
(3, 1, 'south', 'S-03', 'S-03', 43.0566, 11.4900),
(4, 1, 'west', 'S-04', 'S-04', 43.0569, 11.4879),
(5, 1, 'central', 'S-05', 'S-05', 43.0573, 11.4891)
ON CONFLICT (vineyard_id, number) DO NOTHING;

INSERT INTO sensor_measurements (monitoring_node_id, vineyard_id, timestamp, temperature, humidity, moisture)
SELECT
    mn.id,
    mn.vineyard_id,
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
) AS reading(node_number, timestamp, temperature, humidity, moisture)
JOIN monitoring_node mn ON mn.vineyard_id = 1 AND mn.number = reading.node_number
ON CONFLICT DO NOTHING;
