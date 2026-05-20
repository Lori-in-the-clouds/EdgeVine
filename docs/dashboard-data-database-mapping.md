# Dashboard Data and Database Mapping

This document describes the definitive database model used by the dashboard after normalizing sectors and monitoring nodes.

The current persistence model is:

```text
vineyard
  -> vineyard_sector
  -> monitoring_node
      -> sensor_measurements
      -> computer_vision_data
app_settings
```

Rows are not stored in a separate table. They are sector-level configuration data because every row belongs to one sector and shares that sector's geometric settings.

## Final Domain Model

| Concept | Table | Dashboard meaning |
| --- | --- | --- |
| Vineyard / estate | `vineyard` | Main vineyard profile, location, and aggregate map summary. |
| Vineyard sector/block | `vineyard_sector` | A configured vineyard sector with polygon, row settings, row geometry, and display theme. |
| Monitoring node | `monitoring_node` | Field node shown as a sentinel in the dashboard. It can produce telemetry and camera captures. |
| Telemetry sample | `sensor_measurements` | Temperature, air humidity, and soil moisture sample captured by a monitoring node. |
| Camera/CV capture | `computer_vision_data` | Image capture and computer-vision inference data captured by a monitoring node. |
| App setting | `app_settings` | Small dashboard settings, currently AI vision uncertainty. |

## Dashboard Pages and Data Sources

| Dashboard area | Component/API | DB tables used | Data not from DB |
| --- | --- | --- | --- |
| Main dashboard map `/` | `DashboardContainer`, `DashboardMap`, `GET /api/vineyard/config`, `GET /api/sensors` | `vineyard`, `vineyard_sector`, `monitoring_node`, `sensor_measurements`, `computer_vision_data` | Open-Meteo current weather, RainViewer overlays, Open-Meteo weather overlays, Unsplash fallback images. |
| Statistics `/statistics` | `DashboardStats`, `GET /api/vineyard/stats`, `GET /api/predictions`, vision APIs | `vineyard`, `vineyard_sector`, `monitoring_node`, `sensor_measurements`, `computer_vision_data`, `app_settings` | Forecasts are calculated in memory and are not persisted. Time range and image limit are UI state. |
| Edit/configuration `/edit` | `EditForm`, `ConfigurationMap`, `GET/POST /api/vineyard/config`, `GET /api/sensors` | `vineyard`, `vineyard_sector`, `monitoring_node` | Map search/geocoding uses Nominatim. Unsaved map edits live only in React state. |
| Profile `/profile` | `ProfileForm`, `GET/POST /api/vineyard/config` | `vineyard`, computed sector summaries from `vineyard_sector` | Phone number and profile photo remain in browser `localStorage`. |
| Settings `/settings` | `SettingsDashboard`, `GET/POST /api/settings` | `app_settings` | None significant. |
| Vision `/vision` | `VisionConsole`, `POST /api/vision/analyze` | Reads `app_settings` during analysis | Direct uploads are processed and displayed but are not inserted into `computer_vision_data`. |
| Alerts `/alerts` | `AlertsView`, `GET /api/vineyard/config` | `vineyard`, `vineyard_sector` for vineyard position/configuration | Alert feed and user reports are React state only. |
| Login `/login` | Static Astro page | None | No persisted user/session/auth data. |

## Table Mapping

### `vineyard`

Main vineyard profile and aggregate summary.

| Column | Dashboard use |
| --- | --- |
| `id` | Parent key for sectors, nodes, telemetry, and CV data. Most dashboard code still uses the first vineyard row. |
| `name` | Internal/default vineyard name. |
| `owner` | Profile owner name. |
| `altitude` | Stored but not currently displayed. |
| `latitude`, `longitude` | Vineyard centroid used by profile, map fallback, weather, and geolocation behavior. |
| `province`, `region`, `address` | Profile location details. |
| `email` | Profile email. |
| `name_vineyard` | UI-facing vineyard display name. |
| `area` | Dashboard/edit map area summary as display text. |
| `total_row_meters` | Aggregate row length derived from sectors. |
| `total_rows_count` | Aggregate row count derived from sectors. |
| `sectors_count` | Aggregate sector count derived from `vineyard_sector`. |
| `sector_names` | Comma-separated sector names for profile display. |
| `created_at`, `updated_at` | Internal timestamps. |

Notes:

- Sector geometry no longer lives in `vineyard.sectors`.
- Aggregate fields are kept for quick profile/dashboard display, but the source of truth is `vineyard_sector`.

### `vineyard_sector`

Stores configured vineyard sectors/blocks.

| Column | Dashboard use |
| --- | --- |
| `id` | Stable sector identifier. The map uses UUID-like ids generated in the browser. |
| `vineyard_id` | Parent vineyard. |
| `name` | Sector label shown on maps and profile summaries. |
| `perimeter` | GeoJSON polygon for the sector boundary. |
| `rows` | JSONB list of generated/manual row geometries and lengths. This avoids a separate rows table. |
| `row_orientation` | Sector-level row orientation used by the configuration map. |
| `row_spacing` | Sector-level row spacing used by automatic row generation. |
| `target_row_count` | Optional sector-level row target. |
| `show_rows` | Controls whether rows are displayed for the sector. |
| `color_theme` | Sector polygon and row colors. |
| `display_order` | Stable ordering for the dashboard. |
| `area_square_meters` | Reserved/derived area metric. |
| `total_row_meters` | Derived from `rows[].length`. |
| `row_count` | Derived from `rows.length`. |
| `created_at`, `updated_at` | Internal timestamps. |

Connected dashboard surfaces:

- `/edit`: creates and updates sectors, row settings, and row geometry.
- `/`: renders sector polygons and rows.
- `/statistics`: uses sector presence to decide whether the vineyard is configured.
- `/alerts`: derives vineyard center from configured sector geometry.
- `/profile`: displays sector count, names, row count, and total row length.

### `monitoring_node`

Stores current dashboard sentinels as first-class monitoring nodes.

| Column | Dashboard use |
| --- | --- |
| `id` | Stable node id used by telemetry and CV rows. |
| `vineyard_id` | Parent vineyard. |
| `sector_id` | Optional link to `vineyard_sector.id`. |
| `number` | Node display/order number. Preserved for compatibility with existing sentinel UI labels. |
| `external_id` | Station/node identifier shown in map popups. |
| `name` | Node display name shown as the sentinel label. |
| `latitude`, `longitude` | Node marker location. |
| `created_at`, `updated_at` | Internal timestamps. |

Connected dashboard surfaces:

- `/edit`: sentinel inventory and marker placement.
- `/`: sentinel markers and popups.
- `/statistics`: capture labels and node count.
- `SerialBridge/main.py`: resolves hardware device ids to monitoring nodes before inserting telemetry.

Notes:

- This replaces the old `vine_zone` plus `sensor` model.
- The API still returns compatibility aliases like `zone_id`, `zone_number`, and `zone_name` from `/api/sensors` so existing React components continue working.

### `sensor_measurements`

Stores telemetry samples captured by monitoring nodes.

| Column | Dashboard use |
| --- | --- |
| `id` | Internal measurement id. |
| `monitoring_node_id` | Node that captured the sample. |
| `vineyard_id` | Parent vineyard. |
| `temperature` | Temperature KPI, chart series, map popup, and forecast input. |
| `humidity` | Air humidity KPI, chart series, and map popup. |
| `moisture` | Soil moisture KPI, chart series, map popup, and forecast input. |
| `timestamp` | Sample time used for history and latest-reading queries. |
| `created_at` | Internal insert timestamp. |

Connected dashboard surfaces:

- `/`: sentinel popup telemetry and moisture status.
- `/statistics`: KPI cards and telemetry history chart.
- `/api/predictions`: generated temperature and soil-moisture forecasts.
- `/api/sensors/history`: last telemetry samples.

### `computer_vision_data`

Stores image captures and inference results from monitoring nodes.

| Column | Dashboard use |
| --- | --- |
| `id` | Capture record id. |
| `monitoring_node_id` | Node that captured the image. Nullable so old captures can survive node deletion. |
| `vineyard_id` | Parent vineyard. |
| `sensor_measurement_id` | Optional related telemetry sample. |
| `timestamp` | Capture time. |
| `image_url` | Original image path/URL. |
| `processed_image_url` | Annotated inference result image. |
| `grape_count` | Detected grape count. |
| `health_status` | Health status label. |
| `estimated_liters` | Yield estimate. |
| `estimated_liters_min`, `estimated_liters_max` | Yield uncertainty range. |
| `leaf_healthy_count`, `leaf_stress_count`, `leaf_disease_count` | Canopy health counts used by statistics. |
| `created_at` | Internal insert timestamp. |

Connected dashboard surfaces:

- `/statistics`: AI Vision Captures, yield card, and canopy health chart.
- `/`: sentinel popup capture image, grape count, and health status.
- `/api/vision/save-result`: persists inference outputs to an existing capture row.

### `app_settings`

Stores key/value dashboard settings.

| Column | Dashboard use |
| --- | --- |
| `key` | Setting namespace. Currently `vision`. |
| `value` | JSON setting body. Current shape: `{ "depth_uncertainty_pct": number }`. |
| `updated_at` | Internal timestamp. |

Connected dashboard surfaces:

- `/settings`: AI vision calibration slider.
- `/api/vision/analyze`: passes uncertainty to the Python inference script.
- `/api/vineyard/stats`: computes fallback yield uncertainty ranges.

## Saved in DB vs Not Saved

### Saved in PostgreSQL

- Vineyard identity, owner, email, location, area, and aggregate sector/row summaries.
- Sector polygons, row settings, generated/manual row geometry, row counts, and colors.
- Monitoring node positions and identifiers.
- Telemetry samples from monitoring nodes.
- Camera capture records and inference outputs for persisted capture rows.
- AI vision uncertainty settings.

### Not Saved in PostgreSQL

| Data | Current location |
| --- | --- |
| Profile phone number | Browser `localStorage`. |
| Profile photo | Browser `localStorage`. |
| Header identity cache | Browser `localStorage`. |
| Login credentials/session | Not implemented. |
| Alerts feed and user alert reports | React state only. |
| Current weather widget | Open-Meteo API response. |
| Weather map overlays | RainViewer/Open-Meteo/browser memory. |
| Forecast prediction results | Generated in memory by `/api/predictions`. |
| Forecast alert status | Generated in memory by `/api/predictions`. |
| Statistics time range and image display limit | React state. |
| Direct Vision page uploads | Filesystem under `public/cv_temp`; not inserted into DB. |
| Direct Vision page inference result | React state plus result image file. |
| Processed image bytes | Filesystem under `public/cv_results`; DB stores only URL references. |

## Migration Notes

Existing deployments should run:

```sh
psql "$DATABASE_URL" -f postgres/migrations/001_split_sensor_measurements_and_vision.sql
psql "$DATABASE_URL" -f postgres/migrations/002_normalize_vineyard_sectors_and_nodes.sql
```

Migration `002_normalize_vineyard_sectors_and_nodes.sql`:

- Moves `vineyard.sectors` JSONB into `vineyard_sector`.
- Moves `vine_zone` rows into `monitoring_node`.
- Moves telemetry from `sensor_measurements.sensor_id`/`zone_id` to `sensor_measurements.monitoring_node_id`.
- Moves CV data from `computer_vision_data.sensor_id`/`zone_id` to `computer_vision_data.monitoring_node_id`.
- Drops old `sensor`, `vine_zone`, and `vineyard.sectors` after data is moved.

## Remaining Design Decisions

- Direct uploads in `/vision` still do not create `computer_vision_data` rows.
- Alert reports are still local UI state, not persistent domain data.
- Profile phone/photo remain browser-local rather than DB-backed.
- `/api/sensors` still exposes compatibility names such as `zone_name` for React components. This is API compatibility only; the database source is `monitoring_node`.
