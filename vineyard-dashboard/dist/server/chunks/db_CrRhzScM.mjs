import pg from 'pg';

const { Pool } = pg;
function buildPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "sensori",
    user: process.env.POSTGRES_USER ?? "sensore_user",
    password: process.env.POSTGRES_PASSWORD ?? "sensore_password"
  });
}
const pool = globalThis.vineyardDashboardPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.vineyardDashboardPool = pool;
}
async function sql(text, params = []) {
  return pool.query(text, params);
}

export { sql as s };
