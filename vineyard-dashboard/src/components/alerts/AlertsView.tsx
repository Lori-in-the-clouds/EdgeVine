import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { 
  Plus, 
  Minus, 
  Droplets,
  CloudLightning,
  Bug,
  X,
  AlertTriangle,
  Send,
  Map as MapIcon
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import 'leaflet/dist/leaflet.css';

type AlertType = 'infestation' | 'hydraulic' | 'environmental';

interface NetworkAlert {
  id: string;
  vineyardId: number;
  type: AlertType;
  title: string;
  distance: string;
  distanceKm: number;
  time: string;
  description: string;
  lat: number;
  lng: number;
  icon: React.ReactNode;
  iconColor: string;
}

interface AlertApiRecord {
  id: string;
  vineyardId: number;
  vineyardName?: string;
  type: AlertType;
  title: string;
  description: string;
  lat: number;
  lng: number;
  distanceKm: number;
  createdAt: string;
}

function getAlertVisuals(type: AlertType) {
  if (type === 'infestation') {
    return { icon: <Bug className="w-5 h-5" />, iconColor: 'text-pink-500' };
  }

  if (type === 'hydraulic') {
    return { icon: <Droplets className="w-5 h-5" />, iconColor: 'text-emerald-500' };
  }

  return { icon: <CloudLightning className="w-5 h-5" />, iconColor: 'text-orange-500' };
}

function formatDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return '---';
  if (distanceKm < 0.05) return 'Your Estate';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}m away`;
  return `${distanceKm.toFixed(1)}km away`;
}

function formatRelativeTime(createdAt: string) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 'Now';

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'Now';

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function toNetworkAlert(record: AlertApiRecord): NetworkAlert {
  const visuals = getAlertVisuals(record.type);

  return {
    id: record.id,
    vineyardId: record.vineyardId,
    type: record.type,
    title: record.title,
    distance: formatDistance(record.distanceKm),
    distanceKm: record.distanceKm,
    time: formatRelativeTime(record.createdAt),
    description: record.description,
    lat: Number(record.lat),
    lng: Number(record.lng),
    ...visuals
  };
}

export function AlertsView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const circleRef = useRef<L.Circle | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  
  const [isMapReady, setIsMapReady] = useState(false);
  const [radiusKm, setRadiusKm] = useState(30);
  const [vineyardPos, setVineyardPos] = useState<[number, number] | null>(null);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);

  const [formData, setFormData] = useState({
    type: 'infestation' as const,
    title: '',
    description: ''
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/vineyard/config');
        const data = await res.json();
        if (data.success && data.data) {
          const rawSectors = data.data.sectors;
          const parsedSectors = typeof rawSectors === 'string' ? JSON.parse(rawSectors) : rawSectors;
          if (parsedSectors && Array.isArray(parsedSectors) && parsedSectors.length > 0) {
            const allBounds = L.latLngBounds([]);
            parsedSectors.forEach((s: any) => {
              if (s.perimeter) {
                const b = L.geoJSON(s.perimeter).getBounds();
                if (b.isValid()) allBounds.extend(b);
              }
            });
            if (allBounds.isValid()) {
              const center = allBounds.getCenter();
              setVineyardPos([center.lat, center.lng]);
              setIsConfigured(true);
            } else {
              setIsConfigured(false);
            }
          } else {
            setIsConfigured(false);
          }
        } else {
          setIsConfigured(false);
        }
      } catch (e) {
        setIsConfigured(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!isConfigured || !vineyardPos) {
      setAlerts([]);
      return;
    }

    const controller = new AbortController();

    const fetchAlerts = async () => {
      try {
        setIsFeedLoading(true);
        setFeedError(null);

        const params = new URLSearchParams({
          lat: String(vineyardPos[0]),
          lng: String(vineyardPos[1]),
          radiusKm: String(radiusKm)
        });
        const res = await fetch(`/api/alerts?${params.toString()}`, {
          signal: controller.signal
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load alerts');
        }

        setAlerts((data.data || []).map(toNetworkAlert));
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        setFeedError(e.message || 'Failed to load alerts');
      } finally {
        if (!controller.signal.aborted) setIsFeedLoading(false);
      }
    };

    fetchAlerts();

    return () => controller.abort();
  }, [isConfigured, radiusKm, vineyardPos]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = L.map(mapRef.current, {
      center: [43.4633, 11.3126],
      zoom: 11,
      zoomControl: false,
      attributionControl: false
    });
    L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20
    }).addTo(mapInstanceRef.current);
    layersRef.current.addTo(mapInstanceRef.current);
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    });
    if (mapRef.current) resizeObserver.observe(mapRef.current);
    setIsMapReady(true);
    return () => {
      resizeObserver.disconnect();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;
    layersRef.current.clearLayers();

    if (!isConfigured || !vineyardPos) {
      if (circleRef.current) circleRef.current.remove();
      return;
    }

    // 1. Estate Marker
    const estateIcon = L.divIcon({
      className: 'estate-marker',
      html: `<div class="relative flex items-center justify-center">
          <div class="absolute w-20 h-20 bg-[#228B22] rounded-full animate-ping opacity-20"></div>
          <div class="relative w-10 h-10 bg-[#228B22] border-4 border-white rounded-full shadow-2xl flex items-center justify-center">
             <div class="w-2 h-2 bg-white rounded-full"></div>
          </div>
        </div>`,
      iconSize: [80, 80],
      iconAnchor: [40, 40]
    });
    L.marker(vineyardPos, { icon: estateIcon }).addTo(layersRef.current);

    // 2. Radius circle
    if (circleRef.current) circleRef.current.remove();
    circleRef.current = L.circle(vineyardPos, {
      radius: radiusKm * 1000,
      color: '#FACC15',
      weight: 4,
      fillColor: '#FACC15',
      fillOpacity: 0.1,
      dashArray: '12, 12'
    }).addTo(layersRef.current);

    // 3. Alerts
    alerts.forEach(alert => {
      if (alert.type === 'environmental') return;
      const dist = mapInstanceRef.current!.distance(vineyardPos, [alert.lat, alert.lng]);
      if (dist <= radiusKm * 1000) {
        const iconHtml = renderToStaticMarkup(alert.icon);
        const colorMap: any = { infestation: '#EC4899', hydraulic: '#10B981' };
        
        L.circle([alert.lat, alert.lng], {
          radius: 1000,
          color: colorMap[alert.type],
          weight: 2,
          fillColor: colorMap[alert.type],
          fillOpacity: 0.15,
          dashArray: '5, 5'
        }).addTo(layersRef.current);

        const marker = L.marker([alert.lat, alert.lng], {
          icon: L.divIcon({
            className: 'alert-marker-pulse',
            html: `<div class="relative group cursor-pointer transition-transform hover:scale-110">
                <div class="absolute -inset-2 bg-black/60 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 group-hover:border-white/40 transition-all"></div>
                <div class="${alert.iconColor} relative flex items-center justify-center">${iconHtml}</div>
              </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });

        marker.on('click', () => {
          setActiveAlertId(alert.id);
          const element = document.getElementById(`alert-${alert.id}`);
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        marker.addTo(layersRef.current);
      }
    });

    const bounds = circleRef.current.getBounds();
    if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [100, 100], animate: true });
  }, [isMapReady, radiusKm, vineyardPos, alerts, isConfigured]);

  const handleReportIssue = async () => {
    if (!vineyardPos || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setFeedError(null);

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          title: formData.title,
          description: formData.description,
          lat: vineyardPos[0],
          lng: vineyardPos[1]
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save alert');
      }

      setAlerts((currentAlerts) => [
        toNetworkAlert({
          ...data.data,
          distanceKm: 0
        }),
        ...currentAlerts.filter((alert) => alert.id !== data.data.id)
      ]);
      setShowReportModal(false);
      setFormData({ type: 'infestation', title: '', description: '' });
    } catch (e: any) {
      setFeedError(e.message || 'Failed to save alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-stone-950">
      <div ref={mapRef} className="absolute inset-0 w-full h-full z-0" style={{ isolation: 'isolate' }} />

      {/* OVERLAY FOR NOT CONFIGURED */}
      {!isConfigured && (
        <div className="absolute inset-0 z-[1100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 text-center animate-in fade-in duration-700">
          <div className="max-w-md bg-stone-950/80 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center">
            <div className="w-20 h-20 bg-[#228B22]/10 rounded-3xl flex items-center justify-center text-[#228B22] mb-8 border border-[#228B22]/20">
              <MapIcon size={40} />
            </div>
            <h2 className="text-3xl font-manrope font-black text-white tracking-tight mb-4">Vineyard Not Configured</h2>
            <p className="text-white/50 text-sm font-medium leading-relaxed mb-10">
              We couldn't find an active vineyard map. Please define your land boundaries in the configuration dashboard to activate the community alert network.
            </p>
            <a href="/edit" className="inline-flex items-center gap-3 bg-[#228B22] hover:bg-[#2EB82E] text-white px-8 py-4 rounded-2xl font-manrope font-black text-xs uppercase tracking-widest transition-all">
              Go to Configuration <Plus size={16} />
            </a>
          </div>
        </div>
      )}

      {/* UI ELEMENTS (HIDDEN IF NOT CONFIGURED) */}
      {isConfigured && (
        <>
          <div className="absolute top-8 left-8 z-[1000] flex flex-col gap-4">
            <div className="bg-black/60 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-1 flex flex-col w-fit">
              <button onClick={() => mapInstanceRef.current?.zoomIn()} className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-white rounded-xl transition-all"><Plus size={24} /></button>
              <div className="h-px bg-white/5 mx-2" />
              <button onClick={() => mapInstanceRef.current?.zoomOut()} className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-white rounded-xl transition-all"><Minus size={24} /></button>
            </div>
          </div>

          <div className="absolute bottom-8 left-8 z-[1000] pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-5 flex flex-col gap-4 min-w-[200px]">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none">Community Coverage</span>
              <div className="flex gap-2">
                {[5, 15, 30].map(r => (
                  <button key={r} onClick={() => setRadiusKm(r)} className={`flex-1 py-2.5 rounded-xl font-manrope font-black text-[10px] transition-all border ${radiusKm === r ? 'bg-[#228B22] border-[#228B22] text-white shadow-lg shadow-green-900/40' : 'bg-white/5 border-white/5 text-stone-400 hover:bg-white/10 hover:text-white'}`}>{r}k</button>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute top-8 right-8 bottom-8 w-[420px] z-[1000] pointer-events-none">
            <div className="w-full h-full bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col p-6 pointer-events-auto overflow-hidden box-border text-left">
              <div className="px-2">
                <h2 className="text-2xl font-manrope font-black text-white tracking-tight mb-1">Local Alerts Feed</h2>
                <p className="text-white/40 font-inter text-[10px] font-semibold mb-8 uppercase tracking-[0.2em]">Reports within {radiusKm}KM Radius</p>
                {feedError && (
                  <p className="text-rose-400 text-[10px] font-bold mb-4 uppercase tracking-widest">{feedError}</p>
                )}
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto overflow-x-hidden px-2 custom-scrollbar flex flex-col gap-4 scroll-smooth pb-4">
                {isFeedLoading && alerts.length === 0 && (
                  <div className="w-full rounded-[2rem] p-5 border bg-white/5 border-white/5 text-white/40 text-[11px] font-bold uppercase tracking-widest">
                    Loading local alerts...
                  </div>
                )}
                {!isFeedLoading && alerts.length === 0 && (
                  <div className="w-full rounded-[2rem] p-5 border bg-white/5 border-white/5 text-white/40 text-[11px] font-bold uppercase tracking-widest">
                    No alerts in this radius.
                  </div>
                )}
                {alerts.map(alert => (
                  <div key={alert.id} id={`alert-${alert.id}`} className={`w-full rounded-[2rem] p-5 border transition-all duration-500 group cursor-pointer flex items-start gap-4 box-border ${activeAlertId === alert.id ? 'bg-white/15 border-white/20 shadow-2xl scale-[1.02]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`} onClick={() => { setActiveAlertId(alert.id); mapInstanceRef.current?.setView([alert.lat, alert.lng], 15, { animate: true }); }}>
                    <div className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center bg-stone-900/50 border border-white/10 shadow-inner ${alert.iconColor}`}>{alert.icon}</div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <h4 className="font-manrope font-black text-white text-[14px] tracking-tight leading-tight">{alert.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{alert.distance}</span>
                        <span className="w-1 h-1 bg-white/10 rounded-full"></span>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{alert.time}</span>
                      </div>
                      <p className="text-white/50 text-[11px] leading-relaxed mt-1 font-medium italic">{alert.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-white/5 px-2">
                <button onClick={() => setShowReportModal(true)} className="w-full bg-[#228B22] hover:bg-[#2EB82E] text-white py-6 rounded-3xl font-manrope font-black text-[12px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-2xl shadow-green-950/60 transition-all active:scale-[0.98] hover:-translate-y-0.5">Report New Issue <Plus size={18} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-stone-900 border border-white/10 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-manrope font-black text-white tracking-tight">Report Estate Issue</h3>
              <button onClick={() => setShowReportModal(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-stone-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest ml-1">Select Category</label>
              <div className="grid grid-cols-2 gap-3">
                {[{ id: 'infestation', icon: <Bug />, color: 'text-pink-500', label: 'Insects' }, { id: 'hydraulic', icon: <Droplets />, color: 'text-emerald-500', label: 'Hydric & Health' }].map(cat => (
                  <button key={cat.id} onClick={() => setFormData({ ...formData, type: cat.id as any })} className={`flex flex-col items-center gap-3 p-4 rounded-3xl border transition-all ${formData.type === cat.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-transparent opacity-40 hover:opacity-100'}`}>
                    <div className={cat.color}>{cat.icon}</div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest ml-1">Issue Title</label>
              <input 
                type="text"
                value={formData.title} 
                onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                placeholder="e.g. Broken sprinkler, Leaf damage..." 
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm font-bold focus:outline-none focus:border-[#228B22] transition-colors placeholder:text-stone-600" 
              />
            </div>

            <div className="flex flex-col gap-4">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest ml-1">Description</label>
              <textarea 
                value={formData.description} 
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                placeholder="What did you observe?..." 
                className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm font-medium focus:outline-none focus:border-[#228B22] transition-colors resize-none placeholder:text-stone-600" 
              />
            </div>
            <div className="bg-stone-800/50 p-4 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500"><AlertTriangle size={20} /></div>
              <div className="flex flex-col"><span className="text-[10px] font-black text-white uppercase italic tracking-wide text-green-500">Auto-Geolocation On</span><p className="text-[9px] text-stone-400 font-medium">Reporting from your vineyard's center.</p></div>
            </div>
            <button onClick={handleReportIssue} disabled={isSubmitting || !formData.description.trim()} className="w-full bg-[#228B22] hover:bg-[#2EB82E] disabled:opacity-30 text-white py-5 rounded-2xl font-manrope font-black text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all active:scale-[0.98]">{isSubmitting ? 'Saving Report...' : 'Send Report'} <Send size={16} /></button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 20px; }
        .leaflet-container { background: #0c0a09 !important; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoom-in-95 { from { transform: scale(0.95); } to { transform: scale(1); } }
        .animate-in { animation-fill-mode: forwards; }
        .fade-in { animation-name: fade-in; }
        .zoom-in-95 { animation-name: zoom-in-95; }
      `}</style>
    </div>
  );
}
