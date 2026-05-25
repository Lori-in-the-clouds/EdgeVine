import { useState, useEffect } from 'react';
import { DashboardMap } from '../map/DashboardMap';
import { Layers, Radio, ThermometerSun, Droplets, Grid3X3 } from 'lucide-react';

export function DashboardContainer() {
  const [stats, setStats] = useState({ area: '---', count: 0, lat: 43.4633, lng: 11.3126 });
  const [weather, setWeather] = useState<{ temp: number | null, hum: number | null }>({ temp: null, hum: null });
  const [sectorCount, setSectorCount] = useState(0);
  const [region, setRegion] = useState('');
  const [activeLayer, setActiveLayer] = useState<'none' | 'precipitation' | 'temperature' | 'wind'>('none');

  useEffect(() => {
    // Fetch sector count for the overlay
    const fetchSectorCount = async () => {
      try {
        const res = await fetch('/api/vineyard/config');
        const data = await res.json();
        if (data.success && data.data) {
          const sectors = Array.isArray(data.data.sectors) ? data.data.sectors : [];
          setSectorCount(sectors.length);
          setRegion(data.data.region || '');
        } else {
          setSectorCount(0);
          setRegion('');
        }
      } catch (_) {
        setSectorCount(0);
        setRegion('');
      }
    };
    fetchSectorCount();
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${stats.lat}&longitude=${stats.lng}&current=temperature_2m,relative_humidity_2m&timezone=auto&_t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (data && data.current) {
          setWeather({ temp: data.current.temperature_2m, hum: data.current.relative_humidity_2m });
        }
      } catch (err) {
        console.error("Open-Meteo API Error:", err);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 300000);
    return () => clearInterval(interval);
  }, [stats.lat, stats.lng]);

  const isEmpty = stats.area === '---' && stats.count === 0 && sectorCount === 0;

  return (
    <div className="absolute inset-0 w-full h-full">
      {/* Floating Dashboard Title & Stats Overlay */}
      <div className="absolute top-8 left-8 z-[1000] pointer-events-none flex flex-col gap-4">
        <div className="bg-black/40 backdrop-blur-3xl p-5 rounded-[1.5rem] border border-white/10 shadow-2xl transition-all duration-500 w-[380px]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 bg-[#228B22] rounded-full animate-pulse"></div>
            <span className="text-[9px] font-black text-[#228B22] uppercase tracking-[0.2em]">
              {isEmpty ? 'Awaiting Configuration' : 'Live Monitoring'}
            </span>
          </div>
          <h2 className="text-2xl font-manrope font-black text-white tracking-tight drop-shadow-lg leading-tight">
            Sentinel <span className="text-[#228B22]/90">Vineyard</span>
          </h2>
          <p className="text-white/40 font-manrope text-[8px] uppercase font-black tracking-[0.4em] mt-1 opacity-80">
            {region ? `Satellite Telemetry • ${region}` : 'Satellite Telemetry'}
          </p>

          <div className="h-px bg-white/5 my-4"></div>

          {isEmpty ? (
            <div className="text-center py-4">
              <p className="text-stone-500 text-[10px] font-black uppercase tracking-widest">
                No vineyard configured yet
              </p>
              <p className="text-stone-600 text-[9px] mt-1">
                Use the <span className="text-[#228B22]">Edit Vineyard</span> button to begin
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                  <Layers className="h-3.5 w-3.5 text-stone-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest whitespace-nowrap">Area</span>
                  <span className="text-sm font-black text-white tracking-tighter whitespace-nowrap">{stats.area}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                  <Radio className="h-3.5 w-3.5 text-[#228B22]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest whitespace-nowrap">Sentinels</span>
                  <span className="text-sm font-black text-white tracking-tighter whitespace-nowrap">{stats.count}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                  <Grid3X3 className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest whitespace-nowrap">Sectors</span>
                  <span className="text-sm font-black text-white tracking-tighter whitespace-nowrap">{sectorCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Weather Widget - Hidden when any radar layer is active */}
      {activeLayer === 'none' && (
        <div className="absolute bottom-8 left-8 z-[1000] pointer-events-none flex gap-4 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-black/80 backdrop-blur-3xl p-5 rounded-[2rem] border border-white/10 shadow-2xl flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20">
                 <ThermometerSun className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Temperature</span>
                <span className="text-xl font-black text-white tracking-tighter">{!isEmpty && weather.temp !== null ? `${weather.temp}°C` : '--'}</span>
              </div>
            </div>
            <div className="h-10 w-px bg-white/5 mx-2"></div>
            <div className="flex items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-2xl border border-blue-500/20">
                 <Droplets className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Local Humidity</span>
                <span className="text-xl font-black text-white tracking-tighter">{!isEmpty && weather.hum !== null ? `${weather.hum}%` : '--'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Implementation */}
      <DashboardMap 
        activeLayer={activeLayer}
        setActiveLayer={setActiveLayer}
        onStatsUpdate={(area, count, lat, lng) => setStats({ area, count, lat, lng })} 
      />
    </div>

  );
}
