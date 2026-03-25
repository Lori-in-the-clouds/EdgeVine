import { EmptyState } from "./empty-state";
import { StatusPill, type StatusTone } from "./status-pill";

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
  emptyTitle = "Nessun vineyard registrato",
  emptyDescription = "Crea il primo vineyard per iniziare a tracciare zone e salute dei sensori.",
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
              Altitudine {vineyard.altitude} m · {vineyard.latitude.toFixed(4)},{" "}
              {vineyard.longitude.toFixed(4)}
              {vineyard.updatedAt ? ` · Aggiornato ${vineyard.updatedAt}` : ""}
            </p>
            <a className="vineyard-button vineyard-button--secondary" href={vineyard.href}>
              Apri dettagli
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}
