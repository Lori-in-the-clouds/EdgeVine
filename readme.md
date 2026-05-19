# EdgeVine

## Database layout

The dashboard keeps the existing vineyard hierarchy:

- `vineyard`
- `vine_zone`
- `sensor`
- `sensor_measurements`
- `computer_vision_data`

`sensor_measurements` stores only sensor telemetry: temperature, humidity, moisture, timestamps, and references to the sensor, zone, and vineyard.

`computer_vision_data` stores image and inference data: image paths, processed image paths, grape counts, health status, leaf counts, yield estimates, timestamps, and optional links back to the related sensor measurement.

Existing deployments that still have the legacy mixed `sensor_data` table can run:

```sh
psql "$DATABASE_URL" -f postgres/migrations/001_split_sensor_measurements_and_vision.sql
```

The migration is additive and leaves `sensor_data` in place for verification. New application reads and writes use the split tables.

## Runtime data flow

Sensor telemetry is ingested directly through the serial bridge:

```text
LoRa hardware -> VineReceiver serial output -> lora/SerialBridge/main.py -> PostgreSQL
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
cd lora/SerialBridge
uv sync --frozen
```

The dashboard Docker image uses the locked CV project files with `uv venv` and `uv sync`.
