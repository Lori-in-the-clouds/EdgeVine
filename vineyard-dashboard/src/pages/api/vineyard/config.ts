import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    // Recuperiamo il primo vigneto (nel nostro caso è l'unico di EdgeVine)
    const result = await sql<any>(`SELECT * FROM vineyard LIMIT 1`);
    
    return new Response(
      JSON.stringify({ success: true, data: result.rows[0] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { area, centroid, sectors, zones } = await request.json();
    
    // Assicuriamoci che le colonne esistano (migrazione inline)
    try {
      await sql(`ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS rows JSONB`);
      await sql(`ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS sectors JSONB`);
      await sql(`ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS row_spacing FLOAT DEFAULT 2.5`);
      await sql(`ALTER TABLE vineyard ADD COLUMN IF NOT EXISTS row_orientation FLOAT DEFAULT 0`);
    } catch (e) {}

    // Parsing del centroide per estrarre lat/lng per la tabella vineyard
    const coords = centroid && typeof centroid === 'string' ? centroid.match(/[-+]?[0-9]*\.?[0-9]+/g) : null;
    const lat = coords && coords[0] ? parseFloat(coords[0]) : 43.4633;
    const lng = coords && coords[1] ? parseFloat(coords[1]) : 11.3126;

    // Aggiorniamo l'unico vigneto esistente
    await sql(`
      UPDATE vineyard 
      SET 
        area = $1, 
        sectors = $2,
        latitude = $3,
        longitude = $4,
        row_spacing = $5,
        row_orientation = $6
      WHERE id = 1
    `, [area, JSON.stringify(sectors || []), lat, lng, 2.5, 0]);

    // Aggiorniamo le coordinate e i nomi delle zone (sentinelle)
    if (Array.isArray(zones)) {
      const zoneNumbers = zones.map((z: any) => parseInt(z.number, 10)).filter(n => !isNaN(n));
      
      if (zoneNumbers.length > 0) {
        await sql(`DELETE FROM vine_zone WHERE vineyard_id = 1 AND number != ALL($1::int[])`, [zoneNumbers]);
      } else {
        await sql(`DELETE FROM vine_zone WHERE vineyard_id = 1`);
      }

      for (const zone of zones) {
        await sql(`
          INSERT INTO vine_zone (vineyard_id, number, name, latitude, longitude)
          VALUES (1, $1, $2, $3, $4)
          ON CONFLICT (vineyard_id, number) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            latitude = EXCLUDED.latitude, 
            longitude = EXCLUDED.longitude
        `, [zone.number, zone.name, zone.latitude, zone.longitude]);
      }
    }


    return new Response(
      JSON.stringify({ success: true, message: 'Configuration and Sentinels saved successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
