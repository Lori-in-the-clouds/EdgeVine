import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { recordId, grape_count, health_status, estimated_liters, liters_min, liters_max, processed_image_url, leaf_healthy_count, leaf_stress_count, leaf_disease_count } = body;

    if (!recordId) {
      return new Response(JSON.stringify({ success: false, error: "Missing recordId" }), { status: 400 });
    }

    await sql(
      `UPDATE computer_vision_data
       SET 
         grape_count = $1,
         health_status = $2,
         estimated_liters = $3,
         processed_image_url = $4,
         leaf_healthy_count = $5,
         leaf_stress_count = $6,
         leaf_disease_count = $7,
         estimated_liters_min = $8,
         estimated_liters_max = $9
       WHERE id = $10`,
      [
        grape_count ?? null,
        health_status ?? null,
        estimated_liters ?? null,
        processed_image_url ?? null,
        leaf_healthy_count ?? 0,
        leaf_stress_count ?? 0,
        leaf_disease_count ?? 0,
        liters_min ?? null,
        liters_max ?? null,
        recordId
      ]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("Save Result API Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
