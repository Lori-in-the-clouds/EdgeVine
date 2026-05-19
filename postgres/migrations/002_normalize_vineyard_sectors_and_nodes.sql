-- Normalize dashboard persistence around the final domain model:
-- vineyard -> vineyard_sector -> monitoring_node -> telemetry/CV data.
--
-- This migrates existing dashboard data from:
-- - vineyard.sectors JSONB into vineyard_sector rows
-- - vine_zone rows into monitoring_node rows
-- - sensor_measurements.zone_id/sensor_id into sensor_measurements.monitoring_node_id
-- - computer_vision_data.zone_id/sensor_id into computer_vision_data.monitoring_node_id

BEGIN;

ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS name_vineyard VARCHAR(255);
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS area TEXT DEFAULT '---';
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS total_row_meters INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS total_rows_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sectors_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sector_names TEXT;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE vineyard
SET name_vineyard = name
WHERE name_vineyard IS NULL;

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

CREATE INDEX IF NOT EXISTS idx_vineyard_sector_vineyard ON vineyard_sector(vineyard_id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vineyard'
          AND column_name = 'sectors'
    ) THEN
        EXECUTE $sql$
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
                total_row_meters,
                row_count
            )
            SELECT
                COALESCE(sector.value->>'id', 'sector-' || v.id || '-' || sector.ordinality::text),
                v.id,
                COALESCE(sector.value->>'name', 'Sector ' || sector.ordinality::text),
                COALESCE(sector.value->'perimeter', '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[]},"properties":{}}'::jsonb),
                COALESCE(sector.value->'rows', '[]'::jsonb),
                COALESCE(NULLIF(sector.value->>'rowOrientation', '')::float8, 0),
                COALESCE(NULLIF(sector.value->>'rowSpacing', '')::float8, 2),
                NULLIF(sector.value->>'targetRowCount', '')::integer,
                COALESCE(NULLIF(sector.value->>'showRows', '')::boolean, true),
                COALESCE(sector.value->'colorTheme', '{"poly":"#228B22","rows":"#FFD700"}'::jsonb),
                sector.ordinality::integer,
                COALESCE((
                    SELECT SUM(COALESCE(NULLIF(row.value->>'length', '')::float8, 0))
                    FROM jsonb_array_elements(COALESCE(sector.value->'rows', '[]'::jsonb)) AS row(value)
                ), 0),
                jsonb_array_length(COALESCE(sector.value->'rows', '[]'::jsonb))
            FROM vineyard v
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v.sectors, '[]'::jsonb)) WITH ORDINALITY AS sector(value, ordinality)
            ON CONFLICT (id) DO UPDATE SET
                vineyard_id = EXCLUDED.vineyard_id,
                name = EXCLUDED.name,
                perimeter = EXCLUDED.perimeter,
                rows = EXCLUDED.rows,
                row_orientation = EXCLUDED.row_orientation,
                row_spacing = EXCLUDED.row_spacing,
                target_row_count = EXCLUDED.target_row_count,
                show_rows = EXCLUDED.show_rows,
                color_theme = EXCLUDED.color_theme,
                display_order = EXCLUDED.display_order,
                total_row_meters = EXCLUDED.total_row_meters,
                row_count = EXCLUDED.row_count,
                updated_at = CURRENT_TIMESTAMP
        $sql$;
    END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_monitoring_node_vineyard ON monitoring_node(vineyard_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_node_sector ON monitoring_node(sector_id);

DO $$
BEGIN
    IF to_regclass('public.vine_zone') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO monitoring_node (
                id,
                vineyard_id,
                sector_id,
                number,
                external_id,
                name,
                latitude,
                longitude,
                created_at
            )
            SELECT
                vz.id,
                vz.vineyard_id,
                vs.id,
                vz.number,
                COALESCE(vz.external_id, 'S-' || lpad(vz.number::text, 2, '0')),
                COALESCE(vz.name, vz.external_id, 'S-' || lpad(vz.number::text, 2, '0')),
                vz.latitude,
                vz.longitude,
                CURRENT_TIMESTAMP
            FROM vine_zone vz
            LEFT JOIN vineyard_sector vs
              ON vs.vineyard_id = vz.vineyard_id
             AND (vs.id = vz.sector_id OR vs.name = vz.sector_id)
            ON CONFLICT (id) DO UPDATE SET
                vineyard_id = EXCLUDED.vineyard_id,
                sector_id = EXCLUDED.sector_id,
                number = EXCLUDED.number,
                external_id = EXCLUDED.external_id,
                name = EXCLUDED.name,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                updated_at = CURRENT_TIMESTAMP
        $sql$;
    END IF;
END $$;

SELECT setval(
    pg_get_serial_sequence('monitoring_node', 'id'),
    COALESCE((SELECT MAX(id) FROM monitoring_node), 1),
    true
);

ALTER TABLE sensor_measurements ADD COLUMN IF NOT EXISTS monitoring_node_id INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sensor_measurements'
          AND column_name = 'zone_id'
    ) THEN
        EXECUTE $sql$
            UPDATE sensor_measurements sm
            SET monitoring_node_id = mn.id
            FROM monitoring_node mn
            WHERE sm.monitoring_node_id IS NULL
              AND sm.zone_id = mn.id
        $sql$;
    END IF;

    IF to_regclass('public.sensor') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'sensor_measurements'
             AND column_name = 'sensor_id'
       ) THEN
        EXECUTE $sql$
            UPDATE sensor_measurements sm
            SET monitoring_node_id = mn.id
            FROM sensor s
            JOIN monitoring_node mn ON mn.id = s.zone_id
            WHERE sm.monitoring_node_id IS NULL
              AND sm.sensor_id = s.id
        $sql$;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM sensor_measurements WHERE monitoring_node_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot normalize sensor_measurements: some rows could not be mapped to monitoring_node';
    END IF;
END $$;

ALTER TABLE sensor_measurements DROP CONSTRAINT IF EXISTS sensor_measurements_sensor_id_fkey;
ALTER TABLE sensor_measurements DROP CONSTRAINT IF EXISTS sensor_measurements_zone_id_fkey;
ALTER TABLE sensor_measurements DROP COLUMN IF EXISTS sensor_id;
ALTER TABLE sensor_measurements DROP COLUMN IF EXISTS zone_id;
ALTER TABLE sensor_measurements ALTER COLUMN monitoring_node_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sensor_measurements_monitoring_node_id_fkey'
    ) THEN
        ALTER TABLE sensor_measurements
            ADD CONSTRAINT sensor_measurements_monitoring_node_id_fkey
            FOREIGN KEY (monitoring_node_id) REFERENCES monitoring_node(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sensor_measurements_node_time ON sensor_measurements(monitoring_node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_measurements_vineyard_time ON sensor_measurements(vineyard_id, timestamp DESC);

ALTER TABLE computer_vision_data ADD COLUMN IF NOT EXISTS monitoring_node_id INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'computer_vision_data'
          AND column_name = 'zone_id'
    ) THEN
        EXECUTE $sql$
            UPDATE computer_vision_data cv
            SET monitoring_node_id = mn.id
            FROM monitoring_node mn
            WHERE cv.monitoring_node_id IS NULL
              AND cv.zone_id = mn.id
        $sql$;
    END IF;

    IF to_regclass('public.sensor') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'computer_vision_data'
             AND column_name = 'sensor_id'
       ) THEN
        EXECUTE $sql$
            UPDATE computer_vision_data cv
            SET monitoring_node_id = mn.id
            FROM sensor s
            JOIN monitoring_node mn ON mn.id = s.zone_id
            WHERE cv.monitoring_node_id IS NULL
              AND cv.sensor_id = s.id
        $sql$;
    END IF;
END $$;

ALTER TABLE computer_vision_data DROP CONSTRAINT IF EXISTS computer_vision_data_sensor_id_fkey;
ALTER TABLE computer_vision_data DROP CONSTRAINT IF EXISTS computer_vision_data_zone_id_fkey;
ALTER TABLE computer_vision_data DROP COLUMN IF EXISTS sensor_id;
ALTER TABLE computer_vision_data DROP COLUMN IF EXISTS zone_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'computer_vision_data_monitoring_node_id_fkey'
    ) THEN
        ALTER TABLE computer_vision_data
            ADD CONSTRAINT computer_vision_data_monitoring_node_id_fkey
            FOREIGN KEY (monitoring_node_id) REFERENCES monitoring_node(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_computer_vision_node_time ON computer_vision_data(monitoring_node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_computer_vision_vineyard_time ON computer_vision_data(vineyard_id, timestamp DESC);

DROP TABLE IF EXISTS sensor;
DROP TABLE IF EXISTS vine_zone;
ALTER TABLE vineyard DROP COLUMN IF EXISTS sectors;

COMMIT;
