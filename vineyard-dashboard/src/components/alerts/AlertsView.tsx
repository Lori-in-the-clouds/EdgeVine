import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { AlertCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export function AlertsView() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());

  useEffect(() => {
    // Generiamo alert anonimizzati distribuiti fittiziamente attorno al vigneto
    const mockFeed = Array.from({ length: 6 }).map((_, i) => {
      const isCritical = i % 3 === 0;
      const isWarning = i % 2 === 0 && !isCritical;
      const lat = 43.057 + (Math.random() - 0.5) * 0.05;
      const lng = 11.489 + (Math.random() - 0.5) * 0.05;
      return {
        id: i,
        type: isCritical ? 'critical' : (isWarning ? 'warning' : 'info'),
        message: isCritical ? 'Possible Downy Mildew outbreak' : (isWarning ? 'Anomalous humidity detected' : 'Optimal conditions restored'),
        time: `${Math.floor(Math.random() * 5 + 1)}h ago`,
        lat, lng,
        intensity: isCritical ? 600 : 300,
      };
    });
    setAlerts(mockFeed);
  }, []);

  // Inizializzazione Mappa
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(mapRef.current, {
      center: [43.057, 11.489],
      zoom: 12,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO'
    }).addTo(mapInstanceRef.current);

    layersRef.current.addTo(mapInstanceRef.current);

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Sync Alerts with Map
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    layersRef.current.clearLayers();

    alerts.forEach(alert => {
      const color = alert.type === 'critical' ? '#ba1a1a' : (alert.type === 'warning' ? '#ffa500' : '#006c0c');
      
      const circle = L.circle([alert.lat, alert.lng], {
        radius: alert.intensity,
        fillColor: color,
        color: 'transparent',
        fillOpacity: alert.type === 'critical' ? 0.6 : 0.3
      });

      circle.bindPopup(`<p class="font-manrope font-bold text-sm m-0">Alert cluster: ${alert.message}</p>`);
      layersRef.current.addLayer(circle);
    });
  }, [alerts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Activity Feed Sidebar */}
      <div className="col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
        <h2 className="text-xl font-manrope font-extrabold text-stone-800 mb-2 uppercase tracking-tight">Community & Alerts Feed</h2>
        {alerts.map(alert => (
          <div key={alert.id} className="bg-white/80 backdrop-blur-sm border border-stone-100 rounded-2xl flex items-start gap-4 p-5 hover:border-[#228B22]/30 hover:shadow-md transition-all">
             <div className={`p-2.5 rounded-xl flex-shrink-0 ${
               alert.type === 'critical' ? 'bg-red-50 text-red-600' : 
               (alert.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600')
             }`}>
               {alert.type === 'critical' ? <AlertCircle className="w-5 h-5" /> : 
                (alert.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />)}
             </div>
             <div>
               <p className="font-manrope font-extrabold text-stone-800 text-sm tracking-tight leading-tight">{alert.message}</p>
               <p className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest mt-1.5 opacity-70 flex items-center gap-2">
                 <span className="w-1 h-1 bg-stone-300 rounded-full"></span>
                 Anonymized • Reported {alert.time}
               </p>
             </div>
          </div>
        ))}
      </div>

      {/* Heatmap Area */}
      <div className="col-span-2 bg-stone-100/50 border border-stone-200 rounded-[2.5rem] p-0 overflow-hidden relative shadow-inner group">
          <div className="absolute top-6 right-6 z-[1000] bg-white/70 backdrop-blur-xl px-4 py-2 rounded-full border border-white shadow-sm pointer-events-none">
             <p className="text-[10px] font-extrabold text-stone-800 uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#228B22] rounded-full animate-pulse"></div>
                Regional Sentinel Heatmap
             </p>
          </div>
          
          <div 
            ref={mapRef} 
            className="w-full h-full z-0 grayscale-[0.5] contrast-[1.1]"
            style={{ isolation: 'isolate' }}
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700">
            <div className="bg-stone-900/80 backdrop-blur-md px-6 py-2 rounded-full text-white/50 text-[9px] font-bold uppercase tracking-[0.3em]">
              Network Activity Monitoring Live
            </div>
          </div>
      </div>

    </div>
  );
}

