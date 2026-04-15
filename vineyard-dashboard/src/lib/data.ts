import { sql } from "@/lib/db";
import type { VineyardDetail, VineyardSummary, ZoneSnapshot, ZoneStatus } from "@/lib/types";

type VineyardZoneRow = {
  vineyard_id: number;
  vineyard_name: string;
  vineyard_owner: string;
  vineyard_altitude: number;
  vineyard_latitude: number;
  vineyard_longitude: number;
  zone_id: number | null;
  zone_number: number | null;
  reading_timestamp: Date | null;
  temperature: number | null;
  humidity: number | null;
  moisture: number | null;
};

const thresholds = {
  staleMinutes: Number(process.env.ZONE_STALE_MINUTES ?? "30"),
  temperatureMin: Number(process.env.ZONE_TEMPERATURE_MIN ?? "5"),
  temperatureMax: Number(process.env.ZONE_TEMPERATURE_MAX ?? "35"),
  humidityMin: Number(process.env.ZONE_HUMIDITY_MIN ?? "35"),
  moistureMin: Number(process.env.ZONE_MOISTURE_MIN ?? "250")
};

function formatIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toAgeMinutes(readingTimestamp: Date | null): number | null {
  if (!readingTimestamp) {
    return null;
  }

  const diffMs = Date.now() - readingTimestamp.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

function deriveZoneSnapshot(row: VineyardZoneRow): ZoneSnapshot | null {
  if (row.zone_id === null || row.zone_number === null) {
    return null;
  }

  if (!row.reading_timestamp) {
    return {
      id: row.zone_id,
      number: row.zone_number,
      status: "no-data",
      latestReadingAt: null,
      temperature: null,
      humidity: null,
      moisture: null,
      ageMinutes: null,
      notes: ["Nessuna misura registrata per questa zona."]
    };
  }

  const notes: string[] = [];
  const ageMinutes = toAgeMinutes(row.reading_timestamp);
  let status: ZoneStatus = "healthy";

  if (ageMinutes !== null && ageMinutes > thresholds.staleMinutes) {
    status = "offline";
    notes.push(`Ultima lettura ${ageMinutes} minuti fa.`);
  }

  if (row.temperature !== null) {
    if (row.temperature < thresholds.temperatureMin || row.temperature > thresholds.temperatureMax) {
      status = status === "offline" ? status : "warning";
      notes.push(`Temperatura fuori soglia (${row.temperature.toFixed(1)}°C).`);
    }
  }

  if (row.humidity !== null && row.humidity < thresholds.humidityMin) {
    status = status === "offline" ? status : "warning";
    notes.push(`Umidita bassa (${row.humidity.toFixed(1)}%).`);
  }

  if (row.moisture !== null && row.moisture < thresholds.moistureMin) {
    status = status === "offline" ? status : "warning";
    notes.push(`Moisture bassa (${row.moisture.toFixed(1)}).`);
  }

  if (notes.length === 0) {
    notes.push("Telemetria aggiornata e dentro soglia.");
  }

  return {
    id: row.zone_id,
    number: row.zone_number,
    status,
    latestReadingAt: formatIso(row.reading_timestamp),
    temperature: row.temperature,
    humidity: row.humidity,
    moisture: row.moisture,
    ageMinutes,
    notes
  };
}

async function getVineyardZoneRows(vineyardId?: number): Promise<VineyardZoneRow[]> {
  const query = `
    SELECT
      v.id AS vineyard_id,
      v.name AS vineyard_name,
      v.owner AS vineyard_owner,
      v.altitude AS vineyard_altitude,
      v.latitude AS vineyard_latitude,
      v.longitude AS vineyard_longitude,
      vz.id AS zone_id,
      vz.number AS zone_number,
      latest.timestamp AS reading_timestamp,
      latest.temperature,
      latest.humidity,
      latest.moisture
    FROM vineyard v
    LEFT JOIN vine_zone vz ON vz.vineyard_id = v.id
    LEFT JOIN LATERAL (
      SELECT
        sd.timestamp,
        sd.temperature,
        sd.humidity,
        sd.moisture
      FROM sensor_data sd
      WHERE sd.sensor_id = vz.id
      ORDER BY sd.timestamp DESC
      LIMIT 1
    ) latest ON true
    ${vineyardId ? "WHERE v.id = $1" : ""}
    ORDER BY v.name ASC, vz.number ASC NULLS LAST
  `;

  const params = vineyardId ? [vineyardId] : [];
  const result = await sql<VineyardZoneRow>(query, params);
  return result.rows;
}

export async function getVineyardSummaries(): Promise<VineyardSummary[]> {
  const rows = await getVineyardZoneRows();
  const byVineyard = new Map<number, VineyardSummary>();

  for (const row of rows) {
    const existing =
      byVineyard.get(row.vineyard_id) ??
      {
        id: row.vineyard_id,
        name: row.vineyard_name,
        owner: row.vineyard_owner,
        altitude: Number(row.vineyard_altitude),
        latitude: Number(row.vineyard_latitude),
        longitude: Number(row.vineyard_longitude),
        zoneCount: 0,
        healthyZones: 0,
        warningZones: 0,
        offlineZones: 0,
        noDataZones: 0,
        latestReadingAt: null
      };

    const zone = deriveZoneSnapshot(row);
    if (zone) {
      existing.zoneCount += 1;
      if (zone.status === "healthy") {
        existing.healthyZones += 1;
      } else if (zone.status === "warning") {
        existing.warningZones += 1;
      } else if (zone.status === "offline") {
        existing.offlineZones += 1;
      } else {
        existing.noDataZones += 1;
      }

      if (
        zone.latestReadingAt &&
        (!existing.latestReadingAt || zone.latestReadingAt > existing.latestReadingAt)
      ) {
        existing.latestReadingAt = zone.latestReadingAt;
      }
    }

    byVineyard.set(row.vineyard_id, existing);
  }

  return [...byVineyard.values()];
}

export async function getVineyardDetail(id: number): Promise<VineyardDetail | null> {
  const rows = await getVineyardZoneRows(id);
  if (rows.length === 0) {
    return null;
  }

  const first = rows[0];
  if (!first) {
    return null;
  }
  const zones = rows
    .map((row) => deriveZoneSnapshot(row))
    .filter((zone): zone is ZoneSnapshot => zone !== null);

  return {
    id: first.vineyard_id,
    name: first.vineyard_name,
    owner: first.vineyard_owner,
    altitude: Number(first.vineyard_altitude),
    latitude: Number(first.vineyard_latitude),
    longitude: Number(first.vineyard_longitude),
    zones
  };
}
