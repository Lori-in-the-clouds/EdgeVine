import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
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
    const body = await request.json();
    const { area, centroid, sectors, zones, province, region, address, name_vineyard, owner, email } = body;
    
    const currentVineyard = await sql<any>(`SELECT id FROM vineyard LIMIT 1`);
    let vId = currentVineyard.rows[0]?.id;
    if (!vId) {
      // Create default vineyard record if none exists to avoid foreign key errors on empty DB
      await sql(`
        INSERT INTO vineyard (id, name, owner, altitude, latitude, longitude, name_vineyard, area) 
        VALUES (1, 'EdgeVine', 'Lorenzo', 200, 38.73, -122.94, 'EdgeVine Vineyard', '---')
      `);
      vId = 1;
    }

    // --- SALVATAGGIO DA PROFILO ---
    if (name_vineyard || owner || email || (province && !sectors)) {
      await sql(`
        UPDATE vineyard 
        SET province = COALESCE($1, province), 
            region = COALESCE($2, region), 
            address = COALESCE($3, address),
            name_vineyard = COALESCE($4, name_vineyard),
            owner = COALESCE($5, owner),
            email = COALESCE($6, email)
        WHERE id = $7
      `, [province || null, region || null, address || null, name_vineyard || null, owner || null, email || null, vId]);
      
      if (!sectors) return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // --- SALVATAGGIO DA MAPPA ---
    let lat = null;
    let lng = null;
    let isClearing = (!sectors || sectors.length === 0) && (centroid === '---' || !centroid);

    if (centroid && centroid !== '---') {
      const coords = centroid.match(/[-+]?[0-9]*\.?[0-9]+/g);
      if (coords && coords.length >= 2) {
        lat = parseFloat(coords[0]);
        lng = parseFloat(coords[1]);
      }
    }

    // Geocoding: Se stiamo cancellando, mettiamo a null. Altrimenti cerchiamo via satellite.
    let targetProvince = isClearing ? null : province;
    let targetRegion = isClearing ? null : region;
    let targetAddress = isClearing ? null : address;

    if (!isClearing && lat && lng && !address) {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
          headers: { 'User-Agent': 'EdgeVine-Dashboard-v1.3' }
        });
        const geoData = await geoRes.json();
        if (geoData && geoData.address) {
          const a = geoData.address;
          targetProvince = a.county || a.state_district || a.city;
          targetRegion = a.state;
          const road = a.road || '';
          const houseNumber = a.house_number ? `, ${a.house_number}` : '';
          const city = a.city || a.town || a.village || '';
          targetAddress = `${road}${houseNumber}${road && city ? ' - ' : ''}${city}`.trim();
        }
      } catch (geoErr) {}
    }

    let totalRowMeters = 0;
    let totalRowsCount = 0;
    let sectorNamesArr: string[] = [];

    if (Array.isArray(sectors)) {
      sectorNamesArr = sectors.map(s => s.name);
      sectors.forEach(sector => {
        if (sector.rows) {
          totalRowsCount += sector.rows.length;
          sector.rows.forEach((row: any) => { totalRowMeters += (row.length || 0); });
        }
      });
    }

    // Se isClearing è true, sovrascriviamo con NULL anche se c'erano dati prima
    await sql(`
      UPDATE vineyard 
      SET 
        area = $1, sectors = $2, latitude = $3, longitude = $4, 
        total_row_meters = $5, total_rows_count = $6, sectors_count = $7, sector_names = $8,
        province = $9, 
        region = $10, 
        address = $11
      WHERE id = $12
    `, [
      area || '---', JSON.stringify(sectors || []), lat, lng, 
      Math.round(totalRowMeters), totalRowsCount, sectors ? sectors.length : 0, sectorNamesArr.join(', '),
      targetProvince, targetRegion, targetAddress, vId
    ]);

    if (Array.isArray(zones)) {
      await sql(`DELETE FROM vine_zone WHERE vineyard_id = $1`, [vId]);
      for (const zone of zones) {
        await sql(`
          INSERT INTO vine_zone (vineyard_id, number, external_id, name, latitude, longitude, sector_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [vId, zone.number, zone.external_id, zone.name, zone.latitude, zone.longitude, zone.sector_id]);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error("STATS_SYNC_ERROR:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
