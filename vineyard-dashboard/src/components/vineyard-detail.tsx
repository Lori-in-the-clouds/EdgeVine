import { EmptyState } from "./empty-state";
import StatusPill from "./status-pill";
type StatusTone = string;

export type VineyardDetailZone = {
  id: string | number;
  number: number;
  status: StatusTone;
  temperature?: number | null;
  humidity?: number | null;
  moisture?: number | null;
  lastSeen?: string;
  note?: string;
};

export type VineyardDetailProps = {
  vineyard: {
    id: string | number;
    name: string;
    owner: string;
    altitude: number;
    latitude: number;
    longitude: number;
  };
  status?: StatusTone;
  summary?: {
    zoneCount: number;
    healthyZones: number;
    warningZones: number;
    offlineZones: number;
    noDataZones: number;
  };
  zones: VineyardDetailZone[];
  emptyTitle?: string;
  emptyDescription?: string;
};

export function VineyardDetail({
  vineyard,
  status,
  summary,
  zones,
  emptyTitle = "No connected zones",
  emptyDescription = "The vineyard exists, but no zones have sent measurements yet.",
}: VineyardDetailProps) {
  const overallStatus = status ?? deriveOverallStatus(summary, zones);

  return (
    <section className="vineyard-detail">
      <header className="vineyard-detail__hero vineyard-card">
        <div className="vineyard-card__header">
          <div>
            <p className="vineyard-eyebrow">Vineyard Overview</p>
            <h1>{vineyard.name}</h1>
          </div>
          <StatusPill status={overallStatus} />
        </div>

        <div className="vineyard-detail__meta">
          <div>
            <span>Owner</span>
            <strong>{vineyard.owner}</strong>
          </div>
          <div>
            <span>Altitude</span>
            <strong>{vineyard.altitude} m</strong>
          </div>
          <div>
            <span>Coordinates</span>
            <strong>
              {vineyard.latitude.toFixed(4)}, {vineyard.longitude.toFixed(4)}
            </strong>
          </div>
          {summary ? (
            <>
              <div>
                <span>Zones</span>
                <strong>{summary.zoneCount}</strong>
              </div>
              <div>
                <span>Ok</span>
                <strong>{summary.healthyZones}</strong>
              </div>
              <div>
                <span>Attention</span>
                <strong>{summary.warningZones + summary.offlineZones + summary.noDataZones}</strong>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {zones.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="vineyard-zone-grid">
          {zones.map((zone) => (
            <article className="vineyard-card vineyard-zone-card" key={zone.id}>
              <div className="vineyard-card__header">
                <div>
                  <p className="vineyard-eyebrow">Zone {zone.number}</p>
                  <h2>Sensor Status</h2>
                </div>
                <StatusPill status={zone.status} />
              </div>

              <div className="vineyard-zone-card__metrics">
                <div>
                  <span>Temperature</span>
                  <strong>{formatValue(zone.temperature, "°C")}</strong>
                </div>
                <div>
                  <span>Humidity</span>
                  <strong>{formatValue(zone.humidity, "%")}</strong>
                </div>
                <div>
                  <span>Moisture</span>
                  <strong>{formatValue(zone.moisture, "")}</strong>
                </div>
              </div>

              <div className="vineyard-card__footer vineyard-zone-card__footer">
                <p className="vineyard-card__meta">
                  {zone.lastSeen ? `Latest reading ${zone.lastSeen}` : "No recent readings"}
                </p>
                {zone.note ? <p className="vineyard-zone-card__note">{zone.note}</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatValue(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value}${suffix}`;
}

function deriveOverallStatus(
  summary: VineyardDetailProps["summary"],
  zones: VineyardDetailZone[],
): StatusTone {
  if (summary) {
    if (summary.offlineZones > 0) return "offline";
    if (summary.warningZones > 0) return "warning";
    if (summary.noDataZones > 0) return "no-data";
    return "healthy";
  }

  if (zones.length === 0) {
    return "no-data";
  }

  if (zones.some((zone) => zone.status === "offline")) return "offline";
  if (zones.some((zone) => zone.status === "warning")) return "warning";
  if (zones.some((zone) => zone.status === "no-data")) return "no-data";
  return "healthy";
}
