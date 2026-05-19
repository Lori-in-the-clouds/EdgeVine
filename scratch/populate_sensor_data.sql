-- Script per generare dati simulati realistici per EdgeVine.
-- Usa le tabelle separate sensor_measurements e computer_vision_data.

-- 1. Assicuriamoci che il vigneto, le zone e i sensori esistano.
INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude)
VALUES (1, 'Vineyard Toscana', 'EdgeVine', 200, 43.0573, 11.4891)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vine_zone (number, vineyard_id, external_id) VALUES
(1, 1, 'S-01'), (2, 1, 'S-02'), (3, 1, 'S-03'), (4, 1, 'S-04'), (5, 1, 'S-05')
ON CONFLICT DO NOTHING;

INSERT INTO sensor (zone_id, external_id, name)
SELECT id, COALESCE(external_id, 'zone-' || id), COALESCE(name, 'Sensor ' || number)
FROM vine_zone
WHERE vineyard_id = 1
ON CONFLICT (zone_id, external_id) DO NOTHING;

-- 2. Pulizia opzionale dei vecchi dati.
-- DELETE FROM computer_vision_data;
-- DELETE FROM sensor_measurements;

-- 3. Generazione di 48 ore di dati storici per ogni zona.
WITH generated_measurements AS (
    INSERT INTO sensor_measurements (
        sensor_id,
        zone_id,
        vineyard_id,
        timestamp,
        temperature,
        humidity,
        moisture
    )
    SELECT
        s.id,
        vz.id,
        vz.vineyard_id,
        gs.ts,
        round((20 + 8 * SIN((EXTRACT(HOUR FROM gs.ts) - 8) * PI() / 12) + (random() * 2 - 1))::numeric, 2),
        round((65 - 20 * SIN((EXTRACT(HOUR FROM gs.ts) - 8) * PI() / 12) + (random() * 5))::numeric, 2),
        round((25 + 20 * random())::numeric, 2)
    FROM
        vine_zone vz
        JOIN sensor s ON s.zone_id = vz.id
        CROSS JOIN generate_series(NOW() - INTERVAL '48 hours', NOW(), INTERVAL '1 hour') AS gs(ts)
    WHERE vz.vineyard_id = 1
    RETURNING id, sensor_id, zone_id, vineyard_id, timestamp
)
INSERT INTO computer_vision_data (
    sensor_id,
    zone_id,
    vineyard_id,
    sensor_measurement_id,
    timestamp,
    grape_count,
    health_status,
    estimated_liters,
    leaf_healthy_count,
    leaf_stress_count,
    leaf_disease_count,
    image_url
)
SELECT
    gm.sensor_id,
    gm.zone_id,
    gm.vineyard_id,
    gm.id,
    gm.timestamp,
    CASE WHEN random() > 0.7 THEN NULL ELSE (random() * 25 + 10)::int END,
    CASE
        WHEN vz.number = 2 AND gm.timestamp > NOW() - INTERVAL '6 hours' THEN 'Stress Detected'
        WHEN vz.number = 4 AND gm.timestamp > NOW() - INTERVAL '4 hours' THEN 'Disease Detected'
        ELSE 'Healthy'
    END,
    round((0.15 + random() * 0.5)::numeric, 2),
    (random() * 30 + 70)::int,
    (random() * 5)::int,
    (random() * 2)::int,
    CASE WHEN random() > 0.5 THEN '/captures/test_vigna_1.png' ELSE '/captures/test_vigna_2.png' END
FROM generated_measurements gm
JOIN vine_zone vz ON vz.id = gm.zone_id
WHERE random() > 0.6;

-- 4. Un'ultima lettura "Live" molto recente per far apparire i dati aggiornati sulla dashboard.
INSERT INTO sensor_measurements (sensor_id, zone_id, vineyard_id, timestamp, temperature, humidity, moisture)
SELECT
    s.id,
    vz.id,
    vz.vineyard_id,
    NOW(),
    24.5 + random(),
    55.0 + random() * 5,
    30.0 + random() * 2
FROM vine_zone vz
JOIN sensor s ON s.zone_id = vz.id
WHERE vz.vineyard_id = 1;
