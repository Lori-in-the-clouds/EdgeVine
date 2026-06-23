from __future__ import annotations

import curses
import json
import math
import os
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg
import serial


SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/cu.usbmodemF412FA651F542")
SERIAL_BAUDRATE = int(os.getenv("SERIAL_BAUDRATE", "9600"))

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "EdgeVine")
POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")

VINEYARD_ID = os.getenv("VINEYARD_ID", "1")
MONITORING_NODE_ID = os.getenv("MONITORING_NODE_ID")

DRY_SPELL_DISTANCE_KM = 12.5
DRY_SPELL_BEARING_DEGREES = 62.0
DRY_SPELL_VINEYARD_NAME = "Dry Spell Simulation Vineyard"
DRY_SPELL_ALERT_TITLE = "Dry Spell Alert"
DRY_SPELL_ALERT_DESCRIPTION = (
    "Simulated nearby vineyard reports prolonged dry conditions and water stress risk."
)


def env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def configured_monitoring_node_id() -> int | None:
    if not MONITORING_NODE_ID:
        return None
    try:
        return int(MONITORING_NODE_ID)
    except ValueError:
        return None


CAMERA_INDEX = env_int("CAMERA_INDEX", 0)
CAMERA_INDEX_COUNT = max(1, env_int("CAMERA_INDEX_COUNT", 2))
CAMERA_WIDTH = env_int("CAMERA_WIDTH", 0)
CAMERA_HEIGHT = env_int("CAMERA_HEIGHT", 0)
CAMERA_WARMUP_FRAMES = env_int("CAMERA_WARMUP_FRAMES", 5)

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
DASHBOARD_PUBLIC_DIR = Path(
    os.getenv("DASHBOARD_PUBLIC_DIR", WORKSPACE_ROOT / "vineyard-dashboard" / "public")
)
CAPTURE_DIR = Path(os.getenv("CAPTURE_DIR", DASHBOARD_PUBLIC_DIR / "captures"))
PREVIEW_WINDOW_TITLE = os.getenv("PREVIEW_WINDOW_TITLE", "EdgeVine capture")


@dataclass(frozen=True)
class MonitoringNode:
    id: int
    label: str


@dataclass(frozen=True)
class DrySpellResult:
    vineyard_id: int
    alert_id: int
    latitude: float
    longitude: float
    distance_km: float


@dataclass(frozen=True)
class AppSnapshot:
    logs: list[str]
    log_view: str
    camera_index: int
    serial_status: str
    db_status: str
    capture_status: str
    pending_capture_label: str | None
    selected_node: MonitoringNode | None
    node_count: int
    last_capture_path: Path | None
    last_capture_url: str | None
    last_upload_id: int | None
    serial_lines: int
    measurements_saved: int
    requests_answered: int


class AppState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.terminal_logs: deque[str] = deque(maxlen=500)
        self.serial_logs: deque[str] = deque(maxlen=500)
        self.log_view = "terminal"
        self.camera_index = CAMERA_INDEX
        self.serial_status = "starting"
        self.db_status = "not connected"
        self.capture_status = "idle"
        self.monitoring_nodes: list[MonitoringNode] = []
        self.selected_node_index = 0
        self.pending_capture_frame: Any | None = None
        self.pending_capture_label: str | None = None
        self.last_capture_path: Path | None = None
        self.last_capture_url: str | None = None
        self.last_upload_id: int | None = None
        self.serial_lines = 0
        self.measurements_saved = 0
        self.requests_answered = 0

    def log(self, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self._lock:
            self.terminal_logs.append(f"{timestamp} {message}")

    def log_serial(self, direction: str, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self._lock:
            self.serial_logs.append(f"{timestamp} {direction} {message}")

    def toggle_log_view(self) -> None:
        with self._lock:
            self.log_view = "serial" if self.log_view == "terminal" else "terminal"

    def set_camera_index(self, camera_index: int) -> None:
        with self._lock:
            self.camera_index = max(0, camera_index)

    def next_camera_index(self) -> int:
        with self._lock:
            self.camera_index = (self.camera_index + 1) % CAMERA_INDEX_COUNT
            return self.camera_index

    def camera_index_value(self) -> int:
        with self._lock:
            return self.camera_index

    def set_serial_status(self, status: str) -> None:
        with self._lock:
            self.serial_status = status

    def set_db_status(self, status: str) -> None:
        with self._lock:
            self.db_status = status

    def set_capture_status(self, status: str) -> None:
        with self._lock:
            self.capture_status = status

    def set_monitoring_nodes(self, nodes: list[MonitoringNode]) -> None:
        preferred_id = configured_monitoring_node_id()
        with self._lock:
            previous_id = self._selected_node_unlocked().id if self.monitoring_nodes else preferred_id
            self.monitoring_nodes = nodes
            self.selected_node_index = 0

            if previous_id is not None:
                for index, node in enumerate(nodes):
                    if node.id == previous_id:
                        self.selected_node_index = index
                        break

    def select_next_node(self) -> None:
        with self._lock:
            if self.monitoring_nodes:
                self.selected_node_index = (self.selected_node_index + 1) % len(self.monitoring_nodes)

    def selected_node(self) -> MonitoringNode | None:
        with self._lock:
            return self._selected_node_unlocked()

    def note_serial_line(self) -> None:
        with self._lock:
            self.serial_lines += 1

    def note_measurement_saved(self) -> None:
        with self._lock:
            self.measurements_saved += 1

    def note_request_answered(self) -> None:
        with self._lock:
            self.requests_answered += 1

    def set_pending_capture(self, frame: Any, label: str) -> None:
        with self._lock:
            self.pending_capture_frame = frame
            self.pending_capture_label = label
            self.last_capture_path = None
            self.last_capture_url = None
            self.last_upload_id = None

    def get_pending_capture_frame(self) -> Any | None:
        with self._lock:
            return self.pending_capture_frame

    def set_saved_capture(self, path: Path, image_url: str) -> None:
        with self._lock:
            self.pending_capture_frame = None
            self.pending_capture_label = None
            self.last_capture_path = path
            self.last_capture_url = image_url
            self.last_upload_id = None

    def set_last_upload(self, record_id: int) -> None:
        with self._lock:
            self.last_upload_id = record_id

    def snapshot(self) -> AppSnapshot:
        with self._lock:
            logs = self.serial_logs if self.log_view == "serial" else self.terminal_logs
            return AppSnapshot(
                logs=list(logs),
                log_view=self.log_view,
                camera_index=self.camera_index,
                serial_status=self.serial_status,
                db_status=self.db_status,
                capture_status=self.capture_status,
                pending_capture_label=self.pending_capture_label,
                selected_node=self._selected_node_unlocked(),
                node_count=len(self.monitoring_nodes),
                last_capture_path=self.last_capture_path,
                last_capture_url=self.last_capture_url,
                last_upload_id=self.last_upload_id,
                serial_lines=self.serial_lines,
                measurements_saved=self.measurements_saved,
                requests_answered=self.requests_answered,
            )

    def _selected_node_unlocked(self) -> MonitoringNode | None:
        if not self.monitoring_nodes:
            return None
        return self.monitoring_nodes[self.selected_node_index]


def connect_db() -> psycopg.Connection[Any]:
    return psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )


def insert_measurement(
    cur: psycopg.Cursor[Any],
    device_id: int,
    temperature: float,
    humidity: float,
    moisture: float,
) -> None:
    cur.execute(
        """
        INSERT INTO sensor_measurements (
            monitoring_node_id,
            vineyard_id,
            temperature,
            humidity,
            moisture,
            timestamp
        )
        SELECT id, vineyard_id, %s, %s, %s, NOW()
        FROM monitoring_node
        WHERE vineyard_id = %s::integer
          AND number = %s
        RETURNING id
        """,
        (temperature, humidity, moisture, VINEYARD_ID, device_id),
    )
    if cur.fetchone() is None:
        raise ValueError(f"Monitoring node number {device_id} was not found.")


def fetch_measurements_response(cur: psycopg.Cursor[Any]) -> dict[str, Any]:
    response: dict[str, Any] = {"type": "response", "strings": []}
    cur.execute(
        """
        SELECT id, name FROM vineyard_sector
        WHERE vineyard_id = %s
        ORDER BY display_order ASC, name ASC
        """,
        (VINEYARD_ID,),
    )

    sectors = cur.fetchall()

    for sector_id, sector_name in sectors:
        cur.execute(
            """
            SELECT DISTINCT ON (mn.id) sm.temperature, sm.humidity, sm.moisture
            FROM monitoring_node mn
            JOIN sensor_measurements sm ON mn.id = sm.monitoring_node_id
            WHERE mn.sector_id = %s
            ORDER BY mn.id, sm.timestamp DESC
            """,
            (sector_id,),
        )
        measurements = cur.fetchall()

        temperature = 0.0
        humidity = 0.0
        moisture = 0.0
        for measurement in measurements:
            temperature += measurement[0]
            humidity += measurement[1]
            moisture += measurement[2]

        count = len(measurements)
        temperature_text = f"{temperature / count:.2f}°C" if count else "N/A"
        humidity_text = f"{humidity / count:.2f}%" if count else "N/A"
        moisture_text = f"{moisture / count:.2f}%" if count else "N/A"

        response["strings"].append(
            f"{sector_name} - Temp: {temperature_text}, "
            f"Humidity: {humidity_text}, Moisture: {moisture_text}"
        )

    return response


def fetch_monitoring_nodes() -> list[MonitoringNode]:
    with connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    COALESCE(name, external_id, 'Node ' || number::text) AS label
                FROM monitoring_node
                WHERE vineyard_id = %s
                ORDER BY number ASC, id ASC
                """,
                (VINEYARD_ID,),
            )
            return [MonitoringNode(id=row[0], label=row[1]) for row in cur.fetchall()]


def reload_monitoring_nodes(state: AppState) -> None:
    try:
        nodes = fetch_monitoring_nodes()
    except psycopg.Error as exc:
        state.log(f"Failed to load monitoring nodes: {exc}")
        return

    state.set_monitoring_nodes(nodes)
    if nodes:
        state.log(f"Loaded {len(nodes)} monitoring node(s).")
    else:
        state.log("No monitoring nodes found for the configured vineyard.")


def upload_capture(image_url: str, monitoring_node_id: int) -> int:
    with connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH selected_node AS (
                    SELECT id, vineyard_id
                    FROM monitoring_node
                    WHERE id = %s
                ),
                latest_measurement AS (
                    SELECT id
                    FROM sensor_measurements
                    WHERE monitoring_node_id = %s
                    ORDER BY timestamp DESC, id DESC
                    LIMIT 1
                )
                INSERT INTO computer_vision_data (
                    monitoring_node_id,
                    vineyard_id,
                    sensor_measurement_id,
                    image_url,
                    processed_image_url,
                    grape_count,
                    health_status,
                    estimated_liters,
                    estimated_liters_min,
                    estimated_liters_max,
                    leaf_healthy_count,
                    leaf_stress_count,
                    leaf_disease_count
                )
                SELECT
                    selected_node.id,
                    selected_node.vineyard_id,
                    latest_measurement.id,
                    %s,
                    NULL,
                    NULL,
                    'Pending Analysis',
                    NULL,
                    NULL,
                    NULL,
                    0,
                    0,
                    0
                FROM selected_node
                LEFT JOIN latest_measurement ON true
                RETURNING id
                """,
                (monitoring_node_id, monitoring_node_id, image_url),
            )
            row = cur.fetchone()

    if row is None:
        raise RuntimeError(f"Monitoring node {monitoring_node_id} was not found.")
    return int(row[0])


def destination_point(
    latitude: float,
    longitude: float,
    distance_km: float,
    bearing_degrees: float,
) -> tuple[float, float]:
    earth_radius_km = 6371.0
    lat_rad = math.radians(latitude)
    lng_rad = math.radians(longitude)
    bearing_rad = math.radians(bearing_degrees)
    angular_distance = distance_km / earth_radius_km

    target_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(angular_distance)
        + math.cos(lat_rad) * math.sin(angular_distance) * math.cos(bearing_rad)
    )
    target_lng_rad = lng_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(angular_distance) * math.cos(lat_rad),
        math.cos(angular_distance) - math.sin(lat_rad) * math.sin(target_lat_rad),
    )

    target_lng_degrees = (math.degrees(target_lng_rad) + 540) % 360 - 180
    return math.degrees(target_lat_rad), target_lng_degrees


def create_dry_spell_alert() -> DrySpellResult:
    with connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    latitude,
                    longitude,
                    COALESCE(name_vineyard, name) AS vineyard_name
                FROM vineyard
                ORDER BY CASE WHEN id = %s::integer THEN 0 ELSE 1 END, id ASC
                LIMIT 1
                """,
                (VINEYARD_ID,),
            )
            reference_vineyard = cur.fetchone()
            if reference_vineyard is None:
                raise RuntimeError("No vineyard found in database.")

            reference_id = int(reference_vineyard[0])
            reference_latitude = float(reference_vineyard[1])
            reference_longitude = float(reference_vineyard[2])
            if not (
                math.isfinite(reference_latitude)
                and math.isfinite(reference_longitude)
            ):
                raise RuntimeError(f"Vineyard {reference_id} has invalid coordinates.")

            dry_latitude, dry_longitude = destination_point(
                reference_latitude,
                reference_longitude,
                DRY_SPELL_DISTANCE_KM,
                DRY_SPELL_BEARING_DEGREES,
            )

            cur.execute(
                """
                SELECT id
                FROM vineyard
                WHERE owner = 'SerialBridge'
                  AND name_vineyard = %s
                ORDER BY id ASC
                LIMIT 1
                """,
                (DRY_SPELL_VINEYARD_NAME,),
            )
            existing_vineyard = cur.fetchone()

            if existing_vineyard is None:
                cur.execute(
                    """
                    INSERT INTO vineyard (
                        name,
                        owner,
                        altitude,
                        latitude,
                        longitude,
                        name_vineyard,
                        area
                    )
                    VALUES (%s, 'SerialBridge', 0, %s, %s, %s, '---')
                    RETURNING id
                    """,
                    (
                        DRY_SPELL_VINEYARD_NAME,
                        dry_latitude,
                        dry_longitude,
                        DRY_SPELL_VINEYARD_NAME,
                    ),
                )
                vineyard_id = int(cur.fetchone()[0])
            else:
                vineyard_id = int(existing_vineyard[0])
                cur.execute(
                    """
                    UPDATE vineyard
                    SET
                        name = %s,
                        owner = 'SerialBridge',
                        latitude = %s,
                        longitude = %s,
                        name_vineyard = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    """,
                    (
                        DRY_SPELL_VINEYARD_NAME,
                        dry_latitude,
                        dry_longitude,
                        DRY_SPELL_VINEYARD_NAME,
                        vineyard_id,
                    ),
                )

            cur.execute(
                """
                INSERT INTO network_alerts (
                    vineyard_id,
                    source_latitude,
                    source_longitude,
                    alert_type,
                    title,
                    description
                )
                VALUES (%s, %s, %s, 'hydraulic', %s, %s)
                RETURNING id
                """,
                (
                    vineyard_id,
                    dry_latitude,
                    dry_longitude,
                    DRY_SPELL_ALERT_TITLE,
                    DRY_SPELL_ALERT_DESCRIPTION,
                ),
            )
            alert_id = int(cur.fetchone()[0])

    return DrySpellResult(
        vineyard_id=vineyard_id,
        alert_id=alert_id,
        latitude=dry_latitude,
        longitude=dry_longitude,
        distance_km=DRY_SPELL_DISTANCE_KM,
    )


def run_dry_spell_flow(state: AppState) -> None:
    state.log("Creating dry spell simulation...")

    try:
        result = create_dry_spell_alert()
    except Exception as exc:
        state.log(f"Dry spell command failed: {exc}")
        return

    state.log(
        "Dry spell alert "
        f"{result.alert_id} saved for vineyard {result.vineyard_id} "
        f"at {result.distance_km:.1f}km "
        f"({result.latitude:.5f}, {result.longitude:.5f})."
    )


def import_opencv() -> Any:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError(
            "OpenCV is required for camera capture. Run `uv sync` in SerialBridge."
        ) from exc
    return cv2


def capture_frame(camera_index: int) -> Any:
    cv2 = import_opencv()

    api_preference = getattr(cv2, "CAP_AVFOUNDATION", 0) if sys.platform == "darwin" else 0
    camera = cv2.VideoCapture(camera_index, api_preference)
    if not camera.isOpened() and api_preference:
        camera.release()
        camera = cv2.VideoCapture(camera_index)

    if not camera.isOpened():
        raise RuntimeError(f"Unable to open camera index {camera_index}.")

    try:
        if CAMERA_WIDTH > 0:
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        if CAMERA_HEIGHT > 0:
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)

        frame = None
        for _ in range(max(CAMERA_WARMUP_FRAMES, 1)):
            ok, current_frame = camera.read()
            if ok:
                frame = current_frame
            time.sleep(0.05)

        if frame is None:
            raise RuntimeError("Camera opened but did not return an image frame.")
    finally:
        camera.release()

    return frame


def save_capture_frame(frame: Any) -> tuple[Path, str]:
    cv2 = import_opencv()
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    output_path = CAPTURE_DIR / filename
    if not cv2.imwrite(str(output_path), frame):
        raise RuntimeError(f"Failed to save camera frame to {output_path}.")

    return output_path, f"/captures/{filename}"


def preview_frame(frame: Any) -> None:
    cv2 = import_opencv()
    cv2.imshow(PREVIEW_WINDOW_TITLE, frame)
    cv2.waitKey(1)


def preview_last_capture(path: Path) -> None:
    cv2 = import_opencv()
    image = cv2.imread(str(path))
    if image is None:
        raise RuntimeError(f"Unable to read image at {path}.")

    cv2.imshow(PREVIEW_WINDOW_TITLE, image)
    cv2.waitKey(1)


def close_preview_windows() -> None:
    try:
        cv2 = import_opencv()
    except RuntimeError:
        return
    cv2.destroyAllWindows()


def pump_preview_events() -> None:
    cv2 = sys.modules.get("cv2")
    if cv2 is None:
        return

    try:
        cv2.waitKey(1)
    except Exception:
        pass


def run_capture_flow(state: AppState) -> None:
    state.set_capture_status("capturing")
    camera_index = state.camera_index_value()
    state.log(f"Capturing photo from USB camera index {camera_index}...")

    try:
        frame = capture_frame(camera_index)
        preview_frame(frame)
        label = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        state.set_pending_capture(frame, label)
        state.log("Photo captured for review. Press `u` to save and upload it.")
    except Exception as exc:
        state.set_capture_status("capture failed")
        state.log(f"Capture failed: {exc}")
        return

    state.set_capture_status("previewing, not saved")


def run_upload_flow(state: AppState) -> None:
    snapshot = state.snapshot()
    if snapshot.selected_node is None:
        state.log("Upload skipped: select or create a monitoring node first.")
        return

    image_url = snapshot.last_capture_url
    pending_frame = state.get_pending_capture_frame()

    state.set_capture_status("uploading")
    if pending_frame is not None:
        try:
            path, image_url = save_capture_frame(pending_frame)
            state.set_saved_capture(path, image_url)
            state.log(f"Photo saved: {path}")
        except Exception as exc:
            state.set_capture_status("save failed")
            state.log(f"Save failed: {exc}")
            return

    if not image_url:
        state.set_capture_status("idle")
        state.log("No reviewed capture to upload.")
        return

    try:
        record_id = upload_capture(image_url, snapshot.selected_node.id)
    except Exception as exc:
        state.set_capture_status("upload failed")
        state.log(f"Upload failed: {exc}")
        return

    state.set_last_upload(record_id)
    state.set_capture_status("uploaded")
    state.log(
        f"Uploaded capture as pending vision record {record_id} "
        f"for {snapshot.selected_node.label}."
    )


def ensure_db_connection(
    conn: psycopg.Connection[Any] | None,
    state: AppState,
    next_retry_at: float,
) -> tuple[psycopg.Connection[Any] | None, float]:
    if conn is not None and not conn.closed:
        return conn, next_retry_at

    now = time.monotonic()
    if now < next_retry_at:
        return None, next_retry_at

    try:
        conn = connect_db()
    except psycopg.Error as exc:
        state.set_db_status("offline")
        state.log(f"Database connection failed: {exc}")
        return None, now + 5

    state.set_db_status("connected")
    state.log("Database connected.")
    return conn, next_retry_at


def process_serial_message(
    decoded: str,
    ser: serial.Serial,
    conn: psycopg.Connection[Any],
    state: AppState,
) -> None:
    try:
        data = json.loads(decoded)
    except json.JSONDecodeError as exc:
        state.log(f"JSON decode error: {exc}")
        return

    try:
        message_type = data.get("type")
        if message_type == "measurement":
            with conn.cursor() as cur:
                insert_measurement(
                    cur,
                    device_id=int(data["id"]),
                    temperature=float(data["temperature"]),
                    humidity=float(data["humidity"]),
                    moisture=float(data["moisture"]/4.5),
                )
            conn.commit()
            state.note_measurement_saved()
            return

        if message_type == "request":
            with conn.cursor() as cur:
                response = fetch_measurements_response(cur)
            decoded_response = json.dumps(response)
            ser.write(decoded_response.encode("utf-8") + b"\n")
            conn.commit()
            state.note_request_answered()
            state.log_serial("TX", decoded_response)
            state.log("Measurement summary sent to device.")
            return

        state.log(f"Unhandled serial message type: {message_type!r}")
    except (KeyError, TypeError, ValueError) as exc:
        state.log(f"Invalid serial payload: {exc}")
    except psycopg.Error as exc:
        conn.rollback()
        state.log(f"Database error while processing serial payload: {exc}")


def serial_worker(state: AppState, stop_event: threading.Event) -> None:
    conn: psycopg.Connection[Any] | None = None
    next_db_retry_at = 0.0

    while not stop_event.is_set():
        ser: serial.Serial | None = None
        try:
            state.set_serial_status("connecting")
            ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=0.5)
            state.set_serial_status("connected")
            state.log(f"Serial connected on {SERIAL_PORT} at {SERIAL_BAUDRATE} baud.")

            while not stop_event.is_set():
                line = ser.readline()
                if not line:
                    continue

                decoded = line.decode("utf-8", errors="replace").strip()
                if not decoded:
                    continue

                state.note_serial_line()
                state.log_serial("RX", decoded)

                conn, next_db_retry_at = ensure_db_connection(
                    conn,
                    state,
                    next_db_retry_at,
                )
                if conn is None:
                    state.log("Serial payload skipped because database is offline.")
                    continue

                process_serial_message(decoded, ser, conn, state)

        except (serial.SerialException, OSError) as exc:
            state.set_serial_status("offline")
            state.log(f"Serial connection failed: {exc}")
            stop_event.wait(5)
        finally:
            if ser is not None:
                ser.close()

    if conn is not None and not conn.closed:
        conn.close()


def add_text(
    stdscr: curses.window,
    y: int,
    x: int,
    text: str,
    max_width: int,
    attr: int = 0,
) -> None:
    height, width = stdscr.getmaxyx()
    if y < 0 or y >= height or x < 0 or x >= width:
        return

    available_width = min(max_width, width - x - 1)
    if available_width <= 0:
        return

    try:
        stdscr.addnstr(y, x, text, available_width, attr)
    except curses.error:
        pass


def draw_tui(stdscr: curses.window, snapshot: AppSnapshot) -> None:
    stdscr.erase()
    height, width = stdscr.getmaxyx()

    if height < 14 or width < 72:
        add_text(stdscr, 0, 0, "Terminal too small for SerialBridge TUI.", width - 1)
        stdscr.refresh()
        return

    title_attr = curses.color_pair(1) | curses.A_BOLD
    dim_attr = curses.color_pair(2)
    warn_attr = curses.color_pair(3) | curses.A_BOLD

    right_width = 36
    left_width = width - right_width - 2

    add_text(stdscr, 0, 0, "EdgeVine SerialBridge", left_width, title_attr)
    add_text(
        stdscr,
        1,
        0,
        f"Serial: {snapshot.serial_status} | DB: {snapshot.db_status} | "
        f"Camera: index {snapshot.camera_index}",
        left_width,
        dim_attr,
    )
    add_text(
        stdscr,
        2,
        0,
        f"Lines: {snapshot.serial_lines} | Measurements: "
        f"{snapshot.measurements_saved} | Requests: {snapshot.requests_answered}",
        left_width,
        dim_attr,
    )
    view_title = "Serial output" if snapshot.log_view == "serial" else "Terminal output"
    add_text(stdscr, 4, 0, f"{view_title} (t toggles view)", left_width, curses.A_BOLD)

    log_height = height - 6
    visible_logs = snapshot.logs[-log_height:]
    for index, line in enumerate(visible_logs):
        add_text(stdscr, 5 + index, 0, line, left_width)

    border_x = left_width + 1
    for y in range(height):
        add_text(stdscr, y, border_x, "|", 1, dim_attr)

    panel_x = border_x + 2
    y = 0
    add_text(stdscr, y, panel_x, "Capture", right_width, title_attr)
    y += 2

    selected = snapshot.selected_node.label if snapshot.selected_node else "none"
    if snapshot.selected_node:
        selected = f"{snapshot.selected_node.id}: {selected}"
    add_text(stdscr, y, panel_x, f"Node: {selected}", right_width)
    y += 1
    add_text(stdscr, y, panel_x, f"Node count: {snapshot.node_count}", right_width, dim_attr)
    y += 1
    add_text(stdscr, y, panel_x, f"Status: {snapshot.capture_status}", right_width)
    y += 2
    add_text(
        stdscr,
        y,
        panel_x,
        f"Camera index: {snapshot.camera_index}",
        right_width,
        curses.A_BOLD,
    )
    y += 2

    if snapshot.pending_capture_label:
        last_path = f"review only: {snapshot.pending_capture_label}"
        public_url = "not saved yet"
    else:
        last_path = str(snapshot.last_capture_path) if snapshot.last_capture_path else "none"
        public_url = snapshot.last_capture_url or "no public URL"

    add_text(stdscr, y, panel_x, "Last capture:", right_width, curses.A_BOLD)
    y += 1
    add_text(stdscr, y, panel_x, last_path, right_width)
    y += 1
    add_text(stdscr, y, panel_x, public_url, right_width, dim_attr)
    y += 1
    upload = str(snapshot.last_upload_id) if snapshot.last_upload_id else "not uploaded"
    add_text(stdscr, y, panel_x, f"Vision record: {upload}", right_width)
    y += 3

    add_text(stdscr, y, panel_x, "Keys", right_width, curses.A_BOLD)
    y += 1
    controls = [
        "c  capture and preview",
        "u  save and upload reviewed capture",
        "p  preview last capture",
        "i  next camera index",
        "0-9 set camera index",
        "t  toggle terminal/serial log",
        "n  next monitoring node",
        "r  reload monitoring nodes",
        "d  dry spell",
        "x  close photo windows",
        "q  quit",
    ]
    for control in controls:
        add_text(stdscr, y, panel_x, control, right_width)
        y += 1

    if snapshot.selected_node is None:
        add_text(stdscr, height - 2, panel_x, "No node selected; upload will skip.", right_width, warn_attr)

    stdscr.refresh()


def run_tui(stdscr: curses.window, state: AppState, stop_event: threading.Event) -> None:
    try:
        curses.curs_set(0)
    except curses.error:
        pass
    stdscr.nodelay(True)
    stdscr.keypad(True)

    if curses.has_colors():
        curses.start_color()
        curses.use_default_colors()
        curses.init_pair(1, curses.COLOR_GREEN, -1)
        curses.init_pair(2, curses.COLOR_CYAN, -1)
        curses.init_pair(3, curses.COLOR_YELLOW, -1)

    while not stop_event.is_set():
        snapshot = state.snapshot()
        draw_tui(stdscr, snapshot)
        pump_preview_events()

        key = stdscr.getch()
        if key in (ord("q"), ord("Q")):
            break
        if key in (ord("c"), ord("C")):
            run_capture_flow(state)
        elif key in (ord("u"), ord("U")):
            run_upload_flow(state)
        elif key in (ord("i"), ord("I")):
            camera_index = state.next_camera_index()
            state.log(f"Camera index set to {camera_index}.")
        elif ord("0") <= key <= ord("9"):
            camera_index = key - ord("0")
            state.set_camera_index(camera_index)
            state.log(f"Camera index set to {camera_index}.")
        elif key in (ord("t"), ord("T")):
            state.toggle_log_view()
        elif key in (ord("p"), ord("P")):
            pending_frame = state.get_pending_capture_frame()
            if pending_frame is not None:
                try:
                    preview_frame(pending_frame)
                    state.log("Preview window refreshed.")
                except Exception as exc:
                    state.log(f"Preview failed: {exc}")
            elif snapshot.last_capture_path:
                try:
                    preview_last_capture(snapshot.last_capture_path)
                    state.log("Preview window refreshed.")
                except Exception as exc:
                    state.log(f"Preview failed: {exc}")
            else:
                state.log("No capture to preview.")
        elif key in (ord("n"), ord("N")):
            state.select_next_node()
        elif key in (ord("r"), ord("R")):
            reload_monitoring_nodes(state)
        elif key in (ord("d"), ord("D")):
            run_dry_spell_flow(state)
        elif key in (ord("x"), ord("X")):
            close_preview_windows()
            state.log("Photo preview windows closed.")

        time.sleep(0.15)


def main() -> None:
    state = AppState()
    state.log("Starting SerialBridge TUI.")
    state.log(f"Dashboard captures directory: {CAPTURE_DIR}")
    reload_monitoring_nodes(state)

    stop_event = threading.Event()
    thread = threading.Thread(
        target=serial_worker,
        args=(state, stop_event),
        name="serial-worker",
        daemon=True,
    )
    thread.start()

    try:
        curses.wrapper(run_tui, state, stop_event)
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        thread.join(timeout=2)
        close_preview_windows()


if __name__ == "__main__":
    main()
