## EdgeVine CV

Runtime inference and model maintenance dependencies are managed with `uv`.

Install the locked environment:

```sh
uv sync --frozen
```

Run inference manually:

```sh
uv run python inference.py <image_path> <output_name> [uncertainty_pct]
```

The dashboard Docker image installs this project into `/opt/venv` with `uv venv` and `uv sync`, then invokes `CV/inference.py` through the dashboard API.
