import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    console.log("🌱 SEED_START: Generating mock data...");
    
    // 1. Get monitoring nodes
    const nodesRes = await sql<any>("SELECT id, number, vineyard_id, external_id, name FROM monitoring_node");
    const nodes = nodesRes.rows;

    if (nodes.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No monitoring nodes found. Create some first." }), { status: 400 });
    }

    // 2. Insert 12 readings for each monitoring node (last 12 hours)
    for (const node of nodes) {
      for (let i = 0; i < 12; i++) {
        const timestamp = new Date(Date.now() - i * 3600000);
        
        const temp = 18 + Math.random() * 8;
        const hum = 45 + Math.random() * 20;
        const moist = 20 + Math.random() * 40;
        
        // Simulating a local file path using the 3 provided test images
        const testImages = ['test_vigna_1.png', 'test_vigna_2.png', 'test_vigna_3.png'];
        const fileName = testImages[Math.floor(Math.random() * testImages.length)];
        const localPath = `/captures/${fileName}`;

        const measurementRes = await sql<any>(`
          INSERT INTO sensor_measurements (monitoring_node_id, vineyard_id, temperature, humidity, moisture, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [node.id, node.vineyard_id, temp.toFixed(1), hum.toFixed(1), moist.toFixed(1), timestamp]);

        await sql(`
          INSERT INTO computer_vision_data (monitoring_node_id, vineyard_id, sensor_measurement_id, timestamp, image_url)
          VALUES ($1, $2, $3, $4, $5)
        `, [node.id, node.vineyard_id, measurementRes.rows[0].id, timestamp, localPath]);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Database seeded with 12h of data for each monitoring node." }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
