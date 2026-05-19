import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { moisturePercentSql, normalizeMoisturePercent } from '../../lib/telemetry';

type SensorAggregate = Record<string, unknown> & {
  bucket: Date | string;
  temperature: number | string | null;
  humidity: number | string | null;
  moisture: number | string | null;
};

type Metric = 'temperature' | 'moisture';

type SensorPoint = {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
  moisture: number | null;
};

type ForecastPoint = {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
};

type AlertPayload = {
  status: 'OK' | 'ALARM';
  danger_start_time: string | null;
  min_value: number | null;
  min_time: string | null;
};

type ForecastPayload = {
  forecast: ForecastPoint[];
  alerts: AlertPayload;
  last_updated: string | null;
};

const FORECAST_WINDOWS = {
  temperature: 48,
  moisture: 72
} as const;

function toNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestamp(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  if (mean === null || values.length < 2) {
    return 0;
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function getMetricValue(point: SensorPoint, metric: Metric): number | null {
  return point[metric];
}

function normalizeRows(rows: SensorAggregate[]): SensorPoint[] {
  return rows
    .map((row) => {
      const timestamp = toTimestamp(row.bucket);
      if (!timestamp) {
        return null;
      }

      return {
        timestamp,
        temperature: toNumber(row.temperature),
        humidity: toNumber(row.humidity),
        moisture: normalizeMoisturePercent(row.moisture, 2)
      };
    })
    .filter((point): point is SensorPoint => point !== null)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function recentTrend(values: number[]): number {
  if (values.length < 8) {
    return 0;
  }

  const recent = values.slice(-6);
  const previous = values.slice(-12, -6);
  const recentAverage = average(recent);
  const previousAverage = average(previous);

  if (recentAverage === null || previousAverage === null) {
    return 0;
  }

  return (recentAverage - previousAverage) / Math.max(recent.length, 1);
}

function sameHourAverage(points: SensorPoint[], metric: Metric, hour: number): number | null {
  const values = points
    .filter((point) => point.timestamp.getHours() === hour)
    .map((point) => getMetricValue(point, metric))
    .filter((value): value is number => value !== null)
    .slice(-14);

  return average(values);
}

function buildForecast(points: SensorPoint[], metric: Metric, hours: number): ForecastPayload {
  const validPoints = points.filter((point) => getMetricValue(point, metric) !== null);
  const values = validPoints
    .map((point) => getMetricValue(point, metric))
    .filter((value): value is number => value !== null);

  if (validPoints.length === 0 || values.length === 0) {
    return {
      forecast: [],
      alerts: {
        status: 'OK',
        danger_start_time: null,
        min_value: null,
        min_time: null
      },
      last_updated: null
    };
  }

  const lastPoint = validPoints[validPoints.length - 1] as SensorPoint;
  const lastValue = getMetricValue(lastPoint, metric) ?? 0;
  const recentValues = values.slice(-48);
  const recentAverage = average(recentValues) ?? lastValue;
  const trendPerHour = recentTrend(values);
  const spreadFloor = metric === 'temperature' ? 1.5 : 4;
  const relativeSpread = metric === 'temperature' ? 0.04 : 0.06;
  const spread = Math.max(
    spreadFloor,
    standardDeviation(recentValues) * 0.7,
    Math.abs(recentAverage) * relativeSpread
  );

  const baseTime = new Date(lastPoint.timestamp);
  baseTime.setMinutes(0, 0, 0);

  const forecast: ForecastPoint[] = Array.from({ length: hours }, (_, index) => {
    const step = index + 1;
    const timestamp = new Date(baseTime);
    timestamp.setHours(timestamp.getHours() + step);

    const seasonalAverage = sameHourAverage(validPoints, metric, timestamp.getHours()) ?? recentAverage;
    const trendEstimate = lastValue + trendPerHour * Math.min(step, 12);
    let yhat = seasonalAverage * 0.6 + trendEstimate * 0.4;

    if (metric === 'moisture') {
      yhat = clamp(yhat, 0, 100);
    }

    const wideningSpread = spread * (1 + step / (hours * 2));
    const lower = metric === 'moisture' ? clamp(yhat - wideningSpread, 0, 100) : yhat - wideningSpread;
    const upper = metric === 'moisture' ? clamp(yhat + wideningSpread, 0, 100) : yhat + wideningSpread;

    return {
      ds: timestamp.toISOString(),
      yhat: round(yhat),
      yhat_lower: round(lower),
      yhat_upper: round(upper)
    };
  });

  return {
    forecast,
    alerts: buildAlerts(forecast, metric),
    last_updated: new Date().toISOString()
  };
}

function buildAlerts(forecast: ForecastPoint[], metric: Metric): AlertPayload {
  if (forecast.length === 0) {
    return {
      status: 'OK',
      danger_start_time: null,
      min_value: null,
      min_time: null
    };
  }

  const firstForecastPoint = forecast[0] as ForecastPoint;
  const minimum = forecast.reduce(
    (min, point) => (point.yhat < min.yhat ? point : min),
    firstForecastPoint
  );
  const threshold = metric === 'temperature' ? 2 : 25;
  const dangerPoint = forecast.find((point) =>
    metric === 'temperature' ? point.yhat <= threshold : point.yhat < threshold
  );

  return {
    status: dangerPoint ? 'ALARM' : 'OK',
    danger_start_time: dangerPoint?.ds ?? null,
    min_value: minimum.yhat,
    min_time: minimum.ds
  };
}

export const GET: APIRoute = async () => {
  try {
    const moisturePercent = moisturePercentSql('moisture');
    const history = await sql<SensorAggregate>(`
      SELECT
        date_trunc('hour', timestamp) AS bucket,
        AVG(temperature)::float8 AS temperature,
        AVG(humidity)::float8 AS humidity,
        AVG(${moisturePercent})::float8 AS moisture
      FROM sensor_measurements
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY bucket ASC
    `);

    const points = normalizeRows(history.rows);

    if (points.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        status: 'no_data',
        error: 'No sensor measurements available for prediction.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      status: 'ready',
      data: {
        moisture: buildForecast(points, 'moisture', FORECAST_WINDOWS.moisture),
        temperature: buildForecast(points, 'temperature', FORECAST_WINDOWS.temperature)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown prediction error';
    console.error('Predictions API Error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: message,
      status: 'unavailable'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
