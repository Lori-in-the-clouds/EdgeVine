import { s as sql } from './db_CrRhzScM.mjs';

const GET = async () => {
  try {
    const result = await sql(`
      SELECT 
        vz.id as zone_id, 
        vz.number as zone_number,
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
    const enrichData = result.rows.map((row) => {
      const leafCount = Math.floor(Math.random() * 50) + 100;
      return {
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        leafCount,
        predictedWineLiters: leafCount * 0.5
      };
    });
    return new Response(
      JSON.stringify({ success: true, data: enrichData }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
