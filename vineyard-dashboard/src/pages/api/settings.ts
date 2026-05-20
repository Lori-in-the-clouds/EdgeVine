import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import {
  DEFAULT_VISION_SETTINGS,
  normalizeVisionSettings,
  validateVisionSettings
} from '../../lib/visionSettings';

export const GET: APIRoute = async () => {
  try {
    const result = await sql<any>(`SELECT value FROM app_settings WHERE key = 'vision'`);
    if (result.rows.length > 0) {
      return new Response(JSON.stringify({ success: true, settings: normalizeVisionSettings(result.rows[0].value) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: true, settings: DEFAULT_VISION_SETTINGS }), {
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
    const settings = validateVisionSettings(body);

    const value = JSON.stringify(settings);
    
    await sql(
      `INSERT INTO app_settings (key, value) VALUES ('vision', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP`,
      [value]
    );

    return new Response(JSON.stringify({ success: true, settings }), { status: 200 });
  } catch (error: any) {
    const message = error.message || 'Failed to save settings';
    const status = message.includes('must be') ? 400 : 500;
    return new Response(JSON.stringify({ success: false, error: message }), { status });
  }
};
