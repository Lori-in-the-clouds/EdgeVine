import type { VineyardDetail as VineyardDetailData, VineyardSummary as VineyardSummaryData, ZoneStatus } from "@/lib/types";

function formatTimestamp(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function deriveStatusFromCounts(counts: {
  warningZones: number;
  offlineZones: number;
  noDataZones: number;
}): ZoneStatus {
  if (counts.offlineZones > 0) {
    return "offline";
  }

  if (counts.warningZones > 0) {
    return "warning";
  }

  if (counts.noDataZones > 0) {
    return "no-data";
  }

  return "healthy";
}

export function toVineyardListViewModel(vineyards: VineyardSummaryData[]) {
  return vineyards.map((vineyard) => ({
    ...vineyard,
    status: deriveStatusFromCounts(vineyard),
    updatedAt: formatTimestamp(vineyard.latestReadingAt),
    href: `/vineyards/${vineyard.id}`
  }));
}

export function toVineyardDetailViewModel(vineyard: VineyardDetailData) {
  const summary = {
    zoneCount: vineyard.zones.length,
    healthyZones: vineyard.zones.filter((zone) => zone.status === "healthy").length,
    warningZones: vineyard.zones.filter((zone) => zone.status === "warning").length,
    offlineZones: vineyard.zones.filter((zone) => zone.status === "offline").length,
    noDataZones: vineyard.zones.filter((zone) => zone.status === "no-data").length
  };

  return {
    vineyard: {
      id: vineyard.id,
      name: vineyard.name,
      owner: vineyard.owner,
      altitude: vineyard.altitude,
      latitude: vineyard.latitude,
      longitude: vineyard.longitude
    },
    status: deriveStatusFromCounts(summary),
    summary,
    zones: vineyard.zones.map((zone) => ({
      id: zone.id,
      number: zone.number,
      status: zone.status,
      temperature: zone.temperature,
      humidity: zone.humidity,
      moisture: zone.moisture,
      lastSeen: formatTimestamp(zone.latestReadingAt),
      note: zone.notes.join(" ")
    }))
  };
}
