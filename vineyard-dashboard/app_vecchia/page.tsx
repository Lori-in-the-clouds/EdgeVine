// app/page.tsx

import { getVineyardSummaries } from "@/lib/data";
import { toVineyardListViewModel } from "@/lib/presentation";
import VineyardList from "@/components/vineyard-list";

export default async function HomePage() {
  const vineyards = toVineyardListViewModel(
    await getVineyardSummaries()
  );

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        🌿 Live Vineyard Overview
      </h1>

      <VineyardList vineyards={vineyards} />
    </main>
  );
}