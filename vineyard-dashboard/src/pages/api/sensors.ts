import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

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
        sd.temperature, 
        sd.humidity, 
        sd.moisture,
        sd.timestamp
      FROM vine_zone vz
      JOIN vineyard v ON v.id = vz.vineyard_id
      LEFT JOIN LATERAL (
        SELECT temperature, humidity, moisture, timestamp
        FROM sensor_data 
        WHERE vine_zone_id = vz.id 
        ORDER BY timestamp DESC 
        LIMIT 1
      ) sd ON true
    `);
    
    // Enrich with prediction logic and leaf count
    const enrichData = result.rows.map(row => {
      const leafCount = Math.floor(Math.random() * 50) + 100;

      return {
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        leafCount,
        predictedWineLiters: (leafCount * 0.5) 
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
