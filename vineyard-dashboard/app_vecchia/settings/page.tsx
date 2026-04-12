import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
});

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        ⚙️ Vineyard Settings
      </h1>

      <MapView />
    </div>
  );
}