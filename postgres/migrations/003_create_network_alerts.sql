BEGIN;

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

COMMIT;
