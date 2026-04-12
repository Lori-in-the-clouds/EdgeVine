import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateZoneForm } from "@/components/create-zone-form";
import { VineyardDetail } from "@/components/vineyard-detail";
import { createZone } from "@/lib/actions";
import { getVineyardDetail } from "@/lib/data";
import { toVineyardDetailViewModel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

type VineyardDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function VineyardDetailPage({ params }: VineyardDetailPageProps) {
  const { id } = await params;
  const vineyardId = Number(id);
  if (!Number.isInteger(vineyardId)) {
    notFound();
  }

  const vineyard = await getVineyardDetail(vineyardId);

  if (!vineyard) {
    notFound();
  }

  const nextZoneNumber =
    vineyard.zones.length > 0
      ? Math.max(...vineyard.zones.map((zone) => zone.number)) + 1
      : 1;
  const createZoneAction = createZone.bind(null, vineyardId);

  return (
    <main className="page-shell">
      <div className="page-toolbar">
        <Link className="back-link" href="/">
          Torna ai vineyards
        </Link>
      </div>
      <section className="detail-layout">
        <div className="detail-main">
          <VineyardDetail {...toVineyardDetailViewModel(vineyard)} />
        </div>
        <aside className="detail-side">
          <div className="section-heading">
            <p className="eyebrow">Gestione zone</p>
            <h2>Crea una nuova zona</h2>
          </div>
          <CreateZoneForm
            action={createZoneAction}
            vineyardName={vineyard.name}
            defaultNumber={nextZoneNumber}
          />
        </aside>
      </section>
    </main>
  );
}
