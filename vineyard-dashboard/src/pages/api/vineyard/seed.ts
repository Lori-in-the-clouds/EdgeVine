import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    console.log("🌱 SEED_START: Generating mock data...");
    
    // 1. Get zones
    const zonesRes = await sql<any>("SELECT id, number, vineyard_id, external_id, name FROM vine_zone");
    const zones = zonesRes.rows;

    if (zones.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No zones found. Create some first." }), { status: 400 });
    }

    // 2. Insert 12 readings for each zone (last 12 hours)
    for (const zone of zones) {
      for (let i = 0; i < 12; i++) {
        const timestamp = new Date(Date.now() - i * 3600000);
        
        const temp = 18 + Math.random() * 8;
        const hum = 45 + Math.random() * 20;
        const moist = 20 + Math.random() * 40;
        
        // Simulating a local file path using the 3 provided test images
        const testImages = ['test_vigna_1.png', 'test_vigna_2.png', 'test_vigna_3.png'];
        const fileName = testImages[Math.floor(Math.random() * testImages.length)];
        const localPath = `/captures/${fileName}`;

        const sensorRes = await sql<any>(`
          INSERT INTO sensor (zone_id, external_id, name)
          VALUES ($1, $2, $3)
          ON CONFLICT (zone_id, external_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, sensor.name)
          RETURNING id
        `, [zone.id, zone.external_id || `S-${String(zone.number).padStart(2, '0')}`, zone.name || `Sensor ${zone.number}`]);

        const measurementRes = await sql<any>(`
          INSERT INTO sensor_measurements (sensor_id, zone_id, vineyard_id, temperature, humidity, moisture, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [sensorRes.rows[0].id, zone.id, zone.vineyard_id, temp.toFixed(1), hum.toFixed(1), moist.toFixed(1), timestamp]);

        await sql(`
          INSERT INTO computer_vision_data (sensor_id, zone_id, vineyard_id, sensor_measurement_id, timestamp, image_url)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [sensorRes.rows[0].id, zone.id, zone.vineyard_id, measurementRes.rows[0].id, timestamp, localPath]);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Database seeded with 12h of data for each sentinel." }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
