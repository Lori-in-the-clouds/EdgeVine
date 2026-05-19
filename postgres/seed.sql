-- Demo seed data for EdgeVine.
-- Inserts one vineyard, five vineyard sectors, one monitoring node per sector,
-- and hourly sensor measurements from 2025-01-01 00:00 until the current hour.

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
        500,
        25,
        5,
        'North Block, East Block, South Block, West Block, Central Block'
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
        total_row_meters = EXCLUDED.total_row_meters,
        total_rows_count = EXCLUDED.total_rows_count,
        sectors_count = EXCLUDED.sectors_count,
        sector_names = EXCLUDED.sector_names,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id
),
seed_sectors AS (
    SELECT *
    FROM (
        VALUES
            ('north', 1, 'North Block', 43.0581, 11.4884, '#10B981', '#FCD34D'),
            ('east', 2, 'East Block', 43.0577, 11.4902, '#3B82F6', '#FFFFFF'),
            ('south', 3, 'South Block', 43.0566, 11.4900, '#EA580C', '#22D3EE'),
            ('west', 4, 'West Block', 43.0569, 11.4879, '#7C3AED', '#4ADE80'),
            ('central', 5, 'Central Block', 43.0573, 11.4891, '#DC2626', '#FACC15')
    ) AS sector(id, display_order, name, center_lat, center_lng, poly_color, rows_color)
),
sector_payloads AS (
    SELECT
        sector.id,
        seeded_vineyard.id AS vineyard_id,
        sector.display_order,
        sector.name,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', jsonb_build_object(
                'type', 'Polygon',
                'coordinates', jsonb_build_array(jsonb_build_array(
                    jsonb_build_array(sector.center_lng - 0.0004, sector.center_lat + 0.0003),
                    jsonb_build_array(sector.center_lng + 0.0004, sector.center_lat + 0.0003),
                    jsonb_build_array(sector.center_lng + 0.0004, sector.center_lat - 0.0003),
                    jsonb_build_array(sector.center_lng - 0.0004, sector.center_lat - 0.0003),
                    jsonb_build_array(sector.center_lng - 0.0004, sector.center_lat + 0.0003)
                ))
            ),
            'properties', jsonb_build_object()
        ) AS perimeter,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', 'R-' || lpad(((sector.display_order - 1) * 5 + row_index)::text, 2, '0'),
                    'points', jsonb_build_array(
                        jsonb_build_array(sector.center_lat - 0.00025 + row_index * 0.00008, sector.center_lng - 0.0003),
                        jsonb_build_array(sector.center_lat - 0.00025 + row_index * 0.00008, sector.center_lng + 0.0003)
                    ),
                    'length', 20
                )
                ORDER BY row_index
            )
            FROM generate_series(1, 5) AS row_index
        ) AS rows,
        jsonb_build_object('poly', sector.poly_color, 'rows', sector.rows_color) AS color_theme
    FROM seed_sectors sector
    CROSS JOIN seeded_vineyard
),
upserted_sectors AS (
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
    SELECT
        id,
        vineyard_id,
        name,
        perimeter,
        rows,
        0,
        2,
        5,
        true,
        color_theme,
        display_order,
        3500,
        100,
        5
    FROM sector_payloads
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        perimeter = EXCLUDED.perimeter,
        rows = EXCLUDED.rows,
        row_orientation = EXCLUDED.row_orientation,
        row_spacing = EXCLUDED.row_spacing,
        target_row_count = EXCLUDED.target_row_count,
        show_rows = EXCLUDED.show_rows,
        color_theme = EXCLUDED.color_theme,
        display_order = EXCLUDED.display_order,
        area_square_meters = EXCLUDED.area_square_meters,
        total_row_meters = EXCLUDED.total_row_meters,
        row_count = EXCLUDED.row_count,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id, vineyard_id, name, display_order
),
seed_nodes AS (
    SELECT *
    FROM (
        VALUES
            (1, 'north', 'S-01', 'S-01', 43.0581, 11.4884),
            (2, 'east', 'S-02', 'S-02', 43.0577, 11.4902),
            (3, 'south', 'S-03', 'S-03', 43.0566, 11.4900),
            (4, 'west', 'S-04', 'S-04', 43.0569, 11.4879),
            (5, 'central', 'S-05', 'S-05', 43.0573, 11.4891)
    ) AS node(number, sector_id, external_id, name, latitude, longitude)
),
upserted_nodes AS (
    INSERT INTO monitoring_node (
        vineyard_id,
        sector_id,
        number,
        external_id,
        name,
        latitude,
        longitude
    )
    SELECT
        seeded_vineyard.id,
        node.sector_id,
        node.number,
        node.external_id,
        node.name,
        node.latitude,
        node.longitude
    FROM seed_nodes node
    CROSS JOIN seeded_vineyard
    ON CONFLICT (vineyard_id, number) DO UPDATE SET
        sector_id = EXCLUDED.sector_id,
        external_id = EXCLUDED.external_id,
        name = EXCLUDED.name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id, vineyard_id, number
),
hourly_samples AS (
    SELECT
        node.id AS monitoring_node_id,
        node.vineyard_id,
        sample.timestamp,
        node.number AS node_number,
        EXTRACT(HOUR FROM sample.timestamp)::integer AS hour_of_day,
        EXTRACT(DOY FROM sample.timestamp)::integer AS day_of_year
    FROM upserted_nodes node
    CROSS JOIN generate_series(
        TIMESTAMP '2025-01-01 00:00:00',
        date_trunc('hour', NOW()),
        INTERVAL '1 hour'
    ) AS sample(timestamp)
)
INSERT INTO sensor_measurements (
    monitoring_node_id,
    vineyard_id,
    timestamp,
    temperature,
    humidity,
    moisture
)
SELECT
    sample.monitoring_node_id,
    sample.vineyard_id,
    sample.timestamp,
    round((
        18
        + 9 * sin((sample.hour_of_day - 7) * pi() / 12)
        + 5 * sin((sample.day_of_year - 172) * 2 * pi() / 365)
        + sample.node_number * 0.35
    )::numeric, 2)::float8 AS temperature,
    round((
        62
        - 14 * sin((sample.hour_of_day - 7) * pi() / 12)
        - 6 * sin((sample.day_of_year - 172) * 2 * pi() / 365)
        + sample.node_number * 0.4
    )::numeric, 2)::float8 AS humidity,
    round((
        34
        + 8 * sin((sample.day_of_year + sample.node_number * 9) * 2 * pi() / 30)
        - 4 * sin(sample.hour_of_day * pi() / 12)
        - sample.node_number * 0.8
    )::numeric, 2)::float8 AS moisture
FROM hourly_samples sample
WHERE NOT EXISTS (
    SELECT 1
    FROM sensor_measurements existing
    WHERE existing.monitoring_node_id = sample.monitoring_node_id
      AND existing.timestamp = sample.timestamp
);

SELECT setval(
    pg_get_serial_sequence('vineyard', 'id'),
    COALESCE((SELECT MAX(id) FROM vineyard), 1),
    true
);

SELECT setval(
    pg_get_serial_sequence('monitoring_node', 'id'),
    COALESCE((SELECT MAX(id) FROM monitoring_node), 1),
    true
);
