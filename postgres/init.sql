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

CREATE TABLE IF NOT EXISTS network_alerts (
    id SERIAL PRIMARY KEY,
    vineyard_id INTEGER NOT NULL,
    source_latitude FLOAT NOT NULL,
    source_longitude FLOAT NOT NULL,
    alert_type VARCHAR(32) NOT NULL CHECK (alert_type IN ('infestation', 'hydraulic', 'environmental')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_network_alerts_vineyard_time ON network_alerts(vineyard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_alerts_position ON network_alerts(source_latitude, source_longitude);
CREATE INDEX IF NOT EXISTS idx_network_alerts_type_time ON network_alerts(alert_type, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
