import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const result = await sql<any>(`
      SELECT 
        sd.temperature, 
        sd.humidity, 
        sd.moisture,
        TO_CHAR(sd.timestamp, 'HH24:MI') as time
      FROM sensor_data sd
      ORDER BY sd.timestamp DESC 
      LIMIT 20
    `);
    
    // Reverse to get chronological order for charts
    const data = result.rows.reverse();

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
