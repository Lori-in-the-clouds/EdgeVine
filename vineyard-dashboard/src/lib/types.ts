export type ZoneStatus = "healthy" | "warning" | "offline" | "no-data";

export type ZoneSnapshot = {
  id: number;
  number: number;
  status: ZoneStatus;
  latestReadingAt: string | null;
  temperature: number | null;
  humidity: number | null;
  moisture: number | null;
  ageMinutes: number | null;
  notes: string[];
};

export type VineyardSummary = {
  id: number;
  name: string;
  owner: string;
  altitude: number;
  latitude: number;
  longitude: number;
  zoneCount: number;
  healthyZones: number;
  warningZones: number;
  offlineZones: number;
  noDataZones: number;
  latestReadingAt: string | null;
};

export type VineyardDetail = {
  id: number;
  name: string;
  owner: string;
  altitude: number;
  latitude: number;
  longitude: number;
  zones: ZoneSnapshot[];
};
