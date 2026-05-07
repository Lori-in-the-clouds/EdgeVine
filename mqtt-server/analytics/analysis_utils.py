import pandas as pd
import numpy as np
import plotly.express as px
from prophet import Prophet
from prophet.plot import plot_plotly



def initialize_db(path_parquet) -> pd.DataFrame:

    # 1. Load the dataset
    df = pd.read_parquet(path_parquet)

    # 1. Convert timestamp to datetime format
    df['timestamp'] = pd.to_datetime(df['timestamp'])

    # 2. Sort data chronologically (for time series)
    df = df.sort_values('timestamp').reset_index(drop=True)

    # 3. Remove duplicates
    df = df.drop_duplicates(subset=['timestamp', 'sensor_id'])

    # 4. Clean negative values (Except temperature)
    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    exceptions = ['temperature', 'weather_temp']
    to_check = [c for c in numeric_columns if c not in exceptions]
    df = df[(df[to_check] >= 0).all(axis=1)]

    # 5. Interpolation (Filling data gaps)
    df['moisture'] = df['moisture'].interpolate()
    df['temperature'] = df['temperature'].interpolate()
    return df


def create_global_df(df: pd.DataFrame) -> pd.DataFrame:
    
    global_df = df.groupby('timestamp').agg({
        'moisture': 'mean',
        'temperature': 'mean',
        'weather_rain': 'mean',
        'grape_count': 'sum',
        'humidity': 'mean'
    }).reset_index()
    return global_df


def prediction_moisture(global_df: pd.DataFrame):
    # Prepare the dataset for Prophet with Regressors
    moisture_prophet_df = global_df[['timestamp', 'moisture', 'temperature', 'weather_rain']].copy()
    moisture_prophet_df.columns = ['ds', 'y', 'temp', 'rain']
    moisture_prophet_df['ds'] = moisture_prophet_df['ds'].dt.tz_localize(None)
    # Initialize the model with Extra Regressors
    m_moisture = Prophet(daily_seasonality=True, weekly_seasonality=True)
    m_moisture.add_regressor('temp')
    m_moisture.add_regressor('rain')
    # Training
    m_moisture.fit(moisture_prophet_df)

    # Create future dates for the next 3 days (72 hours)
    future = m_moisture.make_future_dataframe(periods=72, freq='h')
    # Weather simulation for the future (e.g., 28 stable degrees and 0 rain)
    future['temp'] = moisture_prophet_df['temp'].tolist() + [28.0] * 72
    future['rain'] = moisture_prophet_df['rain'].tolist() + [0.0] * 72
    # Prediction
    moisture_forecast = m_moisture.predict(future)
    return m_moisture, moisture_forecast

def prediction_temperature(global_df: pd.DataFrame):
    # 1. Prepare data
    temperature_prophet_df = global_df[['timestamp', 'temperature', 'weather_rain', 'humidity']].copy()
    temperature_prophet_df.columns = ['ds', 'y', 'rain', 'air_humidity']
    temperature_prophet_df['ds'] = temperature_prophet_df['ds'].dt.tz_localize(None)

    # 2. Initialize model for Temperature
    m_temperature = Prophet(daily_seasonality=True, weekly_seasonality=False)
    # Add air humidity as a regressor (it strongly affects night frost)
    m_temperature.add_regressor('air_humidity')
    m_temperature.add_regressor('rain')
    m_temperature.fit(temperature_prophet_df)
    # 3. Create future dates for the next 48 hours (two nights)
    future_temperature = m_temperature.make_future_dataframe(periods=48, freq='h')
    # Simulate future air humidity (e.g., 60%) and 0 rain
    future_temperature['air_humidity'] = temperature_prophet_df['air_humidity'].tolist() + [60.0] * 48
    future_temperature['rain'] = temperature_prophet_df['rain'].tolist() + [0.0] * 48
    # 4. Prediction
    temperature_forecast = m_temperature.predict(future_temperature)
    return m_temperature, temperature_forecast


def moisture_alerts(moisture_forecast, danger_threshold=25.0):
    # 1. Find the absolute MINIMUM point
    min_index = moisture_forecast['yhat'].tail(72).idxmin()
    min_value = moisture_forecast.loc[min_index, 'yhat']
    min_time = moisture_forecast.loc[min_index, 'ds']

    # 2. Find when the problem STARTS
    future_data = moisture_forecast.tail(72)
    below_threshold = future_data[future_data['yhat'] < danger_threshold]

    # Best Practice: Consistent dictionary structure
    is_alarm = not below_threshold.empty
    
    return {
        'status': 'ALARM' if is_alarm else 'OK',
        'danger_start_time': below_threshold.iloc[0]['ds'] if is_alarm else None,
        'min_value': float(min_value),
        'min_time': min_time
    }


def temperature_alerts(temperature_forecast, frost_threshold=2.0):
    # 1. Analyze the next 48 hours
    frost_future_data = temperature_forecast.tail(48)

    # 2. Find the absolute cold peak
    frost_min_index = frost_future_data['yhat'].idxmin()
    min_temp = frost_future_data.loc[frost_min_index, 'yhat']
    min_time = frost_future_data.loc[frost_min_index, 'ds']

    # 3. Find when temperature drops below threshold
    frost_below_threshold = frost_future_data[frost_future_data['yhat'] <= frost_threshold]

    is_alarm = not frost_below_threshold.empty

    return {
        'status': 'ALARM' if is_alarm else 'OK',
        'danger_start_time': frost_below_threshold.iloc[0]['ds'] if is_alarm else None,
        'min_value': float(min_temp),
        'min_time': min_time
    }


def plot_moisture_prediction(m_moisture, moisture_forecast):
    fig = plot_plotly(m_moisture, moisture_forecast)
    fig.update_layout(
        title="Prediction: Soil Moisture (Next 72h)",
        template="plotly_dark",
        xaxis_title="Time",
        yaxis_title="Moisture (%)"
    )
    return fig

def plot_temperature_prediction(m_temperature, temperature_forecast):
    fig = plot_plotly(m_temperature, temperature_forecast)
    fig.update_layout(
        title="Prediction: Temperature (Next 48h)",
        template="plotly_dark",
        xaxis_title="Time",
        yaxis_title="Temperature (°C)"
    )
    return fig

    