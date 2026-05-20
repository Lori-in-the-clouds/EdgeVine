import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const result = await sql<any>(`SELECT value FROM app_settings WHERE key = 'vision'`);
    if (result.rows.length > 0) {
      return new Response(JSON.stringify({ success: true, settings: result.rows[0].value }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: true, settings: { depth_uncertainty_pct: 10 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { depth_uncertainty_pct } = body;
    
    if (depth_uncertainty_pct === undefined || depth_uncertainty_pct === null) {
      return new Response(JSON.stringify({ success: false, error: 'Missing depth_uncertainty_pct' }), { status: 400 });
    }

    if (typeof depth_uncertainty_pct !== 'number' || depth_uncertainty_pct < 0 || depth_uncertainty_pct > 50) {
      return new Response(JSON.stringify({ success: false, error: 'depth_uncertainty_pct must be a number between 0 and 50' }), { status: 400 });
    }

    const value = JSON.stringify({ depth_uncertainty_pct });
    
    await sql(
      `INSERT INTO app_settings (key, value) VALUES ('vision', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP`,
      [value]
    );

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};
