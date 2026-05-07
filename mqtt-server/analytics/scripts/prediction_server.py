"""
EdgeVine Prediction Server
A lightweight Flask API that runs Prophet predictions every 4 hours
and serves cached results to the dashboard.
"""

import os
import sys
import json
import threading
import time
import logging
from datetime import datetime
from flask import Flask, jsonify

# Add parent directory to path so we can import analysis_utils
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from analysis_utils import (
    initialize_db,
    create_global_df,
    prediction_moisture,
    prediction_temperature,
    moisture_alerts,
    temperature_alerts
)

# ─── Configuration ───────────────────────────────────────────────
PARQUET_PATH = os.getenv('PARQUET_PATH', '/app/archive/dataset_vigna.parquet')
PREDICTION_INTERVAL = int(os.getenv('PREDICTION_INTERVAL', '14400'))  # 4 hours in seconds
PORT = int(os.getenv('ANALYTICS_PORT', '5001'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ─── In-Memory Cache ─────────────────────────────────────────────
prediction_cache = {
    'moisture': {
        'forecast': [],
        'alerts': {},
        'last_updated': None
    },
    'temperature': {
        'forecast': [],
        'alerts': {},
        'last_updated': None
    },
    'status': 'idle',
    'error': None
}
cache_lock = threading.Lock()


def serialize_forecast(forecast_df, tail_n=None):
    """Convert Prophet forecast DataFrame to JSON-serializable list."""
    df = forecast_df if tail_n is None else forecast_df.tail(tail_n)
    # Select only the columns we need for the chart
    cols = ['ds', 'yhat', 'yhat_lower', 'yhat_upper']
    result = []
    for _, row in df[cols].iterrows():
        result.append({
            'ds': row['ds'].isoformat(),
            'yhat': round(float(row['yhat']), 2),
            'yhat_lower': round(float(row['yhat_lower']), 2),
            'yhat_upper': round(float(row['yhat_upper']), 2)
        })
    return result


def serialize_alerts(alerts_dict):
    """Convert alert dict to JSON-serializable format."""
    result = dict(alerts_dict)
    if result.get('min_time') is not None:
        result['min_time'] = str(result['min_time'])
    if result.get('danger_start_time') is not None:
        result['danger_start_time'] = str(result['danger_start_time'])
    return result


def run_predictions():
    """Run both moisture and temperature predictions."""
    global prediction_cache
    
    logger.info("Starting prediction cycle...")
    
    with cache_lock:
        prediction_cache['status'] = 'running'
        prediction_cache['error'] = None
    
    try:
        if not os.path.exists(PARQUET_PATH):
            raise FileNotFoundError(f"Parquet file not found at {PARQUET_PATH}")
        
        # 1. Load and clean data
        logger.info("Loading and cleaning data...")
        df = initialize_db(PARQUET_PATH)
        global_df = create_global_df(df)
        logger.info(f"Data loaded: {len(global_df)} aggregated rows")
        
        # 2. Run Moisture prediction
        logger.info("Running moisture prediction (72h)...")
        m_moisture, moisture_forecast = prediction_moisture(global_df)
        moisture_alert = moisture_alerts(moisture_forecast)
        
        # 3. Run Temperature prediction
        logger.info("Running temperature prediction (48h)...")
        m_temp, temp_forecast = prediction_temperature(global_df)
        temp_alert = temperature_alerts(temp_forecast)
        
        # 4. Serialize and cache results
        now = datetime.now().isoformat()
        
        with cache_lock:
            prediction_cache['moisture'] = {
                'forecast': serialize_forecast(moisture_forecast),
                'alerts': serialize_alerts(moisture_alert),
                'last_updated': now
            }
            prediction_cache['temperature'] = {
                'forecast': serialize_forecast(temp_forecast),
                'alerts': serialize_alerts(temp_alert),
                'last_updated': now
            }
            prediction_cache['status'] = 'ready'
            prediction_cache['error'] = None
        
        logger.info(f"Predictions cached successfully at {now}")
        logger.info(f"  Moisture alert: {moisture_alert['status']}")
        logger.info(f"  Frost alert: {temp_alert['status']}")
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        with cache_lock:
            prediction_cache['status'] = 'error'
            prediction_cache['error'] = str(e)


def prediction_scheduler():
    """Background thread that runs predictions on a fixed interval."""
    # Initial run on startup
    run_predictions()
    
    # Then loop every PREDICTION_INTERVAL seconds
    while True:
        time.sleep(PREDICTION_INTERVAL)
        logger.info(f"Scheduled prediction run (every {PREDICTION_INTERVAL}s)...")
        run_predictions()


# ─── API Routes ──────────────────────────────────────────────────

@app.route('/predictions', methods=['GET'])
def get_predictions():
    """Return cached prediction data."""
    with cache_lock:
        return jsonify({
            'success': prediction_cache['status'] == 'ready',
            'status': prediction_cache['status'],
            'error': prediction_cache['error'],
            'data': {
                'moisture': prediction_cache['moisture'],
                'temperature': prediction_cache['temperature']
            }
        })


@app.route('/predictions/refresh', methods=['POST'])
def refresh_predictions():
    """Manually trigger a prediction refresh."""
    threading.Thread(target=run_predictions, daemon=True).start()
    return jsonify({'success': True, 'message': 'Prediction refresh started'})


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'edgevine-analytics',
        'cache_status': prediction_cache['status'],
        'last_updated': prediction_cache['moisture'].get('last_updated')
    })


# ─── Entrypoint ──────────────────────────────────────────────────

if __name__ == '__main__':
    logger.info(f"EdgeVine Prediction Server starting on port {PORT}...")
    logger.info(f"Parquet path: {PARQUET_PATH}")
    logger.info(f"Prediction interval: {PREDICTION_INTERVAL}s ({PREDICTION_INTERVAL // 3600}h)")
    
    # Start the background prediction scheduler
    scheduler = threading.Thread(target=prediction_scheduler, daemon=True)
    scheduler.start()
    
    # Start Flask
    app.run(host='0.0.0.0', port=PORT, debug=False)
