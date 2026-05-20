# EdgeVine

## Database layout

The dashboard keeps the existing vineyard hierarchy:

- `vineyard`
- `vineyard_sector`
- `monitoring_node`
- `sensor_measurements`
- `computer_vision_data`

`vineyard_sector` stores each configured sector/block, including its polygon and row configuration/geometry. Rows are sector-level data and are not stored in a separate table.

`monitoring_node` stores the field nodes currently shown as sentinels in the dashboard. A vineyard can have multiple monitoring nodes, and each node can produce telemetry samples and camera captures.

`sensor_measurements` stores only node telemetry: temperature, humidity, moisture, timestamps, and references to the monitoring node and vineyard.

`computer_vision_data` stores image and inference data: image paths, processed image paths, grape counts, health status, leaf counts, yield estimates, timestamps, and links back to the monitoring node and optional related sensor measurement.

Existing deployments that still have the legacy mixed `sensor_data` table can run:

```sh
psql "$DATABASE_URL" -f postgres/migrations/001_split_sensor_measurements_and_vision.sql
psql "$DATABASE_URL" -f postgres/migrations/002_normalize_vineyard_sectors_and_nodes.sql
```

The first migration splits legacy mixed telemetry/CV data. The second migration normalizes sectors and monitoring nodes, replacing the old `vine_zone`/`sensor` persistence model.

For local/demo data, run:

```sh
psql "$DATABASE_URL" -f postgres/seed.sql
```

The seed inserts one vineyard, five vineyard sectors, one monitoring node per sector, and hourly sensor measurements from January 1, 2025 through the current hour.

## Runtime data flow

Sensor telemetry is ingested directly through the serial bridge:

```text
LoRa hardware -> VineReceiver serial output -> SerialBridge/main.py -> PostgreSQL
```

The dashboard reads current state, historical telemetry, computer-vision results, and predictions through Astro API routes. Predictions are generated on request from `sensor_measurements`; there is no separate realtime transport, analytics cache, archive worker, or prediction service.

## Python environments

Python dependencies are managed with `uv`.

Computer vision environment:

```sh
cd CV
uv sync --frozen
```

Serial bridge environment:

```sh
cd SerialBridge
uv sync --frozen
```

The dashboard Docker image uses the locked CV project files with `uv venv` and `uv sync`.
