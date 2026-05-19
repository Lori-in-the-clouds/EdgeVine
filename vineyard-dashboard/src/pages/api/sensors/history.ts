import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import {
  normalizeMoisturePercent,
  normalizePercent,
  roundTo,
  toFiniteNumber
} from '../../../lib/telemetry';

export const GET: APIRoute = async () => {
  try {
    const result = await sql<any>(`
      SELECT 
        sd.temperature, 
        sd.humidity, 
        sd.moisture,
        TO_CHAR(sd.timestamp, 'FMHH12 AM') as time
      FROM sensor_measurements sd
      ORDER BY sd.timestamp DESC 
      LIMIT 20
    `);
    
    // Reverse to get chronological order for charts
    const data = result.rows.reverse().map((row) => {
      const temperature = toFiniteNumber(row.temperature);

      return {
        ...row,
        temperature: temperature === null ? null : roundTo(temperature, 1),
        humidity: normalizePercent(row.humidity),
        moisture: normalizeMoisturePercent(row.moisture)
      };
    });

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
