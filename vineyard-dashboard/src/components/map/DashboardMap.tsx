import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { Plus, Minus, Layers } from 'lucide-react';

interface DashboardMapProps {
  onStatsUpdate?: (area: string, count: number, lat: number, lng: number) => void;
}

interface Sector {
  id: string;
  name: string;
  perimeter: any;
  rows: any[];
  showRows: boolean;
  colorTheme: { poly: string; rows: string };
}

export function DashboardMap({ onStatsUpdate }: DashboardMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const sectorsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const rowsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [sensors, setSensors] = useState<any[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [showRows, setShowRows] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Map Initialization
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = [43.4633, 11.3126];
    mapInstanceRef.current = L.map(mapRef.current, {
      center: initialCenter,
      zoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20
    }).addTo(mapInstanceRef.current);

    sectorsLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    rowsLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    markersGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    });

    if (mapRef.current) resizeObserver.observe(mapRef.current);
    setIsMapReady(true);

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sensorsRes, configRes] = await Promise.all([
          fetch('/api/sensors'),
          fetch('/api/vineyard/config')
        ]);

        const sensorsData = await sensorsRes.json();
        const configData = await configRes.json();

        let sentinelCount = 0;
        let totalArea = '---';
        let finalLat = 43.4633;
        let finalLng = 11.3126;

        if (sensorsData.success && sensorsData.data) {
          setSensors(sensorsData.data);
          sentinelCount = sensorsData.data.length;
        }

        if (configData.success && configData.data) {
          const v = configData.data;
          totalArea = v.area || '---';

          // Read sectors (new multi-sector format)
          if (v.sectors && Array.isArray(v.sectors) && v.sectors.length > 0) {
            setSectors(v.sectors);

            // Fit map to all sectors
            if (mapInstanceRef.current) {
              const allBounds = L.latLngBounds([]);
              v.sectors.forEach((s: any) => {
                if (s.perimeter) {
                  const b = L.geoJSON(s.perimeter).getBounds();
                  if (b.isValid()) allBounds.extend(b);
                }
              });
              if (allBounds.isValid()) {
                mapInstanceRef.current.fitBounds(allBounds, { padding: [80, 80] });
                const center = allBounds.getCenter();
                finalLat = center.lat;
                finalLng = center.lng;
              }
            }
          } else if (v.perimeter) {
            // Legacy single-vineyard format
            const perimeterGeoJSON = typeof v.perimeter === 'string' ? JSON.parse(v.perimeter) : v.perimeter;
            const legacyRows = v.rows ? (typeof v.rows === 'string' ? JSON.parse(v.rows) : v.rows) : [];
            setSectors([{
              id: 'legacy-1',
              name: 'Vineyard 1',
              perimeter: perimeterGeoJSON,
              rows: legacyRows,
              showRows: true,
              colorTheme: { poly: '#228B22', rows: '#FFD700' }
            }]);
            if (mapInstanceRef.current) {
              const bounds = L.geoJSON(perimeterGeoJSON).getBounds();
              if (bounds.isValid()) {
                mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
                const center = bounds.getCenter();
                finalLat = center.lat;
                finalLng = center.lng;
              }
            }
          } else {
            // No data at all
            setSectors([]);
            if (mapInstanceRef.current) {
              if (v.latitude && v.longitude) {
                mapInstanceRef.current.setView([v.latitude, v.longitude], 18);
                finalLat = v.latitude;
                finalLng = v.longitude;
              }
            }
          }
        }

        if (onStatsUpdate) {
          onStatsUpdate(totalArea, sentinelCount, finalLat, finalLng);
        }

      } catch (err: any) {
        console.error('Fetch error:', err);
        setError('Spatial synchronization error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Render Sectors (Perimeters + Labels)
  useEffect(() => {
    if (!mapInstanceRef.current || !sectorsLayerGroupRef.current || !isMapReady) return;
    const group = sectorsLayerGroupRef.current;
    group.clearLayers();

    sectors.forEach((sector) => {
      if (!sector.perimeter) return;
      const color = sector.colorTheme?.poly || '#228B22';

      const geoLayer = L.geoJSON(sector.perimeter, {
        style: {
          color,
          weight: 3,
          fillOpacity: 0.12,
          dashArray: '8, 8',
          lineJoin: 'round'
        }
      }).addTo(group);

      // Add sector name label at the centroid
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        const center = bounds.getCenter();
        const labelIcon = L.divIcon({
          className: 'sector-label-dashboard',
          html: `<div style="
            display:inline-flex;
            align-items:center;
            gap:6px;
            font-family:'Manrope',sans-serif;
            font-size:10px;
            font-weight:900;
            color:#fff;
            text-transform:uppercase;
            letter-spacing:0.15em;
            white-space:nowrap;
            pointer-events:none;
            background:rgba(0,0,0,0.75);
            backdrop-filter:blur(12px);
            padding:5px 12px 5px 8px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,0.12);
            box-shadow:0 4px 16px rgba(0,0,0,0.5);
            transform:translate(-50%,-50%);
          "><span style="
            width:4px;
            height:14px;
            border-radius:2px;
            background:${color};
            flex-shrink:0;
            box-shadow:0 0 6px ${color}80;
          "></span>${sector.name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        L.marker(center, { icon: labelIcon, interactive: false }).addTo(group);
      }
    });
  }, [sectors, isMapReady]);

  // Render Rows
  useEffect(() => {
    if (!mapInstanceRef.current || !rowsLayerGroupRef.current || !isMapReady) return;
    const group = rowsLayerGroupRef.current;
    group.clearLayers();

    if (!showRows) return;

    sectors.forEach((sector) => {
      if (!sector.rows || !sector.showRows) return;
      const rowColor = sector.colorTheme?.rows || '#FFD700';

      sector.rows.forEach((row, idx) => {
        if (!row.points) return;
        const poly = L.polyline(row.points, {
          color: rowColor,
          weight: 2.5,
          opacity: 0.7
        }).addTo(group);

        const rowId = row.id || `R-${(idx + 1).toString().padStart(2, '0')}`;
        poly.bindTooltip(`<b>Row: ${rowId}</b><br/>Length: ${row.length?.toFixed(1)}m`, {
          sticky: true,
          className: 'premium-tooltip'
        });
      });
    });
  }, [sectors, showRows, isMapReady]);

  // Render Sentinel Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current || sensors.length === 0 || !isMapReady) return;

    markersGroupRef.current.clearLayers();

    sensors.forEach((sensor) => {
      if (!sensor.latitude || !sensor.longitude) return;

      const moisture = sensor.moisture || 0;
      let statusColor = '#228B22';
      let statusLabel = 'Optimal';

      if (moisture < 20) {
        statusColor = '#ef4444';
        statusLabel = 'Critical';
      } else if (moisture <= 30) {
        statusColor = '#fbbf24';
        statusLabel = 'Warning';
      }

      const captureTime = sensor.last_capture_time || new Date().toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const captureImage = sensor.last_capture_image || `https://images.unsplash.com/photo-1593444453965-0fcb546bcdd7?auto=format&fit=crop&w=400&q=80&sig=${sensor.id || sensor.zone_number}`;

      const sensorName = (sensor.zone_name || sensor.zone_number).toString();
      const charWidth = 8;
      const padding = 20;
      const minWidth = 28;
      const dynamicWidth = Math.max(minWidth, (sensorName.length * charWidth) + padding);

      const premiumIcon = L.divIcon({
        className: 'sentinel-marker-dashboard',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full animate-ping" style="background-color: ${statusColor}60"></div>
            <div class="relative h-7 px-2 backdrop-blur-xl border border-white/40 rounded-full shadow-2xl flex items-center justify-center overflow-hidden" 
                 style="background-color: ${statusColor}; width: ${dynamicWidth}px; transition: width 0.3s ease-out;">
              <div class="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent"></div>
              <span class="relative text-white font-black text-[10px] tracking-tighter shadow-sm whitespace-nowrap">${sensorName}</span>
            </div>
            <div class="absolute -bottom-1 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_${statusColor}]" style="background-color: ${statusColor}"></div>
          </div>
        `,
        iconSize: [dynamicWidth, 32],
        iconAnchor: [dynamicWidth / 2, 16]
      });

      const popupContent = `
        <div style="font-family:'Manrope',sans-serif; padding:16px; min-width:240px; background:#fff; border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding-bottom:10px; margin-bottom:10px;">
            <span style="font-size:10px; font-weight:800; color:#228B22; text-transform:uppercase; letter-spacing:0.1em;">
              Sentinel ${sensor.zone_name || sensor.zone_number}
            </span>
            <span style="font-size:8px; font-weight:900; padding:2px 8px; border-radius:10px; background:${statusColor}20; color:${statusColor}; text-transform:uppercase;">
              ${statusLabel}
            </span>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px;">
             <div style="display:flex; flex-direction:column;">
               <span style="color:#999; font-size:9px; text-transform:uppercase; font-weight:700;">Moisture</span>
               <b style="color:#111; font-size:14px;">${sensor.moisture ?? '--'}%</b>
             </div>
             <div style="display:flex; flex-direction:column;">
               <span style="color:#999; font-size:9px; text-transform:uppercase; font-weight:700;">Temperature</span>
               <b style="color:#111; font-size:14px;">${sensor.temperature ?? '--'}°C</b>
             </div>
          </div>

          <div style="margin-top:14px; border-radius:10px; overflow:hidden; border:1px solid #e2e8f0; position:relative;">
             <img src="${captureImage}" alt="Vine snapshot" style="width:100%; height:110px; object-fit:cover; display:block;" />
             <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px 10px 8px 10px;">
               <p style="font-size:7px; text-transform:uppercase; color:#cbd5e1; font-weight:800; margin:0; letter-spacing:0.05em;">Latest Capture</p>
               <p style="font-size:11px; color:#fff; font-weight:700; margin:0; margin-top:2px;">${captureTime}</p>
             </div>
          </div>

          <div style="margin-top:10px; display:flex; gap:4px;">
            ${(sensor.soil_status || []).map((tag: any) => `
              <span style="font-size:7px; font-weight:800; color:#228B22; background:#228B2210; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${tag}</span>
            `).join('')}
          </div>
        </div>
      `;

      L.marker([sensor.latitude, sensor.longitude], { icon: premiumIcon })
        .bindPopup(popupContent, { className: 'premium-sentinel-popup', minWidth: 240 })
        .addTo(markersGroupRef.current!);
    });
  }, [sensors, isMapReady]);

  const handleZoom = (dir: 'in' | 'out') => {
    if (mapInstanceRef.current) {
      if (dir === 'in') mapInstanceRef.current.zoomIn();
      else mapInstanceRef.current.zoomOut();
    }
  };

  return (
    <div className="absolute inset-0 rounded-[2rem] overflow-hidden border border-white/5 shadow-inner bg-stone-950 z-0 group">
      <div 
        ref={mapRef} 
        className="w-full h-full select-none"
        style={{ isolation: 'isolate' }}
      />
      
      {/* MAP CONTROLS */}
      <div className="absolute top-8 right-8 z-[1000] flex flex-col gap-6">
        {/* Rows Toggle */}
        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] p-1 shadow-2xl pointer-events-auto">
          <button 
            onClick={() => setShowRows(!showRows)}
            className={`h-14 px-4 flex items-center gap-3 rounded-[1.25rem] transition-all duration-500 ${
              showRows ? 'bg-[#228B22] text-white shadow-lg shadow-green-900/40' : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
            title={showRows ? "Hide Rows" : "Show Rows"}
          >
            <Layers className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] pr-1">Rows</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col shadow-2xl p-1 pointer-events-auto w-fit ml-auto">
          <button 
            onClick={() => handleZoom('in')}
            className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </button>
          <div className="h-px bg-white/5 mx-2" />
          <button 
            onClick={() => handleZoom('out')}
            className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95"
          >
            <Minus className="h-6 w-6" />
          </button>
        </div>
      </div>



      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 z-[2000] gap-4">
           <div className="absolute inset-0 bg-gradient-to-br from-[#228B22]/10 to-transparent"></div>
           <div className="w-12 h-12 border-4 border-[#228B22] border-t-transparent rounded-full animate-spin"></div>
           <p className="text-stone-300 font-manrope font-black uppercase tracking-[0.2em] text-[10px]">Syncing GIS Assets...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/90 backdrop-blur-md text-red-200 z-[2000] p-6 text-center">
          <p className="font-bold underline">{error}</p>
        </div>
      )}

      {/* CUSTOM POPUP STYLES */}
      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-tip-container {
          display: none !important;
        }
        .premium-sentinel-popup .leaflet-popup-content {
          margin: 0 !important;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
        }
      `}</style>
    </div>
  );
}
