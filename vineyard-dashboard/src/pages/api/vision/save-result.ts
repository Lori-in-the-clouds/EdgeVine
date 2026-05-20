import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      recordId,
      monitoring_node_id,
      monitoringNodeId,
      image_url,
      original_image,
      grape_count,
      health_status,
      estimated_liters,
      liters_min,
      liters_max,
      processed_image_url,
      leaf_healthy_count,
      leaf_stress_count,
      leaf_disease_count
    } = body;

    if (recordId) {
      const updateResult = await sql<any>(
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
         WHERE id = $10
         RETURNING id`,
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

      if (updateResult.rows.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Vision record not found" }), { status: 404 });
      }

      return new Response(JSON.stringify({ success: true, id: updateResult.rows[0].id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const nodeId = Number(monitoring_node_id ?? monitoringNodeId);
    const sourceImageUrl = image_url ?? original_image;

    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing monitoring node" }), { status: 400 });
    }

    if (!sourceImageUrl) {
      return new Response(JSON.stringify({ success: false, error: "Missing image URL" }), { status: 400 });
    }

    const insertResult = await sql<any>(
      `WITH selected_node AS (
         SELECT id, vineyard_id
         FROM monitoring_node
         WHERE id = $1
       ),
       latest_measurement AS (
         SELECT id
         FROM sensor_measurements
         WHERE monitoring_node_id = $1
         ORDER BY timestamp DESC, id DESC
         LIMIT 1
       )
       INSERT INTO computer_vision_data (
         monitoring_node_id,
         vineyard_id,
         sensor_measurement_id,
         image_url,
         processed_image_url,
         grape_count,
         health_status,
         estimated_liters,
         estimated_liters_min,
         estimated_liters_max,
         leaf_healthy_count,
         leaf_stress_count,
         leaf_disease_count
       )
       SELECT
         selected_node.id,
         selected_node.vineyard_id,
         latest_measurement.id,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11
       FROM selected_node
       LEFT JOIN latest_measurement ON true
       RETURNING id`,
      [
        nodeId,
        sourceImageUrl,
        processed_image_url ?? null,
        grape_count ?? null,
        health_status ?? null,
        estimated_liters ?? null,
        liters_min ?? null,
        liters_max ?? null,
        leaf_healthy_count ?? 0,
        leaf_stress_count ?? 0,
        leaf_disease_count ?? 0
      ]
    );

    if (insertResult.rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Monitoring node not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true, id: insertResult.rows[0].id }), {
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
