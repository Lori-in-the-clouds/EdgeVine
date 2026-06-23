from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

RUNTIME_CACHE_DIR = Path(tempfile.gettempdir()) / "edgevine_cv_runtime"
os.environ.setdefault("MPLCONFIGDIR", str(RUNTIME_CACHE_DIR / "matplotlib"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(RUNTIME_CACHE_DIR / "ultralytics"))
os.environ.setdefault("XDG_CACHE_HOME", str(RUNTIME_CACHE_DIR / "cache"))
for cache_env in ("MPLCONFIGDIR", "YOLO_CONFIG_DIR", "XDG_CACHE_HOME"):
    Path(os.environ[cache_env]).mkdir(parents=True, exist_ok=True)

import cv2
import numpy as np

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:
    Image = None
    ImageOps = None
    UnidentifiedImageError = OSError

from inference import (
    BASE_DIR,
    DEFAULT_CAMERA_PARAMS,
    DEFAULT_INFERENCE_THRESHOLDS,
    MODEL_GRAPE_PATH,
    VineyardAnalyst,
    normalize_camera_params,
    normalize_confidence_threshold,
)


DEFAULT_MAX_INPUT_DIMENSION = 2048
GRAPE_COLOR = (180, 40, 220)
LEAF_DETECTION_COLOR = (255, 160, 40)
HEALTH_COLORS = {
    "healthy": (0, 190, 0),
    "stress": (0, 165, 255),
    "disease": (0, 0, 255),
}


def normalize_max_input_dimension(value):
    try:
        max_dimension = int(value)
    except (TypeError, ValueError):
        raise ValueError("max_input_dimension must be an integer")

    if max_dimension < 0:
        raise ValueError("max_input_dimension must be greater than or equal to zero")

    return max_dimension


def resize_bgr_if_needed(image, max_dimension, steps):
    if max_dimension == 0:
        return image

    height, width = image.shape[:2]
    longest_side = max(width, height)
    if longest_side <= max_dimension:
        return image

    scale = max_dimension / longest_side
    new_width = max(1, round(width * scale))
    new_height = max(1, round(height * scale))
    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    steps.append(f"resized {width}x{height} to {new_width}x{new_height}")
    return resized


def read_image_with_pillow(image_path, max_dimension):
    if Image is None:
        raise ImportError("Pillow is not installed")

    steps = []
    with Image.open(image_path) as opened:
        original_format = opened.format
        original_mode = opened.mode
        original_size = opened.size
        orientation = None

        try:
            orientation = opened.getexif().get(274)
        except Exception:
            orientation = None

        image = ImageOps.exif_transpose(opened)
        if orientation not in (None, 1):
            steps.append(f"applied EXIF orientation {orientation}")

        if image.mode != "RGB":
            steps.append(f"converted {image.mode} to RGB")
            image = image.convert("RGB")

        width, height = image.size
        if max_dimension > 0 and max(width, height) > max_dimension:
            scale = max_dimension / max(width, height)
            new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            steps.append(f"resized {width}x{height} to {new_size[0]}x{new_size[1]}")

        rgb = np.asarray(image)

    if rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError(f"Expected a 3-channel RGB image after preprocessing, got shape {rgb.shape}")

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    prepared_height, prepared_width = bgr.shape[:2]

    return bgr, {
        "loader": "pillow",
        "original_format": original_format,
        "original_mode": original_mode,
        "original_size": [original_size[0], original_size[1]],
        "prepared_size": [prepared_width, prepared_height],
        "steps": steps,
        "changed": bool(steps),
    }


def read_image_with_opencv(image_path, max_dimension):
    steps = []
    raw = np.fromfile(str(image_path), dtype=np.uint8)
    if raw.size == 0:
        raise ValueError(f"Image file is empty: {image_path}")

    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"OpenCV could not decode image: {image_path}")

    original_height, original_width = image.shape[:2]
    image = resize_bgr_if_needed(image, max_dimension, steps)
    prepared_height, prepared_width = image.shape[:2]

    return image, {
        "loader": "opencv",
        "original_format": image_path.suffix.lower().lstrip(".") or None,
        "original_mode": "BGR",
        "original_size": [original_width, original_height],
        "prepared_size": [prepared_width, prepared_height],
        "steps": steps,
        "changed": bool(steps),
    }


def prepare_image_for_yolo(image_path, max_input_dimension):
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")
    if not image_path.is_file():
        raise ValueError(f"Image path is not a file: {image_path}")

    max_dimension = normalize_max_input_dimension(max_input_dimension)

    try:
        return read_image_with_pillow(image_path, max_dimension)
    except (ImportError, UnidentifiedImageError, OSError, ValueError):
        return read_image_with_opencv(image_path, max_dimension)


def draw_box_label(image, xyxy, label, color, thickness=2):
    x1, y1, x2, y2 = xyxy
    h, w = image.shape[:2]
    x1 = max(0, min(w - 1, int(x1)))
    y1 = max(0, min(h - 1, int(y1)))
    x2 = max(0, min(w - 1, int(x2)))
    y2 = max(0, min(h - 1, int(y2)))

    cv2.rectangle(image, (x1, y1), (x2, y2), color, thickness)

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.6
    text_thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, text_thickness)
    pad_x = 5
    pad_y = 4

    label_x1 = x1
    label_x2 = min(w - 1, x1 + text_w + (pad_x * 2))
    label_h = text_h + baseline + (pad_y * 2)

    if y1 - label_h >= 0:
        label_y1 = y1 - label_h
        label_y2 = y1
        text_y = y1 - baseline - pad_y
    else:
        label_y1 = y1
        label_y2 = min(h - 1, y1 + label_h)
        text_y = y1 + text_h + pad_y

    cv2.rectangle(image, (label_x1, label_y1), (label_x2, label_y2), color, -1)
    cv2.putText(
        image,
        label,
        (label_x1 + pad_x, text_y),
        font,
        font_scale,
        (255, 255, 255),
        text_thickness,
        lineType=cv2.LINE_AA,
    )


def get_box_xyxy(box):
    return [int(v) for v in box.xyxy[0].tolist()]


def get_detection_label(result, box, fallback_name):
    class_id = int(box.cls[0]) if box.cls is not None else None
    class_name = result.names.get(class_id, fallback_name) if class_id is not None else fallback_name
    confidence = float(box.conf[0]) if box.conf is not None else 0.0
    return f"{class_name} {confidence:.2f}"


def draw_detection_result(image, result, fallback_name, color):
    count = 0
    for box in result.boxes:
        label = get_detection_label(result, box, fallback_name)
        draw_box_label(image, get_box_xyxy(box), label, color)
        count += 1
    return count


def get_class_index(names, class_name):
    normalized = class_name.lower()
    for idx, name in names.items():
        if str(name).lower() == normalized:
            return idx

    available = ", ".join(str(name) for name in names.values())
    raise ValueError(f"Classifier class '{class_name}' not found. Available classes: {available}")


def choose_health_class(probabilities, disease_threshold, stress_threshold):
    disease_passed = probabilities["disease"] >= disease_threshold
    stress_passed = probabilities["stress"] >= stress_threshold

    if disease_passed and stress_passed:
        if probabilities["disease"] >= probabilities["stress"]:
            return "disease", probabilities["disease"]
        return "stress", probabilities["stress"]

    if disease_passed:
        return "disease", probabilities["disease"]

    if stress_passed:
        return "stress", probabilities["stress"]

    return "healthy", probabilities["healthy"]


def classify_leaf(analyst, crop, disease_threshold, stress_threshold):
    cls_result = analyst.model_leaf_classifier.predict(source=crop, imgsz=256, verbose=False)[0]
    probs = cls_result.probs

    class_indices = {
        "healthy": get_class_index(cls_result.names, "healthy"),
        "stress": get_class_index(cls_result.names, "stress"),
        "disease": get_class_index(cls_result.names, "disease"),
    }
    probabilities = {
        name: float(probs.data[idx])
        for name, idx in class_indices.items()
    }
    class_name, confidence = choose_health_class(probabilities, disease_threshold, stress_threshold)

    return class_name, confidence, probabilities


def crop_with_padding(image, xyxy, padding):
    h, w = image.shape[:2]
    x1, y1, x2, y2 = xyxy
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(w, x2 + padding)
    y2 = min(h, y2 + padding)
    return image[y1:y2, x1:x2]


def save_image(path, image):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), image):
        raise IOError(f"Failed to save image at {path}")


def run_step_images(
    image_path,
    output_dir,
    prefix,
    imgsz,
    leaf_padding,
    grape_confidence,
    leaf_confidence,
    disease_threshold,
    stress_threshold,
    camera_params,
    max_input_dimension,
):
    image_path = Path(image_path)
    output_dir = Path(output_dir)
    prefix = prefix or f"{image_path.stem}_steps"

    grape_confidence = normalize_confidence_threshold(grape_confidence, "grape_confidence")
    leaf_confidence = normalize_confidence_threshold(leaf_confidence, "leaf_confidence")
    disease_threshold = normalize_confidence_threshold(disease_threshold, "disease_threshold")
    stress_threshold = normalize_confidence_threshold(stress_threshold, "stress_threshold")

    image, preprocessing = prepare_image_for_yolo(image_path, max_input_dimension)

    analyst = VineyardAnalyst(MODEL_GRAPE_PATH, None, normalize_camera_params(camera_params))

    grape_results = analyst.model_grape.predict(
        source=image,
        imgsz=imgsz,
        conf=grape_confidence,
        verbose=False,
    )
    leaf_results = analyst.model_leaf_detector.predict(
        source=image,
        imgsz=imgsz,
        conf=leaf_confidence,
        verbose=False,
    )

    detection_image = image.copy()
    grape_count = draw_detection_result(detection_image, grape_results[0], "grape", GRAPE_COLOR)
    leaf_count = draw_detection_result(detection_image, leaf_results[0], "leaf", LEAF_DETECTION_COLOR)

    detection_path = output_dir / f"{prefix}_detections.png"
    save_image(detection_path, detection_image)

    health_image = image.copy()
    draw_detection_result(health_image, grape_results[0], "grape", GRAPE_COLOR)

    health_counts = {
        "healthy": 0,
        "stress": 0,
        "disease": 0,
    }
    leaf_analyses = []

    for index, box in enumerate(leaf_results[0].boxes, start=1):
        xyxy = get_box_xyxy(box)
        crop = crop_with_padding(image, xyxy, leaf_padding)
        if crop.size == 0:
            continue

        class_name, confidence, probabilities = classify_leaf(
            analyst,
            crop,
            disease_threshold=disease_threshold,
            stress_threshold=stress_threshold,
        )
        health_counts[class_name] += 1

        label = f"{class_name} {confidence:.2f}"
        draw_box_label(health_image, xyxy, label, HEALTH_COLORS[class_name], thickness=3)
        leaf_analyses.append(
            {
                "leaf_index": index,
                "box_xyxy": xyxy,
                "health": class_name,
                "confidence": round(confidence, 4),
                "probabilities": {
                    name: round(value, 4)
                    for name, value in probabilities.items()
                },
            }
        )

    health_path = output_dir / f"{prefix}_health.png"
    save_image(health_path, health_image)

    if health_counts["disease"] > 0:
        health_prediction = "Disease Detected"
    elif health_counts["stress"] > 0:
        health_prediction = "Stress Detected"
    else:
        health_prediction = "Healthy"

    return {
        "input_image": str(image_path.resolve()),
        "preprocessing": preprocessing,
        "object_detection_image": str(detection_path.resolve()),
        "health_analysis_image": str(health_path.resolve()),
        "grape_count": grape_count,
        "leaf_count": leaf_count,
        "leaf_healthy_count": health_counts["healthy"],
        "leaf_stress_count": health_counts["stress"],
        "leaf_disease_count": health_counts["disease"],
        "health_prediction": health_prediction,
        "leaf_analyses": leaf_analyses,
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Run EdgeVine staged inference on one image and save one image with "
            "object detections plus a second image with leaf health analysis."
        )
    )
    parser.add_argument("image_path", help="Input image path.")
    parser.add_argument(
        "--output-dir",
        default=os.path.join(BASE_DIR, "images"),
        help="Directory where the staged images are saved. Defaults to CV/images.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Output filename prefix. Defaults to '<input_stem>_steps'.",
    )
    parser.add_argument(
        "--max-input-dimension",
        type=int,
        default=DEFAULT_MAX_INPUT_DIMENSION,
        help=(
            "Downscale images whose longest side is larger than this before YOLO. "
            "Use 0 to keep the decoded image size."
        ),
    )
    parser.add_argument("--imgsz", type=int, default=640, help="YOLO inference image size.")
    parser.add_argument(
        "--leaf-padding",
        type=int,
        default=10,
        help="Padding in pixels around each detected leaf before classification.",
    )
    parser.add_argument(
        "--grape-confidence",
        type=float,
        default=DEFAULT_INFERENCE_THRESHOLDS["grape_confidence"],
        help="Confidence threshold for grape detection.",
    )
    parser.add_argument(
        "--leaf-confidence",
        type=float,
        default=DEFAULT_INFERENCE_THRESHOLDS["leaf_confidence"],
        help="Confidence threshold for leaf detection.",
    )
    parser.add_argument(
        "--disease-threshold",
        type=float,
        default=DEFAULT_INFERENCE_THRESHOLDS["disease_threshold"],
        help="Disease probability threshold for the leaf health classifier.",
    )
    parser.add_argument(
        "--stress-threshold",
        type=float,
        default=DEFAULT_INFERENCE_THRESHOLDS["stress_threshold"],
        help="Stress probability threshold for the leaf health classifier.",
    )
    parser.add_argument(
        "--focal-length",
        type=float,
        default=DEFAULT_CAMERA_PARAMS["focal_length"],
        help="Camera focal length in mm, kept aligned with inference.py options.",
    )
    parser.add_argument(
        "--sensor-width",
        type=float,
        default=DEFAULT_CAMERA_PARAMS["sensor_width"],
        help="Camera sensor width in mm, kept aligned with inference.py options.",
    )
    parser.add_argument(
        "--distance",
        type=float,
        default=DEFAULT_CAMERA_PARAMS["distance"],
        help="Camera distance in mm, kept aligned with inference.py options.",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="Do not print the JSON summary after saving images.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    summary = run_step_images(
        image_path=args.image_path,
        output_dir=args.output_dir,
        prefix=args.prefix,
        imgsz=args.imgsz,
        leaf_padding=args.leaf_padding,
        grape_confidence=args.grape_confidence,
        leaf_confidence=args.leaf_confidence,
        disease_threshold=args.disease_threshold,
        stress_threshold=args.stress_threshold,
        camera_params={
            "focal_length": args.focal_length,
            "sensor_width": args.sensor_width,
            "distance": args.distance,
        },
        max_input_dimension=args.max_input_dimension,
    )

    if not args.no_json:
        print(json.dumps(summary))


if __name__ == "__main__":
    main()
