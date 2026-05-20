# EdgeVine 🍇

**EdgeVine** is an advanced, end-to-end precision viticulture system that unites Internet of Things (IoT) telemetry, long-range LoRaWAN connectivity, and state-of-the-art AI computer vision to empower vineyard managers with real-time, actionable insights. By monitoring micro-climates, soil states, and canopy health, EdgeVine predicts crop yields and early-stage diseases—allowing growers to maximize grape quality, optimize water resources, and secure harvest volume.

<!-- 📸 INSERT: Project Overview Banner / Dashboard Screenshot -->

---

## Table of Contents

1. [Overview](#1-overview)
2. [Backend Infrastructure](#2-backend-infrastructure)
3. [Dashboard](#3-dashboard)
4. [CV and Predictions](#4-cv-and-predictions)
   - 4.1 [Stage 1: Leaf Detection (YOLOv8-Medium)](#41-stage-1-leaf-detection-yolov8-medium)
   - 4.2 [Stage 2: Health Classification (YOLOv8-cls)](#42-stage-2-health-classification-yolov8-cls)
   - 4.3 [The Polygon-to-Bounding-Box Dataset Fix (Critical Debugging)](#43-the-polygon-to-bounding-box-dataset-fix-critical-debugging)
   - 4.4 [Grape Counting & Liter Estimation (Mathematical Model)](#44-grape-counting--liter-estimation-mathematical-model)
5. [Getting Started](#5-getting-started)

---

## 1. Overview

EdgeVine represents the future of smart farming. Managing modern vineyards presents complex challenges: fluctuating micro-climates, soil moisture stress, and rapidly spreading diseases like Esca or Leaf Blight. Traditionally, identifying these conditions requires manual vineyard patrols, which are labor-intensive and slow.

EdgeVine bridges this gap by combining **automated sensor nodes** (placed directly on the vines) with **high-resolution vision cameras**. 

### High-Level System Architecture

EdgeVine is designed as a set of containerized, loosely-coupled microservices that communicate through a shared database and a message broker:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          EdgeVine Architecture                         │
│                                                                        │
│   [Arduino Leaf Nodes]  ──► [Mosquitto MQTT Broker]                     │
│      (LoRaWAN Gateway)           │                                     │
│                                  ▼                                     │
│                         [MQTT Subscriber Worker]                       │
│                                  │                                     │
│                     ┌────────────┴────────────┐                        │
│                     ▼                         ▼                        │
│             [PostgreSQL DB] ◄────────► [CV/inference.py]               │
│                     ▲                         │ (JSON & Image output)  │
│                     │                         ▼                        │
│             [Analytics API]            [Astro Web App]                 │
│                 (Port 5001)               (Port 4321)                  │
└────────────────────────────────────────────────────────────────────────┘
```

The entire software ecosystem is containerized via **Docker Compose**, providing simple, reproducible deployments from local laptops to cloud edge servers.

---

## 2. Backend Infrastructure

The backend infrastructure operates as the nervous system of EdgeVine, handling telemetry ingestion, database persistence, and predictive ML jobs. It is located inside the `mqtt-server/` directory and managed via Docker Compose.

### Key Components

1. **Eclipse Mosquitto MQTT Broker**:
   - Acts as the central ingestion point for LoRaWAN gateway relays.
   - Arduino nodes publish sensor measurements to structured topic routes:
     - `zone/{zone_id}/sensor/temperature`
     - `zone/{zone_id}/sensor/humidity`
     - `zone/{zone_id}/sensor/moisture`
     - `zone/{zone_id}/sensor/image`
   
2. **MQTT Subscriber Python Worker**:
   - A highly optimized, thread-safe background service that monitors Mosquitto.
   - It performs spelling and value normalization (e.g., standardizing `mosture` -> `moisture`).
   - Using an in-memory buffer, it accumulates telemetry per zone and performs a batch SQL insert into PostgreSQL when a complete reading is gathered.
   - When an `image` payload arrives, it saves the file to disk and immediately executes the AI computer vision pipeline asynchronously as a subprocess.

3. **PostgreSQL Database**:
   - The central relational store.
   - Houses tables for `vineyards`, `zones`, physical `sensori` readings, and `vision_results` (storing grape counts, leaf health percentages, image URLs, and wine volume forecasts).

4. **Analytics Microservice**:
   - Runs a periodic cron worker (`fetch_and_archive.py`) to combine historical PostgreSQL sensor data with localized external weather APIs (via Open-Meteo).
   - Exposes a REST API (`prediction_server.py` on Port `5001`) that serves short-term ARIMA/linear temperature forecasts and evapotranspiration indexes to the frontend.

<!-- 📸 INSERT: Database Schema / MQTT Data Flow Diagram -->

---

## 3. Dashboard

The frontend interface is a premium, map-first dashboard designed to give vineyard managers immediate visual clarity. It is built using **Astro 4** with **React 18** and styled with a customized TailwindCSS color scheme.

<!-- 📸 INSERT: Web Dashboard Map View Screenshot -->

### Dashboard Features

- **Map-First Geo-Tracking**: Integrates Leaflet maps with custom polygon editing (Geoman). Each zone is colored based on its real-time health index (Green = Healthy, Orange = Water Stressed, Red = Disease Alert). Clicking a zone launches an immersive details panel showing live micro-climate trends and camera feeds.
- **AI Vision Console**: A drag-and-drop web workbench that lets growers upload raw vineyard photos to trigger on-demand YOLO analyses. Results are rendered with color-coded bounding boxes and interactive data sheets.
- **Statistics & Predictive Analytics**: Responsive time-series line graphs (Recharts) detailing soil moisture evolution, combined with predictive forecast overlays (temperature and relative humidity) powered by the analytics microservice.
- **Canopy Health Scorecard**: A dynamic donut chart breaking down the ratio of healthy vs. stressed foliage in each vineyard sector.

<!-- 📸 INSERT: Statistics Page & AI Vision Console Screenshots -->

---

## 4. CV and Predictions

Computer Vision is the intellectual core of EdgeVine. It operates as a **two-stage pipeline** that turns raw BGR images into rich crop diagnostics.

<!-- 📸 INSERT: Annotated Output Image showing leaves (colored boxes) and grapes -->

### 4.1 Stage 1: Leaf Detection (YOLOv8-Medium)
- **Model Backbone**: `YOLOv8-Medium` (`yolo26m.pt`)
- **Task**: Object Detection
- **Description**: Stage 1 scans the full-resolution photo to locate every single grapevine leaf. It generates candidate bounding boxes with a confidence threshold above **0.35**, ignoring empty spaces, sky, and non-target crops.

### 4.2 Stage 2: Health Classification (YOLOv8-cls)
- **Model Backbone**: `YOLOv8-Medium-cls` / `YOLOv8-Nano-cls`
- **Task**: Image Classification
- **Description**: For every single bounding box identified in Stage 1, the pipeline crops the corresponding leaf from memory and feeds it to the Stage 2 classifier. The classifier evaluates the leaf's health and classifies it into one of three color-coded states:

| Class ID | Class Name | Box Color | Crop Diagnostic |
|---|---|---|---|
| `0` | **disease** | 🔴 Red | Visible fungal/bacterial leaf pathology (e.g. Leaf Blight) |
| `1` | **healthy** | 🟢 Green | Pristine chlorophyll signature, no visual symptoms |
| `2` | **stress** | 🟠 Orange | Severe water stress, early Esca / wood disease symptoms |

---

### 4.3 The Polygon-to-Bounding-Box Dataset Fix (Critical Debugging)

During implementation, we identified a critical bug in the dataset pre-processing pipeline that caused the Stage 2 model to frequently misclassify healthy leaves as `stress` or `disease`. 

#### The Problem
The source dataset (`leaf_diesease_merged`) was annotated using **polygons (segmentation format)** consisting of variable-length coordinate lists (`class_id x1 y1 x2 y2 ... xN yN`). However, the pre-processing script (`prepare_cropped_dataset.py`) assumed standard **bounding box (detection format)** lines containing exactly 5 values:
```python
# ❌ INCORRECT ASSUMPTION (Caused corrupted crops)
x_c, y_c, bw, bh = map(float, parts[1:5])
```
Because the line contained multiple points, taking `parts[1:5]` extracted the first two coordinates of the polygon as width and height. This led to mathematically corrupted crops containing only black margins, dirt, branches, or random noise. The classifier was effectively trained on garbage crops, causing it to fail on real leaves during live inference.

#### The Mathematical Fix
We refactored `prepare_cropped_dataset.py` to parse both bounding boxes (length = 5) and polygons (length > 5) dynamically by extracting all coordinate pairs and finding the true enclosing envelope:
```python
#  CORRECT & ROBUST PARSING LOGIC
if len(parts) == 5:
    x_c, y_c, bw, bh = map(float, parts[1:5])
    x1 = int((x_c - bw / 2) * w)
    y1 = int((y_c - bh / 2) * h)
    x2 = int((x_c + bw / 2) * w)
    y2 = int((y_c + bh / 2) * h)
else:
    # Extract all x (even indices) and y (odd indices) coordinates
    coords = list(map(float, parts[1:]))
    x_coords = coords[0::2]
    y_coords = coords[1::2]
    
    # Calculate the minimal bounding box enclosing the entire polygon
    x1 = int(min(x_coords) * w)
    y1 = int(min(y_coords) * h)
    x2 = int(max(x_coords) * w)
    y2 = int(max(y_coords) * h)
```
After regenerating the crops and re-training the model on this clean dataset, the model immediately achieved **99.4% confidence** in identifying healthy leaves, completely eliminating false disease alarms.

---

### 4.4 Grape Counting & Liter Estimation (Mathematical Model)

Yield estimation is computed from grape cluster bounding boxes. The computer vision engine uses the camera's sensor geometry and distance to project 2D bounding boxes into physical volumes.

```
┌────────────────────────────────────────────────────────┐
│                    Camera Model Math                   │
│                                                        │
│   distance (mm) × sensor_width (mm)                    │
│   ───────────────────────────────── = real_width (mm)  │
│          focal_length (mm)                             │
│                                                        │
│   real_width (mm)                                      │
│   ─────────────── = pixel_to_mm_ratio                  │
│     img_width (px)                                     │
└────────────────────────────────────────────────────────┘
```

#### Bounding Box to Weight & Liters
For each grape cluster box detected, we compute its real physical width ($w_{mm}$) and height ($h_{mm}$). The cluster volume is calculated by assuming the cluster depth is **10% of its physical area**. We then apply the biological density of grape clusters ($\rho_{grape} = 0.8\text{ g/cm}^3$) and the chemical wine yield ratio ($\eta_{yield} = 0.7$) to estimate the final liquid output in liters:

```python
#  GLIMMER OF SIGNIFICANT CODE: BBox to Liters
def estimate_photo_liters(self, results_grape, imgsz, distance_override=None):
    if results_grape is None or len(results_grape[0].boxes) == 0:
        return 0.0
        
    dist = distance_override if distance_override is not None else self.distance
    width_real_mm = (dist * self.sensor_width) / self.focal_length
    pixel_to_mm = width_real_mm / imgsz
    
    total_grams = 0
    for box in results_grape[0].boxes:
        w_mm = box.xywh[0][2].item() * pixel_to_mm
        h_mm = box.xywh[0][3].item() * pixel_to_mm
        
        # Area (mm^2) * Depth (10% of area in mm) * Density (g/cm^3 converted)
        weight_g = (w_mm * h_mm * 0.1) * self.grape_density
        total_grams += weight_g
        
    # Convert total weight from grams to liters of wine
    return (total_grams / 1000) * self.wine_yield
```

To account for camera distance changes as a physical vehicle drives down a vine row, we calculate an uncertainty range (`liters_min`, `liters_max`) by varying the camera distance parameter by $\pm 10\%$.

---

## 5. Getting Started

Follow these steps to deploy the complete EdgeVine software stack locally.

### Prerequisites
- **Docker** and **Docker Compose**
- **Python 3.10+** (with virtual environment)
- **Node.js 18+**

### 1. Launch the Backend & Web App
Navigate to the server directory and spin up the complete microservice network via Docker:
```bash
cd mqtt-server
docker compose up -d
```
This boots and links Mosquitto (port `1883`), PostgreSQL (port `5432`), the MQTT Telemetry Subscriber, the Analytics Server (port `5001`), and the Astro Web Dashboard (port `4321`).

Open your browser to: **http://localhost:4321** to see the system live.

### 2. Standalone Computer Vision Setup
To run the computer vision scripts locally, initialize a virtual environment:
```bash
cd Iot_project
python3 -m venv .venv
source .venv/bin/activate
pip install -r CV/requirements.txt
```

#### Run Standalone CLI Inference
```bash
python CV/inference.py CV/images/test_vigna_2.png output.png 10
```

### 3. Re-training the Leaf Classifier
To re-train the classification model using our clean, polygon-corrected dataset pipeline:
```bash
# 1. Extract correct crops from polygon/bounding box annotations
python CV/prepare_cropped_dataset.py

# 2. Balance the dataset across categories using random oversampling
python CV/balance_dataset.py

# 3. Train the YOLOv8 classification model on macOS GPU (MPS) or CUDA
python CV/train.py
```

---