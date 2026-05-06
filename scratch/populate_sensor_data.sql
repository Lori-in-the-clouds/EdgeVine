-- Script per generare dati simulati realistici per EdgeVine
-- Copia e incolla questo script nel tuo editor SQL (es. quello che hai già aperto)

-- 1. Assicuriamoci che il vigneto e le zone esistano (Idempotente)
INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude)
VALUES (1, 'Vineyard Toscana', 'EdgeVine', 200, 43.0573, 11.4891)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vine_zone (number, vineyard_id, external_id) VALUES 
(1, 1, 'S-01'), (2, 1, 'S-02'), (3, 1, 'S-03'), (4, 1, 'S-04'), (5, 1, 'S-05')
ON CONFLICT DO NOTHING;

-- 2. Pulizia opzionale dei vecchi dati (Deseleziona se vuoi mantenere i vecchi record)
-- DELETE FROM sensor_data;

-- 3. Generazione di 48 ore di dati storici per ogni zona
INSERT INTO sensor_data (
    sensor_id, 
    timestamp, 
    temperature, 
    humidity, 
    moisture, 
    grape_count, 
    health_status, 
    estimated_liters, 
    leaf_healthy_count, 
    leaf_stress_count, 
    leaf_disease_count,
    image_url
)
SELECT 
    vz.id as sensor_id,
    gs.ts as timestamp,
    round((20 + 8 * SIN((EXTRACT(HOUR FROM gs.ts) - 8) * PI() / 12) + (random() * 2 - 1))::numeric, 2) as temp,
    round((65 - 20 * SIN((EXTRACT(HOUR FROM gs.ts) - 8) * PI() / 12) + (random() * 5))::numeric, 2) as hum,
    round((25 + 20 * random())::numeric, 2) as moist,
    -- Lasciamo grape_count a NULL per i record con immagine, così l'AI li processa
    CASE WHEN random() > 0.7 THEN NULL ELSE (random() * 25 + 10)::int END as grape_count,
    CASE 
        WHEN vz.number = 2 AND gs.ts > NOW() - INTERVAL '6 hours' THEN 'Stress Detected'
        WHEN vz.number = 4 AND gs.ts > NOW() - INTERVAL '4 hours' THEN 'Disease Detected'
        ELSE 'Healthy'
    END as health_status,
    round((0.15 + random() * 0.5)::numeric, 2) as estimated_liters,
    (random() * 30 + 70)::int as leaf_healthy_count,
    (random() * 5)::int as leaf_stress_count,
    (random() * 2)::int as leaf_disease_count,
    -- Assegniamo le immagini presenti nella cartella public/captures
    CASE 
        WHEN random() > 0.7 THEN 
            CASE WHEN random() > 0.5 THEN '/captures/test_vigna_1.png' ELSE '/captures/test_vigna_2.png' END
        ELSE NULL 
    END as image_url
FROM 
    vine_zone vz,
    generate_series(NOW() - INTERVAL '48 hours', NOW(), INTERVAL '1 hour') AS gs(ts)
ON CONFLICT DO NOTHING;

-- 4. Un'ultima lettura "Live" molto recente per far apparire i dati aggiornati sulla dashboard
INSERT INTO sensor_data (sensor_id, timestamp, temperature, humidity, moisture, health_status)
SELECT 
    id, 
    NOW(), 
    24.5 + random(), 
    55.0 + random()*5, 
    30.0 + random()*2, 
    'Healthy'
FROM vine_zone;
