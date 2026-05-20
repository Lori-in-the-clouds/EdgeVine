from __future__ import annotations

import json
import logging
import os
import sys
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import psycopg
from prophet import Prophet


FORECAST_WINDOWS = {
    "moisture": 72,
    "temperature": 48,
}


def _database_connection() -> psycopg.Connection[Any]:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url)

    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "sensori"),
        user=os.getenv("POSTGRES_USER", "sensore_user"),
        password=os.getenv("POSTGRES_PASSWORD", "sensore_password"),
    )


def _to_naive_datetime(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values, errors="coerce", utc=True).dt.tz_convert(None)


def initialize_db() -> pd.DataFrame:
    history_days = int(os.getenv("PREDICTION_HISTORY_DAYS", "30"))
    query = """
        SELECT
            date_trunc('hour', timestamp) AS timestamp,
            monitoring_node_id AS sensor_id,
            AVG(temperature)::float8 AS temperature,
            AVG(humidity)::float8 AS humidity,
            AVG(moisture)::float8 AS moisture
        FROM sensor_measurements
        WHERE timestamp >= NOW() - (%s::int * INTERVAL '1 day')
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC
    """

    with _database_connection() as conn:
        rows = conn.execute(query, (history_days,)).fetchall()

    df = pd.DataFrame(
        rows,
        columns=["timestamp", "sensor_id", "temperature", "humidity", "moisture"],
    )

    if df.empty:
        return df

    df["timestamp"] = _to_naive_datetime(df["timestamp"])
    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp").drop_duplicates(subset=["timestamp", "sensor_id"])

    for column in ["temperature", "humidity", "moisture"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df["weather_rain"] = 0.0
    df["grape_count"] = 0.0

    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    exceptions = ["temperature", "weather_temp"]
    to_check = [column for column in numeric_columns if column not in exceptions]
    if to_check:
        df = df[(df[to_check] >= 0).all(axis=1)]

    for column in ["moisture", "temperature", "humidity"]:
        df[column] = df.groupby("sensor_id")[column].transform(
            lambda series: series.interpolate(limit_direction="both")
        )

    return df.reset_index(drop=True)


def create_global_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    global_df = (
        df.groupby("timestamp")
        .agg(
            {
                "moisture": "mean",
                "temperature": "mean",
                "weather_rain": "mean",
                "grape_count": "sum",
                "humidity": "mean",
            }
        )
        .reset_index()
        .sort_values("timestamp")
    )

    for column in ["moisture", "temperature", "humidity", "weather_rain"]:
        global_df[column] = pd.to_numeric(global_df[column], errors="coerce")
        global_df[column] = global_df[column].interpolate(limit_direction="both")

    return global_df.dropna(subset=["timestamp", "moisture", "temperature", "humidity"])


def _recent_average(series: pd.Series, fallback: float) -> float:
    recent = pd.to_numeric(series.tail(24), errors="coerce").dropna()
    if recent.empty:
        return fallback

    return float(recent.mean())


def prediction_moisture(global_df: pd.DataFrame):
    moisture_prophet_df = global_df[["timestamp", "moisture", "temperature", "weather_rain"]].copy()
    moisture_prophet_df.columns = ["ds", "y", "temp", "rain"]
    moisture_prophet_df["ds"] = _to_naive_datetime(moisture_prophet_df["ds"])

    m_moisture = Prophet(daily_seasonality=True, weekly_seasonality=True)
    m_moisture.add_regressor("temp")
    m_moisture.add_regressor("rain")
    m_moisture.fit(moisture_prophet_df)

    future = m_moisture.make_future_dataframe(periods=FORECAST_WINDOWS["moisture"], freq="h")
    future_temp = _recent_average(moisture_prophet_df["temp"], float(moisture_prophet_df["temp"].iloc[-1]))
    future["temp"] = moisture_prophet_df["temp"].tolist() + [future_temp] * FORECAST_WINDOWS["moisture"]
    future["rain"] = moisture_prophet_df["rain"].tolist() + [0.0] * FORECAST_WINDOWS["moisture"]

    moisture_forecast = m_moisture.predict(future)
    for column in ["yhat", "yhat_lower", "yhat_upper"]:
        moisture_forecast[column] = moisture_forecast[column].clip(lower=0, upper=100)

    return m_moisture, moisture_forecast


def prediction_temperature(global_df: pd.DataFrame):
    temperature_prophet_df = global_df[["timestamp", "temperature", "weather_rain", "humidity"]].copy()
    temperature_prophet_df.columns = ["ds", "y", "rain", "air_humidity"]
    temperature_prophet_df["ds"] = _to_naive_datetime(temperature_prophet_df["ds"])

    m_temperature = Prophet(daily_seasonality=True, weekly_seasonality=False)
    m_temperature.add_regressor("air_humidity")
    m_temperature.add_regressor("rain")
    m_temperature.fit(temperature_prophet_df)

    future_temperature = m_temperature.make_future_dataframe(periods=FORECAST_WINDOWS["temperature"], freq="h")
    future_humidity = _recent_average(
        temperature_prophet_df["air_humidity"],
        float(temperature_prophet_df["air_humidity"].iloc[-1]),
    )
    future_temperature["air_humidity"] = (
        temperature_prophet_df["air_humidity"].tolist()
        + [future_humidity] * FORECAST_WINDOWS["temperature"]
    )
    future_temperature["rain"] = (
        temperature_prophet_df["rain"].tolist()
        + [0.0] * FORECAST_WINDOWS["temperature"]
    )

    temperature_forecast = m_temperature.predict(future_temperature)
    return m_temperature, temperature_forecast


def _iso_timestamp(value: Any) -> str:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)

    return timestamp.isoformat()


def _round_float(value: Any) -> float:
    return round(float(value), 2)


def _format_forecast(forecast: pd.DataFrame, hours: int) -> list[dict[str, Any]]:
    future = forecast.tail(hours).copy()
    return [
        {
            "ds": _iso_timestamp(row["ds"]),
            "yhat": _round_float(row["yhat"]),
            "yhat_lower": _round_float(row["yhat_lower"]),
            "yhat_upper": _round_float(row["yhat_upper"]),
        }
        for _, row in future.iterrows()
    ]


def moisture_alerts(moisture_forecast: pd.DataFrame, danger_threshold: float = 25.0):
    future_data = moisture_forecast.tail(FORECAST_WINDOWS["moisture"])
    min_index = future_data["yhat"].idxmin()
    min_value = future_data.loc[min_index, "yhat"]
    min_time = future_data.loc[min_index, "ds"]
    below_threshold = future_data[future_data["yhat"] < danger_threshold]
    is_alarm = not below_threshold.empty

    return {
        "status": "ALARM" if is_alarm else "OK",
        "danger_start_time": _iso_timestamp(below_threshold.iloc[0]["ds"]) if is_alarm else None,
        "min_value": _round_float(min_value),
        "min_time": _iso_timestamp(min_time),
    }


def temperature_alerts(temperature_forecast: pd.DataFrame, frost_threshold: float = 2.0):
    future_data = temperature_forecast.tail(FORECAST_WINDOWS["temperature"])
    min_index = future_data["yhat"].idxmin()
    min_temp = future_data.loc[min_index, "yhat"]
    min_time = future_data.loc[min_index, "ds"]
    below_threshold = future_data[future_data["yhat"] <= frost_threshold]
    is_alarm = not below_threshold.empty

    return {
        "status": "ALARM" if is_alarm else "OK",
        "danger_start_time": _iso_timestamp(below_threshold.iloc[0]["ds"]) if is_alarm else None,
        "min_value": _round_float(min_temp),
        "min_time": _iso_timestamp(min_time),
    }


def _forecast_payload(forecast: pd.DataFrame, hours: int, alerts: dict[str, Any]) -> dict[str, Any]:
    return {
        "forecast": _format_forecast(forecast, hours),
        "alerts": alerts,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def build_prediction_response() -> dict[str, Any]:
    df = initialize_db()
    global_df = create_global_df(df)

    if global_df.empty or len(global_df) < 2:
        return {
            "success": False,
            "status": "no_data",
            "error": "At least two sensor measurement hours are required for prediction.",
        }

    with redirect_stdout(sys.stderr):
        _, moisture_forecast = prediction_moisture(global_df)
        _, temperature_forecast = prediction_temperature(global_df)

    return {
        "success": True,
        "status": "ready",
        "data": {
            "moisture": _forecast_payload(
                moisture_forecast,
                FORECAST_WINDOWS["moisture"],
                moisture_alerts(moisture_forecast),
            ),
            "temperature": _forecast_payload(
                temperature_forecast,
                FORECAST_WINDOWS["temperature"],
                temperature_alerts(temperature_forecast),
            ),
        },
    }


def plot_moisture_prediction(m_moisture, moisture_forecast):
    from prophet.plot import plot_plotly

    fig = plot_plotly(m_moisture, moisture_forecast)
    fig.update_layout(
        title="Prediction: Soil Moisture (Next 72h)",
        template="plotly_dark",
        xaxis_title="Time",
        yaxis_title="Moisture (%)",
    )
    return fig


def plot_temperature_prediction(m_temperature, temperature_forecast):
    from prophet.plot import plot_plotly

    fig = plot_plotly(m_temperature, temperature_forecast)
    fig.update_layout(
        title="Prediction: Temperature (Next 48h)",
        template="plotly_dark",
        xaxis_title="Time",
        yaxis_title="Temperature (C)",
    )
    return fig


def main() -> int:
    logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
    logging.getLogger("prophet").setLevel(logging.WARNING)

    try:
        print(json.dumps(build_prediction_response()))
        return 0
    except Exception as error:
        print(
            json.dumps(
                {
                    "success": False,
                    "status": "unavailable",
                    "error": str(error),
                }
            )
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
