import { sql } from './db';

const VINE_IMAGES = [
  "https://images.unsplash.com/photo-1593444453965-0fcb546bcdd7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1596733430284-f7437764b1a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1628178652012-79010ab8459f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584826131422-0d65b7461cc4?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&w=800&q=80"
];

async function seed() {
  console.log("🌱 Seeding sensor data with images...");
  
  try {
    // Get all unique zone_numbers from the vineyard table (or zones if they exist)
    const configRes = await sql<any>("SELECT sectors FROM vineyard LIMIT 1");
    let zoneNumbers: number[] = [1, 2, 3, 4, 5]; // Fallback

    // Clear old sensor data if needed (optional)
    // await sql("DELETE FROM sensor_data");

    for (const zone of zoneNumbers) {
      console.log(`Processing Zone ${zone}...`);
      
      // Generate 12 hourly readings for the last 12 hours
      for (let i = 0; i < 12; i++) {
        const time = new Date(Date.now() - i * 3600000);
        const temp = 18 + Math.random() * 10;
        const hum = 40 + Math.random() * 30;
        const moist = 25 + Math.random() * 40;
        const imageUrl = VINE_IMAGES[Math.floor(Math.random() * VINE_IMAGES.length)];

        await sql(`
          INSERT INTO sensor_data (zone_number, temperature, humidity, moisture, created_at, image_url)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [zone, temp.toFixed(1), hum.toFixed(1), moist.toFixed(1), time, imageUrl]);
      }
    }
    
    console.log("✅ Database seeded successfully!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
}

// In a real scenario, we might trigger this via a hidden endpoint or script
// For now, I'll provide this code for your environment.
