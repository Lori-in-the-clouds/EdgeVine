import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

const VINE_IMAGES = [
  "https://images.unsplash.com/photo-1593444453965-0fcb546bcdd7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1596733430284-f7437764b1a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1628178652012-79010ab8459f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584826131422-0d65b7461cc4?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&w=800&q=80"
];

export const GET: APIRoute = async () => {
  try {
    console.log("🌱 SEED_START: Generating mock data...");
    
    // 1. Get zones
    const zonesRes = await sql<any>("SELECT id, number FROM vine_zone");
    const zones = zonesRes.rows;

    if (zones.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No zones found. Create some first." }), { status: 400 });
    }

    // 2. Insert 12 readings for each zone (last 12 hours)
    for (const zone of zones) {
      for (let i = 0; i < 12; i++) {
        const timestamp = new Date(Date.now() - i * 3600000);
        const dateStr = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 16);
        
        const temp = 18 + Math.random() * 8;
        const hum = 45 + Math.random() * 20;
        const moist = 20 + Math.random() * 40;
        
        // Simulating a local file path using the 3 provided test images
        const testImages = ['test_vigna_1.png', 'test_vigna_2.png', 'test_vigna_3.png'];
        const fileName = testImages[Math.floor(Math.random() * testImages.length)];
        const localPath = `/captures/${fileName}`;

        await sql(`
          INSERT INTO sensor_data (vine_zone_id, temperature, humidity, moisture, timestamp, image_url)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [zone.id, temp.toFixed(1), hum.toFixed(1), moist.toFixed(1), timestamp, localPath]);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Database seeded with 12h of data for each sentinel." }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
