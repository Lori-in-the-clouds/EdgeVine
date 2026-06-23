import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

type AlertType = 'infestation' | 'hydraulic' | 'environmental';

const ALERT_TYPES = new Set<AlertType>(['infestation', 'hydraulic', 'environmental']);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAlertType(value: unknown): AlertType | null {
  if (typeof value !== 'string') return null;
  return ALERT_TYPES.has(value as AlertType) ? (value as AlertType) : null;
}

function fallbackTitle(type: AlertType) {
  if (type === 'infestation') return 'Manual Pest Report';
  if (type === 'hydraulic') return 'Health & Nutrition Report';
  return 'Environmental Alert';
}

async function getCurrentVineyard() {
  const result = await sql<any>(`
    SELECT id, latitude, longitude
    FROM vineyard
    ORDER BY id ASC
    LIMIT 1
  `);

  return result.rows[0] ?? null;
}

function toAlert(row: any) {
  return {
    id: String(row.id),
    vineyardId: Number(row.vineyard_id),
    vineyardName: row.vineyard_name ?? 'Vineyard Estate',
    type: row.alert_type,
    title: row.title,
    description: row.description,
    lat: Number(row.source_latitude),
    lng: Number(row.source_longitude),
    distanceKm: Number(row.distance_km ?? 0),
    createdAt: row.created_at
  };
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const currentVineyard = await getCurrentVineyard();
    if (!currentVineyard) {
      return json({ success: true, data: [] });
    }

    const url = new URL(request.url);
    const radiusKm = toFiniteNumber(url.searchParams.get('radiusKm')) ?? 30;
    const centerLat = toFiniteNumber(url.searchParams.get('lat')) ?? toFiniteNumber(currentVineyard.latitude);
    const centerLng = toFiniteNumber(url.searchParams.get('lng')) ?? toFiniteNumber(currentVineyard.longitude);

    if (centerLat === null || centerLng === null || radiusKm <= 0) {
      return json({ success: false, error: 'Missing vineyard center coordinates' }, 400);
    }

    const result = await sql<any>(`
      WITH alert_distances AS (
        SELECT
          na.id,
          na.vineyard_id,
          COALESCE(v.name_vineyard, v.name) AS vineyard_name,
          na.source_latitude,
          na.source_longitude,
          na.alert_type,
          na.title,
          na.description,
          TO_CHAR(na.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
          (
            6371 * ACOS(
              LEAST(
                1,
                GREATEST(
                  -1,
                  COS(RADIANS($1)) * COS(RADIANS(na.source_latitude)) *
                  COS(RADIANS(na.source_longitude) - RADIANS($2)) +
                  SIN(RADIANS($1)) * SIN(RADIANS(na.source_latitude))
                )
              )
            )
          ) AS distance_km
        FROM network_alerts na
        JOIN vineyard v ON v.id = na.vineyard_id
      )
      SELECT *
      FROM alert_distances
      WHERE distance_km <= $3
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `, [centerLat, centerLng, radiusKm]);

    return json({ success: true, data: result.rows.map(toAlert) });
  } catch (err: any) {
    console.error('Alerts API GET Error:', err);
    return json({ success: false, error: err.message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const type = normalizeAlertType(body.type);
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!type) {
      return json({ success: false, error: 'Invalid alert type' }, 400);
    }

    if (!description) {
      return json({ success: false, error: 'Missing alert description' }, 400);
    }

    const currentVineyard = await getCurrentVineyard();
    if (!currentVineyard) {
      return json({ success: false, error: 'No vineyard configured' }, 400);
    }

    const sourceLat =
      toFiniteNumber(body.lat) ??
      toFiniteNumber(body.sourceLatitude) ??
      toFiniteNumber(currentVineyard.latitude);
    const sourceLng =
      toFiniteNumber(body.lng) ??
      toFiniteNumber(body.sourceLongitude) ??
      toFiniteNumber(currentVineyard.longitude);

    if (sourceLat === null || sourceLng === null) {
      return json({ success: false, error: 'Missing alert position' }, 400);
    }

    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : fallbackTitle(type);

    const result = await sql<any>(`
      INSERT INTO network_alerts (
        vineyard_id,
        source_latitude,
        source_longitude,
        alert_type,
        title,
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        vineyard_id,
        source_latitude,
        source_longitude,
        alert_type,
        title,
        description,
        TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
        0::float AS distance_km
    `, [
      Number(currentVineyard.id),
      sourceLat,
      sourceLng,
      type,
      title,
      description
    ]);

    return json({ success: true, data: toAlert(result.rows[0]) }, 201);
  } catch (err: any) {
    console.error('Alerts API POST Error:', err);
    return json({ success: false, error: err.message }, 500);
  }
};
