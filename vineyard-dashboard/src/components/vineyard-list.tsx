import { EmptyState } from "./empty-state";
import StatusPill from "./status-pill";
type StatusTone = string;

export type VineyardSummary = {
  id: string | number;
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
  status: StatusTone;
  updatedAt?: string;
  href: string;
};

export type VineyardListProps = {
  vineyards: VineyardSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
};

export function VineyardList({
  vineyards,
  emptyTitle = "No vineyards registered",
  emptyDescription = "Create the first vineyard to start tracking zones and sensor health.",
}: VineyardListProps) {
  if (vineyards.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <section className="vineyard-list">
      {vineyards.map((vineyard) => (
        <article className="vineyard-card vineyard-list-card" key={vineyard.id}>
          <div className="vineyard-card__header">
            <div>
              <p className="vineyard-eyebrow">Vineyard</p>
              <h2>{vineyard.name}</h2>
            </div>
            <StatusPill status={vineyard.status} />
          </div>

          <dl className="vineyard-summary-grid">
            <div>
              <dt>Owner</dt>
              <dd>{vineyard.owner}</dd>
            </div>
            <div>
              <dt>Zones</dt>
              <dd>{vineyard.zoneCount}</dd>
            </div>
            <div>
              <dt>Ok</dt>
              <dd>{vineyard.healthyZones}</dd>
            </div>
            <div>
              <dt>Warning</dt>
              <dd>{vineyard.warningZones}</dd>
            </div>
            <div>
              <dt>Offline</dt>
              <dd>{vineyard.offlineZones}</dd>
            </div>
            <div>
              <dt>No data</dt>
              <dd>{vineyard.noDataZones}</dd>
            </div>
          </dl>

          <div className="vineyard-card__footer">
            <p className="vineyard-card__meta">
              Altitude {vineyard.altitude} m · {vineyard.latitude.toFixed(4)},{" "}
              {vineyard.longitude.toFixed(4)}
              {vineyard.updatedAt ? ` · Updated ${vineyard.updatedAt}` : ""}
            </p>
            <a className="vineyard-button vineyard-button--secondary" href={vineyard.href}>
              Open details
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}
