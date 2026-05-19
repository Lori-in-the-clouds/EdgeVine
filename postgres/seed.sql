-- Demo seed data for EdgeVine.
-- Inserts one vineyard, five vine zones, one sensor per zone, and hourly
-- sensor measurements from 2025-01-01 00:00 until the current hour.

WITH seeded_vineyard AS (
    INSERT INTO vineyard (
        id,
        name,
        owner,
        altitude,
        latitude,
        longitude,
        province,
        region,
        address,
        email,
        name_vineyard,
        area,
        sectors,
        total_row_meters,
        total_rows_count,
        sectors_count,
        sector_names
    )
    VALUES (
        1,
        'Vineyard Toscana',
        'EdgeVine',
        200,
        43.0573,
        11.4891,
        'Siena',
        'Tuscany',
        'Val d''Orcia, Tuscany',
        'demo@edgevine.local',
        'Vineyard Toscana',
        'Demo vineyard',
        '[]'::jsonb,
        500,
        25,
        5,
        'North, East, South, West, Central'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        owner = EXCLUDED.owner,
        altitude = EXCLUDED.altitude,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        province = EXCLUDED.province,
        region = EXCLUDED.region,
        address = EXCLUDED.address,
        email = EXCLUDED.email,
        name_vineyard = EXCLUDED.name_vineyard,
        area = EXCLUDED.area,
        sectors = EXCLUDED.sectors,
        total_row_meters = EXCLUDED.total_row_meters,
        total_rows_count = EXCLUDED.total_rows_count,
        sectors_count = EXCLUDED.sectors_count,
        sector_names = EXCLUDED.sector_names
    RETURNING id
),
seed_zones AS (
    SELECT *
    FROM (
        VALUES
            (1, 'North Block', 'S-01', 43.0581, 11.4884, 'north'),
            (2, 'East Block', 'S-02', 43.0577, 11.4902, 'east'),
            (3, 'South Block', 'S-03', 43.0566, 11.4900, 'south'),
            (4, 'West Block', 'S-04', 43.0569, 11.4879, 'west'),
            (5, 'Central Block', 'S-05', 43.0573, 11.4891, 'central')
    ) AS zone(number, name, external_id, latitude, longitude, sector_id)
),
upserted_zones AS (
    INSERT INTO vine_zone (
        number,
        vineyard_id,
        name,
        external_id,
        latitude,
        longitude,
        sector_id
    )
    SELECT
        zone.number,
        seeded_vineyard.id,
        zone.name,
        zone.external_id,
        zone.latitude,
        zone.longitude,
        zone.sector_id
    FROM seed_zones zone
    CROSS JOIN seeded_vineyard
    ON CONFLICT (vineyard_id, number) DO UPDATE SET
        name = EXCLUDED.name,
        external_id = EXCLUDED.external_id,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        sector_id = EXCLUDED.sector_id
    RETURNING id, number, vineyard_id, external_id, name
),
upserted_sensors AS (
    INSERT INTO sensor (
        zone_id,
        external_id,
        name
    )
    SELECT
        zone.id,
        zone.external_id,
        'Sensor ' || zone.external_id
    FROM upserted_zones zone
    ON CONFLICT (zone_id, external_id) DO UPDATE SET
        name = EXCLUDED.name
    RETURNING id, zone_id, external_id
),
hourly_samples AS (
    SELECT
        sensor.id AS sensor_id,
        zone.id AS zone_id,
        zone.vineyard_id,
        sample.timestamp,
        zone.number AS zone_number,
        EXTRACT(HOUR FROM sample.timestamp)::integer AS hour_of_day,
        EXTRACT(DOY FROM sample.timestamp)::integer AS day_of_year
    FROM upserted_zones zone
    JOIN upserted_sensors sensor ON sensor.zone_id = zone.id
    CROSS JOIN generate_series(
        TIMESTAMP '2025-01-01 00:00:00',
        date_trunc('hour', NOW()),
        INTERVAL '1 hour'
    ) AS sample(timestamp)
)
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
    sample.sensor_id,
    sample.zone_id,
    sample.vineyard_id,
    sample.timestamp,
    round((
        18
        + 9 * sin((sample.hour_of_day - 7) * pi() / 12)
        + 5 * sin((sample.day_of_year - 172) * 2 * pi() / 365)
        + sample.zone_number * 0.35
    )::numeric, 2)::float8 AS temperature,
    round((
        62
        - 14 * sin((sample.hour_of_day - 7) * pi() / 12)
        - 6 * sin((sample.day_of_year - 172) * 2 * pi() / 365)
        + sample.zone_number * 0.4
    )::numeric, 2)::float8 AS humidity,
    round((
        34
        + 8 * sin((sample.day_of_year + sample.zone_number * 9) * 2 * pi() / 30)
        - 4 * sin(sample.hour_of_day * pi() / 12)
        - sample.zone_number * 0.8
    )::numeric, 2)::float8 AS moisture
FROM hourly_samples sample
WHERE NOT EXISTS (
    SELECT 1
    FROM sensor_measurements existing
    WHERE existing.sensor_id = sample.sensor_id
      AND existing.zone_id = sample.zone_id
      AND existing.timestamp = sample.timestamp
);

SELECT setval(
    pg_get_serial_sequence('vineyard', 'id'),
    COALESCE((SELECT MAX(id) FROM vineyard), 1),
    true
);
