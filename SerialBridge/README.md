## SerialBridge

Reads JSON telemetry from the LoRa receiver serial port and writes measurements directly into PostgreSQL.

### Setup

Dependencies are managed with `uv`:

```sh
uv sync --frozen
```

Run the bridge from this directory:

```sh
uv run python main.py
```

Important environment variables:

- `SERIAL_PORT`
- `SERIAL_BAUDRATE`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `VINEYARD_ID`
- `VINEYARD_NAME`
