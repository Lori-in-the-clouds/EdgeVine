import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { Plus, Minus, Layers, Play, Pause, Thermometer, Wind, Umbrella, Check, X, Rows3 } from 'lucide-react';

interface DashboardMapProps {
  activeLayer: 'none' | 'precipitation' | 'temperature' | 'wind';
  setActiveLayer: (layer: 'none' | 'precipitation' | 'temperature' | 'wind') => void;
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

const sensorTimestampFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function parseSensorTimestamp(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const timestamp = String(value);
  const wallClockMatch = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
  );

  if (wallClockMatch) {
    const [, year, month, day, hour, minute, second = '0'] = wallClockMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSensorTimestamp(value: unknown): string {
  const parsed = parseSensorTimestamp(value);
  return parsed ? sensorTimestampFormatter.format(parsed) : 'No Capture';
}

export function DashboardMap({ activeLayer, setActiveLayer, onStatsUpdate }: DashboardMapProps) {
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
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [weatherFrames, setWeatherFrames] = useState<{path: string; time: number; isForecast?: boolean}[]>([]);
  const [weatherIndex, setWeatherIndex] = useState(0);
  const [weatherPlaying, setWeatherPlaying] = useState(false);
  const weatherLayerRef = useRef<L.Layer | null>(null);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Map Initialization
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = [43.4633, 11.3126];
    mapInstanceRef.current = L.map(mapRef.current, {
      center: initialCenter,
      zoom: 18,
      minZoom: 3,
      maxZoom: 20,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      minZoom: 3,
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
          const parsedSectors = typeof v.sectors === 'string' ? JSON.parse(v.sectors) : v.sectors;
          if (parsedSectors && Array.isArray(parsedSectors) && parsedSectors.length > 0) {
            setSectors(parsedSectors);

            // Fit map to all sectors
            if (mapInstanceRef.current) {
              const allBounds = L.latLngBounds([]);
              parsedSectors.forEach((s: any) => {
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

      const captureTime = formatSensorTimestamp(sensor.timestamp);
      const captureImage = sensor.processed_image_url || sensor.image_url || `https://images.unsplash.com/photo-1593444453965-0fcb546bcdd7?auto=format&fit=crop&w=400&q=80&sig=${sensor.id || sensor.zone_number}`;

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
            <div class="absolute -bottom-1 w-1.5 h-1.5 rounded-full" style="background-color: ${statusColor}; box-shadow: 0 0 8px ${statusColor};"></div>
          </div>
        `,
        iconSize: [dynamicWidth, 32],
        iconAnchor: [dynamicWidth / 2, 16]
      });

      const popupContent = `
        <div style="font-family:'Manrope',sans-serif; padding:0; min-width:280px; background:#111; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
          <div style="position:relative; width:100%; height:180px;">
             <img src="${captureImage}" alt="Vine snapshot" style="width:100%; height:100%; object-fit:cover; display:block;" />
             <div style="position:absolute; top:12px; left:12px; background:rgba(0,0,0,0.6); backdrop-filter:blur(10px); padding:4px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
                <span style="font-size:9px; font-weight:900; color:#fff; text-transform:uppercase; letter-spacing:0.1em;">Sentinel ${sensor.zone_name || sensor.zone_number}</span>
             </div>
             <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.9), transparent); padding:30px 16px 12px 16px;">
                <p style="font-size:7px; text-transform:uppercase; color:#228B22; font-weight:900; margin:0; letter-spacing:0.2em;">Last Recorded Feed</p>
                <p style="font-size:12px; color:#fff; font-weight:700; margin:0; margin-top:2px;">${captureTime}</p>
             </div>
          </div>
          
          <div style="padding:16px; background:#1a1a1a;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
               <div style="display:flex; flex-direction:column; gap:2px;">
                 <span style="color:#666; font-size:9px; text-transform:uppercase; font-weight:800; tracking-widest;">Soil Moisture</span>
                 <b style="color:#fff; font-size:16px;">${sensor.moisture ?? '--'}%</b>
               </div>
               <div style="display:flex; flex-direction:column; gap:2px;">
                 <span style="color:#666; font-size:9px; text-transform:uppercase; font-weight:800; tracking-widest;">AI Grape Clusters</span>
                 <b style="color:#228B22; font-size:16px;">${sensor.grape_count ?? '--'}</b>
               </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
               <div style="display:flex; flex-direction:column; gap:2px;">
                 <span style="color:#666; font-size:9px; text-transform:uppercase; font-weight:800; tracking-widest;">Ambient Temp</span>
                 <b style="color:#fff; font-size:16px;">${sensor.temperature ?? '--'}°C</b>
               </div>
               <div style="display:flex; flex-direction:column; gap:2px;">
                 <span style="color:#666; font-size:9px; text-transform:uppercase; font-weight:800; tracking-widest;">Leaf Health</span>
                 <b style="color:#fff; font-size:11px; margin-top:2px;">${sensor.health_status || '--'}</b>
               </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
               <div style="display:flex; gap:4px;">
                 <span style="font-size:8px; font-weight:900; color:#fff; background:${statusColor}; padding:3px 8px; border-radius:6px; text-transform:uppercase;">${statusLabel}</span>
               </div>
               <span style="font-size:8px; font-weight:700; color:#555; text-transform:uppercase;">Station ID: ${sensor.external_id || 'EF-401'}</span>
            </div>
          </div>
        </div>
      `;


      L.marker([sensor.latitude, sensor.longitude], { icon: premiumIcon })
        .bindPopup(popupContent, { className: 'premium-sentinel-popup', minWidth: 240 })
        .addTo(markersGroupRef.current!);
    });
  }, [sensors, isMapReady]);
  
  // Weather: Gestione layer separata per tipo
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    // Pulizia layer precedente
    if (weatherLayerRef.current) {
      mapInstanceRef.current.removeLayer(weatherLayerRef.current);
      weatherLayerRef.current = null;
    }
    setWeatherFrames([]);
    setWeatherIndex(0);
    setWeatherPlaying(false);
    if (animationRef.current) clearInterval(animationRef.current);

    if (activeLayer === 'none') return;

    if (activeLayer === 'precipitation') {
      // --- RADAR ANIMATO (RainViewer) ---
      const fetchFrames = async () => {
        try {
          const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
          const data = await res.json();
          const past = (data.radar?.past || []).map((f: any) => ({
            path: f.path,
            time: f.time,
            isForecast: false,
            type: 'radar'
          }));
          const nowcast = (data.radar?.nowcast || []).map((f: any) => ({
            path: f.path,
            time: f.time,
            isForecast: true,
            type: 'radar'
          }));
          
          // Se il futuro è vuoto o troppo corto, aggiungiamo gli ultimi 5 del passato per far muovere la barra
          const presentFrame = past.length > 0 ? [past[past.length - 1]] : [];
          let displayFrames = [...presentFrame, ...nowcast];
          if (displayFrames.length < 2 && past.length > 1) {
            displayFrames = [...past.slice(-6), ...nowcast];
          }
          
          if (displayFrames.length > 0) {
            const finalFrames = displayFrames.map((f) => ({
              ...f,
              isForecast: f.time > (past[past.length - 1]?.time || 0)
            }));
            setWeatherFrames(finalFrames);
            const lastPastTime = past[past.length - 1]?.time || 0;
            const presentIdx = finalFrames.findIndex(f => f.time === lastPastTime);
            setWeatherIndex(presentIdx >= 0 ? presentIdx : 0);
          }
        } catch (err) {
          console.error('RainViewer fetch error:', err);
        }
      };
      fetchFrames();
      const refresh = setInterval(fetchFrames, 300000);
      return () => clearInterval(refresh);
    } else if (activeLayer === 'temperature' || activeLayer === 'wind') {
      // --- APPLE WEATHER STYLE (v6 — Dual Cache Strategy: World + Local) ---
      // Cache valida per 1 ORA (3600000 ms)
      const CACHE_TTL = 3600000;
      
      // Cache persistente (usa variabili esterne all'effetto per non resettarle)
      if (!(window as any)._weatherCache) (window as any)._weatherCache = { world: null, local: null };
      const cache = (window as any)._weatherCache;

      const fetchWorldData = async () => {
        if (cache.world && (Date.now() - cache.world.ts) < CACHE_TTL && cache.world.layer === activeLayer) return cache.world.data;
        
        // Griglia mondiale super-leggera (5x5 = 25 punti)
        const lats = [-60, -30, 0, 30, 60];
        const lngs = [-150, -75, 0, 75, 150];
        const latsArr: number[] = [];
        const lngsArr: number[] = [];
        
        lats.forEach(lt => lngs.forEach(lg => {
          latsArr.push(lt); lngsArr.push(lg);
        }));

        try {
          const params = activeLayer === 'temperature' ? 'current=temperature_2m' : 'current=wind_speed_10m';
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latsArr.join(',')}&longitude=${lngsArr.join(',')}&${params}`);
          const data = await res.json();
          const results = Array.isArray(data) ? data : [data];
          
          const mapped = results.map((r: any, i: number) => ({
            lat: latsArr[i], lng: lngsArr[i],
            val: activeLayer === 'temperature' ? r.current.temperature_2m : r.current.wind_speed_10m
          }));
          
          cache.world = { ts: Date.now(), layer: activeLayer, data: mapped };
          return mapped;
        } catch (e) { return cache.world?.data || []; }
      };

      const fetchLocalData = async (center: L.LatLng) => {
        // Cache locale basata sulla vicinanza (se siamo entro 50km dal punto precedente, usa cache)
        const isNear = cache.local && 
                      Math.abs(cache.local.lat - center.lat) < 0.5 && 
                      Math.abs(cache.local.lng - center.lng) < 0.5;

        if (isNear && (Date.now() - cache.local.ts) < CACHE_TTL && cache.local.layer === activeLayer) return cache.local.data;

        try {
          const params = activeLayer === 'temperature' ? 'current=temperature_2m' : 'current=wind_speed_10m';
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${center.lat.toFixed(3)}&longitude=${center.lng.toFixed(3)}&${params}`);
          const data = await res.json();
          const val = activeLayer === 'temperature' ? data.current.temperature_2m : data.current.wind_speed_10m;
          
          const localPoints = [{ lat: center.lat, lng: center.lng, val }];
          cache.local = { ts: Date.now(), layer: activeLayer, data: localPoints, lat: center.lat, lng: center.lng };
          return localPoints;
        } catch (e) { return cache.local?.data || []; }
      };

      const renderOverlay = async () => {
        const map = mapInstanceRef.current;
        if (!map) return;
        
        const zoom = map.getZoom();
        const center = map.getCenter();
        const bounds = map.getBounds();
        
        // Se siamo molto zoommati fuori (zoom < 6), usa la griglia mondiale
        // Se siamo dentro (zoom >= 6), usa i dati locali precisi
        const dataPoints = zoom < 6 ? await fetchWorldData() : await fetchLocalData(center);
        if (!dataPoints || dataPoints.length === 0) return;

        const stops = activeLayer === 'temperature' 
          ? [{ val: -20, r: 107, g: 33, b: 168 }, { val: -5, r: 59, g: 130, b: 246 }, { val: 0, r: 6, g: 182, b: 212 }, { val: 8, r: 34, g: 197, b: 94 }, { val: 15, r: 132, g: 204, b: 22 }, { val: 20, r: 250, g: 204, b: 21 }, { val: 28, r: 249, g: 115, b: 22 }, { val: 35, r: 239, g: 68, b: 68 }, { val: 45, r: 127, g: 29, b: 29 }]
          : [{ val: 0, r: 147, g: 197, b: 253 }, { val: 10, r: 45, g: 212, b: 191 }, { val: 20, r: 74, g: 222, b: 128 }, { val: 35, r: 250, g: 204, b: 21 }, { val: 50, r: 249, g: 115, b: 22 }, { val: 80, r: 239, g: 68, b: 68 }];
        
        const getColor = (v: number): [number, number, number] => {
          const first = stops[0]!, last = stops[stops.length-1]!;
          if (v <= first.val) return [first.r, first.g, first.b];
          if (v >= last.val) return [last.r, last.g, last.b];
          for (let i=0; i<stops.length-1; i++) {
            const s0=stops[i]!, s1=stops[i+1]!;
            if (v>=s0.val && v<=s1.val) {
              const t = (v-s0.val)/(s1.val-s0.val);
              return [Math.round(s0.r + t*(s1.r-s0.r)), Math.round(s0.g + t*(s1.g-s0.g)), Math.round(s0.b + t*(s1.b-s0.b))];
            }
          }
          return [first.r, first.g, first.b];
        };

        const interpolate = (lng: number, lat: number) => {
          if (dataPoints.length === 1) return dataPoints[0].val;
          let sumW = 0, sumV = 0;
          for (const p of dataPoints) {
            const dx = lng - p.lng, dy = lat - p.lat;
            const d2 = dx*dx + dy*dy;
            if (d2 < 0.001) return p.val;
            const w = 1 / Math.pow(d2, 1.2);
            sumW += w; sumV += w * p.val;
          }
          return sumV / sumW;
        };

        const S = 128;
        const canvas = document.createElement('canvas');
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(S, S);
        const alpha = activeLayer === 'temperature' ? 180 : 160;
        
        const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
        for (let py=0; py<S; py++) {
          for (let px=0; px<S; px++) {
            const lng = sw.lng + (px/S)*(ne.lng-sw.lng);
            const lat = ne.lat - (py/S)*(ne.lat-sw.lat);
            const val = interpolate(lng, lat);
            const [r, g, b] = getColor(val);
            const i = (py*S + px)*4;
            imgData.data[i]=r; imgData.data[i+1]=g; imgData.data[i+2]=b; imgData.data[i+3]=alpha;
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const out = document.createElement('canvas');
        out.width = 512; out.height = 512;
        const octx = out.getContext('2d')!;
        octx.imageSmoothingEnabled = true;
        octx.filter = 'blur(8px)';
        octx.drawImage(canvas, 0, 0, 512, 512);

        const old = weatherLayerRef.current;
        weatherLayerRef.current = L.imageOverlay(out.toDataURL(), bounds, {
          opacity: 0.9, zIndex: 500, interactive: false
        }).addTo(map);
        if (old) map.removeLayer(old);
      };

      renderOverlay();
      const map = mapInstanceRef.current;
      map?.on('moveend', renderOverlay);
      return () => { map?.off('moveend', renderOverlay); };
    }

    // Default cleanup per i layer statici (temperatura/vento)
    return () => {};
  }, [activeLayer, isMapReady]);

  // Weather: Render frame radar (solo per precipitation)
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || weatherFrames.length === 0) return;
    if (activeLayer !== 'precipitation') return;

    const frame = weatherFrames[weatherIndex];
    if (!frame) return;

    if (weatherLayerRef.current) {
      mapInstanceRef.current.removeLayer(weatherLayerRef.current);
    }

    const tileUrl = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    weatherLayerRef.current = L.tileLayer(tileUrl, {
      opacity: 0.55,
      zIndex: 500,
      tileSize: 256,
      maxNativeZoom: 7,
      maxZoom: 22,
      errorTileUrl: ''
    }).addTo(mapInstanceRef.current);

    weatherLayerRef.current.on('tileerror', (e: any) => {
      e.tile.style.display = 'none';
    });
  }, [weatherIndex, weatherFrames, isMapReady, activeLayer]);

  // Weather: Animation loop
  useEffect(() => {
    if (weatherPlaying && weatherFrames.length > 1) {
      animationRef.current = setInterval(() => {
        setWeatherIndex(prev => (prev + 1) % weatherFrames.length);
      }, 500); // Velocità aumentata per maggiore fluidità (500ms)
    } else {
      if (animationRef.current) clearInterval(animationRef.current);
    }
    return () => { if (animationRef.current) clearInterval(animationRef.current); };
  }, [weatherPlaying, weatherFrames.length]);

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
      {/* TOP RIGHT: LAYERS & ROWS CONTROLLERS */}
      <div className="absolute top-8 right-8 z-[1000] flex items-center gap-4 pointer-events-auto">
        {/* Rows Toggle */}
        <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-full p-1 shadow-2xl">
          <button 
            onClick={() => setShowRows(!showRows)}
            className={`h-14 px-6 flex items-center gap-3 rounded-full transition-all duration-500 ${showRows ? 'bg-[#228B22] text-white shadow-lg' : 'text-stone-400 hover:text-white hover:bg-white/5'}`}
            title="Toggle Rows"
          >
            <Rows3 className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Rows</span>
          </button>
        </div>

        {/* LARGE LAYER SWITCHER */}
        <div className="relative">
          <button 
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            className={`h-16 w-16 flex items-center justify-center rounded-full transition-all duration-500 backdrop-blur-3xl border border-white/10 shadow-2xl ${
              activeLayer === 'precipitation' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' :
              activeLayer === 'temperature' ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40' :
              activeLayer === 'wind' ? 'bg-teal-500 text-white shadow-lg shadow-teal-900/40' :
              'bg-black/80 text-stone-400 hover:text-white hover:bg-black'
            }`}
          >
            {isLayerMenuOpen ? <X className="h-6 w-6" /> : (
              activeLayer === 'precipitation' ? <Umbrella className="h-6 w-6" /> :
              activeLayer === 'temperature' ? <Thermometer className="h-6 w-6" /> :
              activeLayer === 'wind' ? <Wind className="h-6 w-6" /> :
              <Layers className="h-6 w-6" />
            )}
          </button>

          {/* Expanded Menu Panel */}
          {isLayerMenuOpen && (
            <div className="absolute top-[80px] right-0 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-2 shadow-2xl min-w-[240px] animate-in fade-in slide-in-from-top-4">
              <div className="flex flex-col gap-1">
                <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.3em] px-4 py-3">Map Layers</p>
                {[
                  { id: 'none', label: 'Standard Map', icon: Layers, color: 'text-stone-400' },
                  { id: 'precipitation', label: 'Precipitation', icon: Umbrella, color: 'text-blue-400' },
                  { id: 'temperature', label: 'Temperature', icon: Thermometer, color: 'text-orange-400' },
                  { id: 'wind', label: 'Wind Speed', icon: Wind, color: 'text-teal-400' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveLayer(item.id as any);
                      setIsLayerMenuOpen(false);
                    }}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-[1.25rem] transition-all duration-300 ${activeLayer === item.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${activeLayer === item.id ? 'bg-white/10' : 'bg-transparent'}`}>
                        <item.icon className={`h-4 w-4 ${item.color}`} />
                      </div>
                      <span className={`text-[12px] font-bold tracking-tight ${activeLayer === item.id ? 'text-white' : 'text-stone-400'}`}>{item.label}</span>
                    </div>
                    {activeLayer === item.id && <Check className="h-4 w-4 text-blue-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM RIGHT: FUNCTIONAL STACK (Zoom Only) - Positioned close above the Astro Edit button */}
      <div className="absolute bottom-32 right-8 z-[1000] flex flex-col gap-4 items-end pointer-events-auto">
        {/* Zoom Controls */}
        <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[1.75rem] flex flex-col shadow-2xl p-1 overflow-hidden">
          <button 
            onClick={() => handleZoom('in')}
            className="w-14 h-14 flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/5 transition-all active:scale-90"
          >
            <Plus className="h-6 w-6" />
          </button>
          <div className="h-px bg-white/10 mx-2" />
          <button 
            onClick={() => handleZoom('out')}
            className="w-14 h-14 flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/5 transition-all active:scale-90"
          >
            <Minus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* BOTTOM LEFT WEATHER WIDGET */}
      {activeLayer !== 'none' && (
        <div className="absolute bottom-8 left-8 z-[1000] pointer-events-auto transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-3">

          {/* ── PRECIPITATION: Radar player animato ── */}
          {activeLayer === 'precipitation' && weatherFrames.length > 0 && (
            <>
              {/* Legend */}
              <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-xl flex flex-col gap-2">
                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/40">Rain Intensity</span>
                <div className="flex items-center gap-3">
                  {[
                    { color: 'bg-blue-200', label: 'Light' },
                    { color: 'bg-blue-500', label: 'Moderate' },
                    { color: 'bg-yellow-400', label: 'Heavy' },
                    { color: 'bg-orange-500', label: 'Intense' },
                    { color: 'bg-red-600', label: 'Extreme' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${color}`}></div>
                      <span className="text-[8px] font-bold text-white/70 uppercase tracking-tighter">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Radar Timeline Player */}
              <div className="bg-stone-950/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] px-6 py-4 shadow-2xl flex items-center gap-6 min-w-[420px]">
                <button
                  onClick={() => setWeatherPlaying(!weatherPlaying)}
                  className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-500 active:scale-90 shrink-0 ${
                    weatherPlaying
                    ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                    : 'bg-white/5 text-stone-300 hover:bg-white/10'
                  }`}
                >
                  {weatherPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 ml-1 fill-current" />}
                </button>

                <div className="flex-1 flex flex-col gap-2">
                  {/* Time + Badge */}
                  <div className="flex justify-center items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${weatherPlaying ? 'bg-blue-500 animate-pulse' : 'bg-stone-600'}`}></div>
                    <span className="text-xs font-black text-white font-manrope tracking-tighter">
                      {weatherFrames[weatherIndex]
                        ? new Date(weatherFrames[weatherIndex].time * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </span>
                    {weatherFrames[weatherIndex]?.isForecast && (
                      <span className="bg-blue-500/20 text-blue-400 text-[8px] font-black px-1.5 py-0.5 rounded-md border border-blue-500/30 animate-pulse tracking-widest uppercase">
                        Forecast
                      </span>
                    )}
                  </div>

                  {/* Slider */}
                  <div className="relative h-6 flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={weatherFrames.length - 1}
                      value={weatherIndex}
                      onChange={(e) => { setWeatherPlaying(false); setWeatherIndex(Number(e.target.value)); }}
                      className="w-full h-1 appearance-none rounded-full cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #2563eb ${(weatherIndex / Math.max(weatherFrames.length - 1, 1)) * 100}%, rgba(255,255,255,0.05) ${(weatherIndex / Math.max(weatherFrames.length - 1, 1)) * 100}%)`
                      }}
                    />
                    {/* NOW marker */}
                    {weatherFrames.findIndex(f => f.isForecast) > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/50 pointer-events-none z-10"
                        style={{ left: `${(weatherFrames.findIndex(f => f.isForecast) / Math.max(weatherFrames.length - 1, 1)) * 100}%` }}
                      >
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[6px] font-black text-white/50 uppercase">Now</div>
                      </div>
                    )}
                  </div>

                  {/* Labels */}
                  <div className="flex justify-between px-1">
                    <span className="text-[7px] font-bold text-stone-500 uppercase tracking-[0.3em]">Past</span>
                    <span className="text-[7px] font-black text-blue-400/60 uppercase tracking-[0.2em]">Rain Timeline</span>
                    <span className="text-[7px] font-bold text-blue-400 uppercase tracking-[0.3em]">Latest</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── TEMPERATURE: Legenda colori OWM ── */}
          {activeLayer === 'temperature' && (
            <div className="bg-black/70 backdrop-blur-3xl border border-orange-500/20 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-orange-400/70">Temperature Scale · OpenWeatherMap</span>
              <div className="flex items-end gap-1">
                {[
                  { color: 'bg-violet-700', label: '< -20°' },
                  { color: 'bg-blue-600',   label: '-10°' },
                  { color: 'bg-cyan-400',   label: '0°' },
                  { color: 'bg-green-400',  label: '10°' },
                  { color: 'bg-yellow-300', label: '20°' },
                  { color: 'bg-orange-400', label: '30°' },
                  { color: 'bg-red-600',    label: '> 40°' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <span className="text-[6px] font-bold text-white/50">{label}</span>
                    <div className={`w-7 h-3 rounded-sm ${color}`}></div>
                  </div>
                ))}
              </div>
              <p className="text-[7px] text-white/30 font-manrope">Real-time surface temperature overlay</p>
            </div>
          )}

          {/* ── WIND: Legenda colori OWM ── */}
          {activeLayer === 'wind' && (
            <div className="bg-black/70 backdrop-blur-3xl border border-teal-500/20 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-teal-400/70">Wind Speed Scale · OpenWeatherMap</span>
              <div className="flex items-end gap-1">
                {[
                  { color: 'bg-blue-200',  label: 'Calm' },
                  { color: 'bg-teal-400',  label: 'Breeze' },
                  { color: 'bg-green-400', label: '~20 km/h' },
                  { color: 'bg-yellow-400',label: '~40 km/h' },
                  { color: 'bg-orange-500',label: '~60 km/h' },
                  { color: 'bg-red-600',   label: 'Gale' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <span className="text-[6px] font-bold text-white/50">{label}</span>
                    <div className={`w-8 h-3 rounded-sm ${color}`}></div>
                  </div>
                ))}
              </div>
              <p className="text-[7px] text-white/30 font-manrope">Real-time 10m wind speed overlay</p>
            </div>
          )}

        </div>
      )}


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

      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 z-[2000] gap-4">
           <div className="absolute inset-0 bg-gradient-to-br from-[#228B22]/10 to-transparent"></div>
           <div className="w-12 h-12 border-4 border-[#228B22] border-t-transparent rounded-full animate-spin"></div>
           <p className="text-stone-300 font-manrope font-black uppercase tracking-[0.2em] text-[10px]">Syncing GIS Assets...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/90 backdrop-blur-md text-red-200 z-[2000] p-6 text-center">
          <div className="flex flex-col items-center gap-4 max-w-xs">
            <div className="bg-red-500/20 p-4 rounded-full">
              <X className="h-8 w-8 text-red-500" />
            </div>
            <p className="font-manrope font-black uppercase tracking-widest text-xs">GIS Engine Offline</p>
            <p className="text-xs text-red-300/60 leading-relaxed">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-6 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {isLayerMenuOpen && (
        <div className="absolute inset-0 z-[999]" onClick={() => setIsLayerMenuOpen(false)} />
      )}
    </div>
  );
}
