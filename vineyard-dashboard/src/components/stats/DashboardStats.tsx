import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Camera, Filter, Wine, Thermometer, 
  Droplets, Sprout, Map as MapIcon, Plus
} from 'lucide-react';

export function DashboardStats() {
  const [history, setHistory] = useState<any[]>([]);
  const [latestStats, setLatestStats] = useState<any>(null);
  const [imageLimit, setImageLimit] = useState(5);
  const [recentImages, setRecentImages] = useState<any[]>([]);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // 1. Check Configuration
    const checkConfig = async () => {
      try {
        const res = await fetch('/api/vineyard/config');
        const data = await res.json();
        if (data.success && data.data && data.data.sectors && data.data.sectors.length > 0) {
          setIsConfigured(true);
          // Only fetch other data if configured
          startDashboardTasks();
        } else {
          setIsConfigured(false);
          setIsLoading(false);
        }
      } catch (e) {
        setIsConfigured(false);
        setIsLoading(false);
      }
    };

    const startDashboardTasks = () => {
      // Fetch History
      fetch('/api/sensors/history')
        .then(r => r.json())
        .then(d => {
          if (d.success) setHistory(d.data);
        });
        
      // Fetch Current Data
      fetch('/api/sensors')
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setLatestStats({
              safe: 78,
              stress: 15,
              disease: 7,
              totalWine: 1450,
              confidence: 82,
              leavesAnalyzed: 12450,
              observations: 240
            });
          }
        });

      // Mock images
      const sensors = ["Sentinel-A1", "Sentinel-A2", "Sentinel-B1", "Sentinel-B2", "Sentinel-C1"];
      const mockImages = Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        sensorName: sensors[Math.floor(Math.random() * sensors.length)],
        date: new Date(Date.now() - i * 3600000 * 4).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        time: new Date(Date.now() - i * 3600000 * 4).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        url: `https://loremflickr.com/400/300/vineyard,grapes?lock=${i + 50}`
      }));
      setRecentImages(mockImages);
      setIsLoading(false);
    };

    checkConfig();
  }, []);

  const canopyData = latestStats ? [
    { name: 'Safe', value: latestStats.safe, color: '#006c0c' },
    { name: 'Stress', value: latestStats.stress, color: '#fbbf24' },
    { name: 'Disease', value: latestStats.disease, color: '#ba1a1a' },
  ] : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-[#228B22] border-transparent"></div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-center animate-in fade-in duration-700">
        <div className="max-w-md bg-white border border-stone-200 p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center">
          <div className="w-20 h-20 bg-[#228B22]/10 rounded-3xl flex items-center justify-center text-[#228B22] mb-8 border border-[#228B22]/20 shadow-inner">
            <MapIcon size={40} />
          </div>
          <h2 className="text-3xl font-manrope font-black text-stone-800 tracking-tight mb-4">Vineyard Not Configured</h2>
          <p className="text-stone-500 text-sm font-medium leading-relaxed mb-10">
            Detailed statistics and predictive analytics require an active vineyard map. Please define your land boundaries in the configuration dashboard to unlock these insights.
          </p>
          <a href="/edit" className="inline-flex items-center gap-3 bg-[#228B22] hover:bg-[#2EB82E] text-white px-8 py-4 rounded-2xl font-manrope font-black text-xs uppercase tracking-widest transition-all">
            Go to Configuration <Plus size={16} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-700">
      {/* SECTION 1: AI DIAGNOSTICS & YIELD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h2 className="text-2xl font-manrope font-black text-on-surface">Canopy Health Diagnostics (AI Vision)</h2>
              <p className="text-stone-400 font-inter text-sm">Scanning for stress and pathogen markers</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 py-8">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={canopyData} innerRadius={75} outerRadius={95} paddingAngle={2} dataKey="value" stroke="none" startAngle={90} endAngle={450}>
                    {canopyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-5xl font-manrope font-black text-stone-800">{latestStats?.safe || '--'}%</span>
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">Stable</span>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {canopyData.map((item) => (
                <div key={item.name} className="flex items-center gap-4">
                  <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: item.color }} />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{item.name === 'Safe' ? 'Green (Safe)' : item.name === 'Stress' ? 'Yellow (Stress)' : 'Red (Disease)'}</span>
                    <span className="text-2xl font-manrope font-bold text-stone-800">{item.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-[#228B22] rounded-[2.5rem] p-8 shadow-2xl shadow-green-900/20 text-white flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]"></div>
          <div className="relative z-10 flex justify-between items-start mb-6">
            <div><h2 className="text-2xl font-manrope font-black">Wine Yield Estimation</h2></div>
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><Wine className="h-6 w-6 text-white" /></div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center">
            <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-3">Projected Volumetric Output</p>
            <div className="flex items-baseline gap-2">
              <span className="text-8xl font-manrope font-black tracking-tighter leading-none">{latestStats?.totalWine.toLocaleString() || '--'}</span>
              <span className="text-4xl font-manrope font-bold opacity-70">L</span>
            </div>
          </div>
          <Wine className="absolute -bottom-8 -right-8 w-64 h-64 text-white/5 -rotate-12 pointer-events-none" />
        </div>
      </div>

      {/* SECTION 2: TELEMETRY KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
          <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Thermometer className="h-8 w-8" /></div>
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Temperature</p>
            <span className="text-4xl font-manrope font-black text-stone-800">24°C</span>
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
          <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Droplets className="h-8 w-8" /></div>
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Air Humidity</p>
            <span className="text-4xl font-manrope font-black text-stone-800">58%</span>
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
          <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Sprout className="h-8 w-8" /></div>
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Soil Moisture</p>
            <span className="text-4xl font-manrope font-black text-stone-800">34.2%</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: TELEMETRY HISTORY */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-manrope font-black text-on-surface">Telemetry History</h2>
            <p className="text-stone-400 font-inter text-sm">Long-term environmental trends analysis</p>
          </div>
        </div>
        <div className="h-[350px] w-full">
           <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#596372', fontSize: 10, fontWeight: 700}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#596372', fontSize: 10, fontWeight: 700}} dx={-15} />
                <RechartsTooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '20px' }} />
                <Line type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#ef4444" strokeWidth={4} dot={false} animationDuration={2000} />
                <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#228B22" strokeWidth={4} dot={false} animationDuration={2500} />
                <Line type="monotone" dataKey="moisture" name="Moisture" stroke="#3b82f6" strokeWidth={4} dot={false} animationDuration={3000} />
              </LineChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 4: RECENT CAPTURES */}
      <div className="mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-manrope font-black text-on-surface flex items-center gap-3">
              <Camera className="h-8 w-8 text-[#228B22]" />
              Recent Captures
            </h2>
            <p className="text-stone-400 font-inter text-sm mt-1">Latest high-resolution visual data from individual sentinel units.</p>
          </div>
          <div className="flex items-center gap-3 bg-stone-100 rounded-3xl p-1.5 shadow-inner">
            <div className="flex items-center px-4 gap-2"><Filter className="h-3.5 w-3.5 text-stone-400" /><span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Show</span></div>
            <div className="flex gap-1">
              {[5, 10, 15, 20].map(num => (
                <button key={num} onClick={() => setImageLimit(num)} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black transition-all duration-300 ${imageLimit === num ? 'bg-white text-[#228B22] shadow-xl scale-105' : 'text-stone-500 hover:text-stone-800'}`}>{num}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {recentImages.slice(0, imageLimit).map((img) => (
            <div key={img.id} className="group flex flex-col bg-white rounded-[2rem] overflow-hidden border border-stone-100 shadow-sm hover:shadow-2xl transition-all duration-700 hover:-translate-y-2">
              <div className="relative aspect-[4/5] overflow-hidden">
                <img src={img.url} alt={img.sensorName} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                <div className="absolute top-4 left-4 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/20"><p className="text-[9px] font-black text-white uppercase tracking-[0.2em]">{img.sensorName}</p></div>
              </div>
              <div className="p-6 bg-white"><div className="flex items-center justify-between"><p className="text-xs font-black text-on-surface font-manrope uppercase tracking-tight">{img.date}</p><p className="text-[10px] font-bold text-stone-400 font-inter">{img.time}</p></div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
