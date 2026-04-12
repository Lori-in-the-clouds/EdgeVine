import { s as sql } from './db_CrRhzScM.mjs';

const GET = async () => {
  try {
    const result = await sql(`
      SELECT 
        sd.temperature, 
        sd.humidity, 
        sd.moisture,
        TO_CHAR(sd.timestamp, 'HH24:MI') as time
      FROM sensor_data sd
      ORDER BY sd.timestamp DESC 
      LIMIT 20
    `);
    const data = result.rows.reverse();
    return new Response(
      JSON.stringify({ success: true, data }),
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
