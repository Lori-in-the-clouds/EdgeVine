import { s as sql } from './db_CrRhzScM.mjs';

const GET = async () => {
  try {
    const result = await sql(`SELECT * FROM vineyard LIMIT 1`);
    return new Response(
      JSON.stringify({ success: true, data: result.rows[0] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
const POST = async ({ request }) => {
  try {
    const { area, centroid, perimeter, zones } = await request.json();
    const coords = centroid.match(/[-+]?[0-9]*\.?[0-9]+/g);
    const lat = coords ? parseFloat(coords[0]) : 43.4633;
    const lng = coords ? parseFloat(coords[1]) : 11.3126;
    await sql(`
      UPDATE vineyard 
      SET 
        area = $1, 
        perimeter = $2,
        latitude = $3,
        longitude = $4
      WHERE id = 1
    `, [area, JSON.stringify(perimeter), lat, lng]);
    if (zones && Array.isArray(zones)) {
      for (const zone of zones) {
        await sql(`
          UPDATE vine_zone
          SET latitude = $1, longitude = $2
          WHERE vineyard_id = 1 AND number = $3
        `, [zone.latitude, zone.longitude, zone.number]);
      }
    }
    return new Response(
      JSON.stringify({ success: true, message: "Configuration and Sentinels saved successfully" }),
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
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
