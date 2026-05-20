-- Split the legacy mixed sensor_data table into dedicated telemetry and vision tables.
-- This migration is intentionally additive: it leaves sensor_data in place for manual
-- verification/backups and moves application reads/writes to the new tables.

ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS name_vineyard VARCHAR(255);
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS area TEXT DEFAULT '---';
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sectors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS total_row_meters INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS total_rows_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sectors_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sector_names TEXT;

UPDATE vineyard
SET name_vineyard = name
WHERE name_vineyard IS NULL;

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

INSERT INTO sensor (zone_id, external_id, name)
SELECT id, COALESCE(external_id, 'zone-' || id), COALESCE(name, 'Sensor ' || number)
FROM vine_zone
ON CONFLICT (zone_id, external_id) DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.sensor_data') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS estimated_liters_min FLOAT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS estimated_liters_max FLOAT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS image_url TEXT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS grape_count INTEGER';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS health_status TEXT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS estimated_liters FLOAT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS processed_image_url TEXT';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS leaf_healthy_count INTEGER DEFAULT 0';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS leaf_stress_count INTEGER DEFAULT 0';
        EXECUTE 'ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS leaf_disease_count INTEGER DEFAULT 0';

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'sensor_data'
              AND column_name = 'sensor_id'
        ) THEN
            EXECUTE $sql$
            INSERT INTO sensor_measurements (
                sensor_id,
                zone_id,
                vineyard_id,
                temperature,
                humidity,
                moisture,
                timestamp
            )
            SELECT
                s.id,
                vz.id,
                vz.vineyard_id,
                sd.temperature,
                sd.humidity,
                sd.moisture,
                sd.timestamp
            FROM sensor_data sd
            JOIN vine_zone vz ON vz.id = sd.sensor_id
            JOIN sensor s ON s.zone_id = vz.id
            WHERE sd.temperature IS NOT NULL
              AND sd.humidity IS NOT NULL
              AND sd.moisture IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM sensor_measurements sm
                  WHERE sm.sensor_id = s.id
                    AND sm.zone_id = vz.id
                    AND sm.timestamp = sd.timestamp
                    AND sm.temperature = sd.temperature
                    AND sm.humidity = sd.humidity
                    AND sm.moisture = sd.moisture
              )
            $sql$;

            EXECUTE $sql$
            INSERT INTO computer_vision_data (
                sensor_id,
                zone_id,
                vineyard_id,
                sensor_measurement_id,
                timestamp,
                image_url,
                processed_image_url,
                grape_count,
                health_status,
                estimated_liters,
                estimated_liters_min,
                estimated_liters_max,
                leaf_healthy_count,
                leaf_stress_count,
                leaf_disease_count
            )
            SELECT
                s.id,
                vz.id,
                vz.vineyard_id,
                sm.id,
                sd.timestamp,
                sd.image_url,
                sd.processed_image_url,
                sd.grape_count,
                sd.health_status,
                sd.estimated_liters,
                sd.estimated_liters_min,
                sd.estimated_liters_max,
                COALESCE(sd.leaf_healthy_count, 0),
                COALESCE(sd.leaf_stress_count, 0),
                COALESCE(sd.leaf_disease_count, 0)
            FROM sensor_data sd
            JOIN vine_zone vz ON vz.id = sd.sensor_id
            JOIN sensor s ON s.zone_id = vz.id
            LEFT JOIN LATERAL (
                SELECT id
                FROM sensor_measurements sm
                WHERE sm.sensor_id = s.id
                  AND sm.zone_id = vz.id
                  AND sm.timestamp = sd.timestamp
                ORDER BY sm.id DESC
                LIMIT 1
            ) sm ON true
            WHERE sd.image_url IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM computer_vision_data cv
                  WHERE cv.zone_id = vz.id
                    AND cv.timestamp = sd.timestamp
                    AND cv.image_url = sd.image_url
              )
            $sql$;
        END IF;

        COMMENT ON TABLE sensor_data IS 'Legacy mixed telemetry/vision table retained after splitting data into sensor_measurements and computer_vision_data.';
    END IF;
END $$;
