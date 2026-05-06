const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "sensori",
  user: "sensore_user",
  password: "sensore_password"
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        image_url, 
        grape_count, 
        health_status, 
        leaf_healthy_count,
        leaf_stress_count,
        leaf_disease_count 
      FROM sensor_data 
      WHERE image_url IS NOT NULL 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
