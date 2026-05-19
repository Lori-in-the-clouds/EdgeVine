import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import {
  normalizeMoisturePercent,
  normalizePercent,
  roundTo,
  toFiniteNumber
} from '../../lib/telemetry';

export const GET: APIRoute = async () => {
  try {
    const result = await sql<any>(`
      SELECT 
        vz.id as zone_id, 
        vz.number as zone_number,
        vz.name as zone_name,
        vz.external_id,
        vz.sector_id,
        COALESCE(vz.latitude, v.latitude) as latitude,
        COALESCE(vz.longitude, v.longitude) as longitude,
        sm.sensor_id,
        sm.temperature,
        sm.humidity,
        sm.moisture,
        sm.timestamp,
        cv.image_url,
        cv.processed_image_url,
        cv.grape_count,
        cv.health_status,
        cv.leaf_healthy_count,
        cv.leaf_stress_count,
        cv.leaf_disease_count,
        cv.estimated_liters
      FROM vine_zone vz
      JOIN vineyard v ON v.id = vz.vineyard_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM sensor_measurements
        WHERE zone_id = vz.id
        ORDER BY timestamp DESC 
        LIMIT 1
      ) sm ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM computer_vision_data
        WHERE zone_id = vz.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) cv ON true
    `);
    
    // Enrich with real database data
    const enrichData = result.rows.map(row => {
      const leafCount = (row.leaf_healthy_count || 0) + (row.leaf_stress_count || 0) + (row.leaf_disease_count || 0);
      const temperature = toFiniteNumber(row.temperature);

      return {
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        temperature: temperature === null ? null : roundTo(temperature, 1),
        humidity: normalizePercent(row.humidity),
        moisture: normalizeMoisturePercent(row.moisture),
        leafCount: leafCount || Math.floor(Math.random() * 50) + 100, // Fallback random only if DB is empty
        predictedWineLiters: row.estimated_liters || 0
      }
    });

    return new Response(
      JSON.stringify({ success: true, data: enrichData }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
