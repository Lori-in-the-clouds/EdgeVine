import { CreateVineyardForm } from "@/components/create-vineyard-form";
import { VineyardList } from "@/components/vineyard-list";
import { createVineyard } from "@/lib/actions";
import { getVineyardSummaries } from "@/lib/data";
import { toVineyardListViewModel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const vineyards = toVineyardListViewModel(await getVineyardSummaries());

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">EdgeVine Control Room</p>
          <h1>Gestione vineyards e stato operativo delle zone.</h1>
          <p className="hero-text">
            Crea nuovi vineyards nel database e monitora per ciascuno la telemetria piu recente
            delle zone collegate ai broker MQTT.
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat-card">
            <span className="hero-stat-value">{vineyards.length}</span>
            <span className="hero-stat-label">Vineyards registrati</span>
          </div>
          <div className="hero-stat-card">
            <span className="hero-stat-value">
              {vineyards.reduce((sum, vineyard) => sum + vineyard.zoneCount, 0)}
            </span>
            <span className="hero-stat-label">Zone censite</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Overview</p>
            <h2>Vineyards</h2>
          </div>
          <VineyardList vineyards={vineyards} />
        </div>

        <aside className="panel panel-form">
          <div className="section-heading">
            <p className="eyebrow">Nuovo Record</p>
            <h2>Crea vineyard</h2>
          </div>
          <CreateVineyardForm action={createVineyard} />
        </aside>
      </section>
    </main>
  );
}
