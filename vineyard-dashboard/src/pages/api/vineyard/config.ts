import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

const DEFAULT_COLOR_THEME = { poly: '#228B22', rows: '#FFD700' };

type SectorPayload = {
  id: string;
  name: string;
  perimeter: unknown;
  rows?: Array<Record<string, unknown>>;
  rowOrientation?: number;
  rowSpacing?: number;
  targetRowCount?: number | '';
  showRows?: boolean;
  colorTheme?: Record<string, string>;
};

function toSector(row: any) {
  return {
    id: row.id,
    name: row.name,
    perimeter: row.perimeter,
    rows: Array.isArray(row.rows) ? row.rows : [],
    rowOrientation: Number(row.row_orientation ?? 0),
    rowSpacing: Number(row.row_spacing ?? 2),
    targetRowCount: row.target_row_count ?? '',
    showRows: row.show_rows ?? true,
    colorTheme: row.color_theme ?? DEFAULT_COLOR_THEME,
    rowCount: Number(row.row_count ?? 0),
    totalRowMeters: Number(row.total_row_meters ?? 0)
  };
}

function getRows(sector: SectorPayload) {
  return Array.isArray(sector.rows) ? sector.rows : [];
}

function getTotalRowMeters(sector: SectorPayload) {
  return getRows(sector).reduce((total, row) => {
    const length = Number(row.length ?? 0);
    return total + (Number.isFinite(length) ? length : 0);
  }, 0);
}

async function getOrCreateVineyardId() {
  const currentVineyard = await sql<any>(`SELECT id FROM vineyard LIMIT 1`);
  const existingId = currentVineyard.rows[0]?.id;

  if (existingId) {
    return Number(existingId);
  }

  const created = await sql<any>(`
    INSERT INTO vineyard (name, owner, altitude, latitude, longitude, name_vineyard)
    VALUES ('Vineyard Estate', 'EdgeVine', 0, 0, 0, 'Vineyard Estate')
    RETURNING id
  `);

  return Number(created.rows[0].id);
}

async function loadVineyardConfig() {
  const result = await sql<any>(`SELECT * FROM vineyard LIMIT 1`);
  const vineyard = result.rows[0];

  if (!vineyard) {
    return null;
  }

  const sectorsResult = await sql<any>(`
    SELECT *
    FROM vineyard_sector
    WHERE vineyard_id = $1
    ORDER BY display_order ASC, name ASC
  `, [vineyard.id]);

  const sectors = sectorsResult.rows.map(toSector);
  const totalRowsCount = sectors.reduce((total, sector) => total + (getRows(sector).length || sector.rowCount || 0), 0);
  const totalRowMeters = sectors.reduce((total, sector) => total + (getRows(sector).length ? getTotalRowMeters(sector) : sector.totalRowMeters || 0), 0);
  const sectorNames = sectors.map((sector) => sector.name).join(', ');

  return {
    ...vineyard,
    sectors,
    sectors_count: sectors.length,
    sector_names: sectorNames,
    total_rows_count: totalRowsCount,
    total_row_meters: Math.round(totalRowMeters)
  };
}

export const GET: APIRoute = async () => {
  try {
    const data = await loadVineyardConfig();
    return new Response(
      JSON.stringify({ success: true, data }),
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
    
    const vId = await getOrCreateVineyardId();

    // --- SALVATAGGIO DA PROFILO ---
    if (name_vineyard || owner || email || (province && !sectors)) {
      await sql(`
        UPDATE vineyard 
        SET province = COALESCE($1, province), 
            region = COALESCE($2, region), 
            address = COALESCE($3, address),
            name_vineyard = COALESCE($4, name_vineyard),
            owner = COALESCE($5, owner),
            email = COALESCE($6, email),
            updated_at = CURRENT_TIMESTAMP
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

    const sectorPayloads: SectorPayload[] = Array.isArray(sectors) ? sectors : [];
    const sectorNamesArr = sectorPayloads.map((sector) => sector.name);
    const totalRowsCount = sectorPayloads.reduce((total, sector) => total + getRows(sector).length, 0);
    const totalRowMeters = sectorPayloads.reduce((total, sector) => total + getTotalRowMeters(sector), 0);

    await sql(`
      UPDATE vineyard 
      SET 
        area = $1,
        latitude = COALESCE($2, latitude, 0.0),
        longitude = COALESCE($3, longitude, 0.0),
        total_row_meters = $4,
        total_rows_count = $5,
        sectors_count = $6,
        sector_names = $7,
        province = $8,
        region = $9,
        address = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
    `, [
      area || '---',
      lat,
      lng,
      Math.round(totalRowMeters),
      totalRowsCount,
      sectorPayloads.length,
      sectorNamesArr.join(', '),
      targetProvince,
      targetRegion,
      targetAddress,
      vId
    ]);

    const submittedSectorIds: string[] = [];

    for (const [index, sector] of sectorPayloads.entries()) {
      submittedSectorIds.push(sector.id);
      const rows = getRows(sector);
      const totalMeters = getTotalRowMeters(sector);
      const targetRowCount = typeof sector.targetRowCount === 'number' ? sector.targetRowCount : null;

      await sql(`
        INSERT INTO vineyard_sector (
          id,
          vineyard_id,
          name,
          perimeter,
          rows,
          row_orientation,
          row_spacing,
          target_row_count,
          show_rows,
          color_theme,
          display_order,
          total_row_meters,
          row_count,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          perimeter = EXCLUDED.perimeter,
          rows = EXCLUDED.rows,
          row_orientation = EXCLUDED.row_orientation,
          row_spacing = EXCLUDED.row_spacing,
          target_row_count = EXCLUDED.target_row_count,
          show_rows = EXCLUDED.show_rows,
          color_theme = EXCLUDED.color_theme,
          display_order = EXCLUDED.display_order,
          total_row_meters = EXCLUDED.total_row_meters,
          row_count = EXCLUDED.row_count,
          updated_at = CURRENT_TIMESTAMP
      `, [
        sector.id,
        vId,
        sector.name,
        JSON.stringify(sector.perimeter),
        JSON.stringify(rows),
        Number(sector.rowOrientation ?? 0),
        Number(sector.rowSpacing ?? 2),
        targetRowCount,
        sector.showRows ?? true,
        JSON.stringify(sector.colorTheme ?? DEFAULT_COLOR_THEME),
        index,
        totalMeters,
        rows.length
      ]);
    }

    if (Array.isArray(sectors)) {
      if (submittedSectorIds.length > 0) {
        await sql(`DELETE FROM vineyard_sector WHERE vineyard_id = $1 AND NOT (id = ANY($2::text[]))`, [vId, submittedSectorIds]);
      } else {
        await sql(`DELETE FROM vineyard_sector WHERE vineyard_id = $1`, [vId]);
      }
    }

    if (Array.isArray(zones)) {
      const submittedNodeNumbers: number[] = [];
      const sectorByName = new Map(sectorPayloads.map((sector) => [sector.name, sector.id]));
      const sectorIds = new Set(sectorPayloads.map((sector) => sector.id));

      for (const zone of zones) {
        submittedNodeNumbers.push(Number(zone.number));
        const externalId = zone.external_id || zone.name || `S-${String(zone.number).padStart(2, '0')}`;
        const sectorId = sectorIds.has(zone.sector_id)
          ? zone.sector_id
          : sectorByName.get(zone.sector_id) ?? null;

        await sql(`
          INSERT INTO monitoring_node (
            vineyard_id,
            sector_id,
            number,
            external_id,
            name,
            latitude,
            longitude,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (vineyard_id, number) DO UPDATE SET
            sector_id = EXCLUDED.sector_id,
            external_id = EXCLUDED.external_id,
            name = EXCLUDED.name,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            updated_at = CURRENT_TIMESTAMP
        `, [vId, sectorId, zone.number, externalId, zone.name || externalId, zone.latitude, zone.longitude]);
      }

      if (submittedNodeNumbers.length > 0) {
        await sql(`DELETE FROM monitoring_node WHERE vineyard_id = $1 AND NOT (number = ANY($2::int[]))`, [vId, submittedNodeNumbers]);
      } else {
        await sql(`DELETE FROM monitoring_node WHERE vineyard_id = $1`, [vId]);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error("STATS_SYNC_ERROR:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
