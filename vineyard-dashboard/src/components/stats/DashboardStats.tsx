import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  Camera, Filter, Wine, Thermometer,
  Droplets, Sprout, Map as MapIcon, Plus, CheckCircle, AlertTriangle, Cpu
} from 'lucide-react';

const activeBoundCache: { [cx: number]: { lower?: number; upper?: number } } = {};

function ActiveBoundDot(props: any) {
  const { cx, cy, stroke, type } = props;
  if (!cx || !cy) return null;

  // Cache the Y coordinate for this X point
  if (!activeBoundCache[cx]) {
    activeBoundCache[cx] = {};
  }
  if (type === 'lower') {
    activeBoundCache[cx].lower = cy;
  } else {
    activeBoundCache[cx].upper = cy;
  }

  return (
    <line
      x1={cx - 12}
      y1={cy}
      x2={cx + 12}
      y2={cy}
      stroke={stroke}
      strokeWidth={2.5}
    />
  );
}

function ActiveExpectedDot(props: any) {
  const { cx, cy, stroke } = props;
  if (!cx || !cy) return null;

  const cached = activeBoundCache[cx];
  const cyLower = cached?.lower !== undefined ? cached.lower : cy + 20;
  const cyUpper = cached?.upper !== undefined ? cached.upper : cy - 20;

  return (
    <g>
      {/* Vertical line connecting the two bounds */}
      <line
        x1={cx}
        y1={cyLower}
        x2={cx}
        y2={cyUpper}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Solid circle dot for the Expected value */}
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill={stroke}
        stroke="#fff"
        strokeWidth={1.2}
      />
    </g>
  );
}

export function DashboardStats() {
  const [history, setHistory] = useState<any[]>([]);
  const [latestStats, setLatestStats] = useState<any>(null);
  const [imageLimit, setImageLimit] = useState(4);
  const [recentImages, setRecentImages] = useState<any[]>([]);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const [timeRange, setTimeRange] = useState('24h');
  const [predictions, setPredictions] = useState<any>(null);
  const [isPredicting, setIsPredicting] = useState(true);

  // 1. Fetch Predictions
  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await fetch('/api/predictions');
        const data = await res.json();
        if (data.success && data.data) {
          setPredictions(data.data);
        }
      } catch (e) {
        console.error("Failed to fetch predictions", e);
      } finally {
        setIsPredicting(false);
      }
    };
    fetchPredictions();
  }, []);

  useEffect(() => {
    // 1. Check Configuration and then Fetch Stats
    const fetchData = async () => {
      try {
        const configRes = await fetch('/api/vineyard/config');
        const configData = await configRes.json();

        if (configData.success && configData.data) {
          const rawSectors = configData.data.sectors;
          const parsedSectors = typeof rawSectors === 'string' ? JSON.parse(rawSectors) : rawSectors;
          if (parsedSectors && Array.isArray(parsedSectors) && parsedSectors.length > 0) {
            setIsConfigured(true);

          // Fetch Real Stats from our new Engine with dynamic range
          const statsRes = await fetch(`/api/vineyard/stats?range=${timeRange}`);
          const statsData = await statsRes.json();

          if (statsData.success) {
            const d = statsData.data;
            const leafTotal = d.health.healthy + d.health.stress + d.health.disease || 1;
            setHistory(d.chartData);
            setRecentImages(d.recentCaptures || []);
            setLatestStats({
              safe: Math.round((d.health.healthy / leafTotal) * 100),
              stress: Math.round((d.health.stress / leafTotal) * 100),
              disease: Math.round((d.health.disease / leafTotal) * 100),
              totalWine: d.production.estimated_liters,
              totalWineMin: d.production.estimated_liters_min,
              totalWineMax: d.production.estimated_liters_max,
              confidence: d.production.confidence,
              leavesAnalyzed: d.production.leaves_analyzed,
              temp: d.global.temp,
              hum: d.global.hum,
              moist: d.global.moist
            });
          }
          } else {
            setIsConfigured(false);
          }
        } else {
          setIsConfigured(false);
        }
      } catch (e) {
        setIsConfigured(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  // Removed mock images logic

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
    <div className="flex flex-col gap-10 pb-12 animate-in fade-in duration-700">

      {/* ========================================================= */}
      {/* PART 1: REAL-TIME & HISTORICAL DATA                         */}
      {/* ========================================================= */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="h-10 w-3 bg-[#228B22] rounded-full"></div>
          <div>
            <h2 className="text-3xl font-manrope font-black text-stone-800">Real-Time & Historical Data</h2>
            <p className="text-stone-500 font-medium">Current vineyard status, telemetry, and live camera feeds</p>
          </div>
        </div>

        {/* SECTION 1.1: TELEMETRY KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
            <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Thermometer className="h-8 w-8" /></div>
            <div className="flex flex-col">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Temperature</p>
              <span className="text-4xl font-manrope font-black text-stone-800">{latestStats?.temp || '--'}°C</span>
            </div>
          </div>
          <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
            <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Droplets className="h-8 w-8" /></div>
            <div className="flex flex-col">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Air Humidity</p>
              <span className="text-4xl font-manrope font-black text-stone-800">{latestStats?.hum || '--'}%</span>
            </div>
          </div>
          <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex items-center gap-6">
            <div className="w-16 h-16 bg-[#228B22]/10 rounded-full flex items-center justify-center text-[#228B22]"><Sprout className="h-8 w-8" /></div>
            <div className="flex flex-col">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1">Soil Moisture</p>
              <span className="text-4xl font-manrope font-black text-stone-800">{latestStats?.moist || '--'}%</span>
            </div>
          </div>
        </div>

        {/* SECTION 1.2: TELEMETRY HISTORY */}
        <div className="bg-emerald-50/40 rounded-[2.5rem] p-8 shadow-ambient border border-emerald-100/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <h2 className="text-2xl font-manrope font-black text-on-surface">Telemetry History</h2>
              <p className="text-stone-400 font-inter text-sm">Long-term environmental trends analysis</p>
            </div>
            <div className="flex items-center gap-2 bg-stone-100 rounded-2xl p-1">
              {[
                { id: '24h', label: '24h' },
                { id: '7d', label: '7d' },
                { id: '30d', label: '30d' },
                { id: '90d', label: '3m' },
                { id: '1y', label: '1y' }
              ].map((range) => (
                <button
                  key={range.id}
                  onClick={() => setTimeRange(range.id)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${timeRange === range.id
                    ? 'bg-white text-[#228B22] shadow-sm scale-105'
                    : 'text-stone-400 hover:text-stone-600'
                    }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.5} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#596372', fontSize: 10, fontWeight: 700 }} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#596372', fontSize: 10, fontWeight: 700 }} dx={-15} />
                <RechartsTooltip formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value} contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '20px' }} />
                <Line type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#ef4444" strokeWidth={4} dot={false} animationDuration={2000} />
                <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#228B22" strokeWidth={4} dot={false} animationDuration={2500} />
                <Line type="monotone" dataKey="moisture" name="Moisture" stroke="#3b82f6" strokeWidth={4} dot={false} animationDuration={3000} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>


      </div>

      {/* ========================================================= */}
      {/* PART 2: PREDICTIVE ANALYTICS                                */}
      {/* ========================================================= */}
      <div className="flex flex-col gap-6 border-t border-stone-200 pt-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="h-10 w-3 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/20"></div>
          <div>
            <h2 className="text-3xl font-manrope font-black text-stone-800">Predictive Analytics & Forecasting</h2>
          </div>
        </div>



        {/* SECTION 2.2: PROPHET PREDICTIONS */}
        {!isPredicting && predictions && (
          <div className="bg-indigo-50 rounded-[2.5rem] p-8 shadow-ambient border border-indigo-100 flex flex-col">
            <div className="flex flex-col mb-10">
              <h2 className="text-2xl font-manrope font-black text-on-surface flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl"><CheckCircle className="h-6 w-6 text-indigo-500" /></div>
                Environmental Time-Series Forecast
              </h2>
              <p className="text-stone-400 font-inter text-sm mt-1">Prediction models actively monitoring frost and water stress risks. Updates every 4 hours.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* TEMPERATURE PREDICTION */}
              <div className="bg-indigo-100 rounded-[2.5rem] p-8 shadow-sm border border-indigo-200/50 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-manrope font-black text-lg text-stone-800 tracking-tight uppercase text-[11px] opacity-70">Temperature Forecast (48h)</h3>
                </div>

                {predictions.temperature.alerts.status === 'ALARM' ? (
                  <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-start gap-4">
                    <AlertTriangle className="text-rose-500 mt-0.5 flex-shrink-0" size={24} />
                    <div>
                      <p className="font-bold text-rose-700">FROST WARNING: {predictions.temperature.alerts.min_value}°C</p>
                      <p className="text-rose-600 text-[11px] mt-1 leading-relaxed">Expected drop below safe threshold starting at <span className="font-bold">{new Date(predictions.temperature.alerts.danger_start_time).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</span>.</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center gap-4">
                    <CheckCircle className="text-emerald-500 flex-shrink-0" size={24} />
                    <div>
                      <p className="font-bold text-emerald-700">No Frost Risk Detected</p>
                      <p className="text-emerald-600 text-[11px] mt-1">Temperature is expected to remain in safe ranges for the next 48 hours.</p>
                    </div>
                  </div>
                )}

                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={predictions.temperature.forecast}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.5} />
                      <XAxis dataKey="ds" axisLine={false} tickLine={false} tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: '#596372', fontSize: 10, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#596372', fontSize: 10, fontWeight: 600 }} dx={-10} domain={['auto', 'auto']} />
                      <RechartsTooltip formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value} labelFormatter={(val) => new Date(val).toLocaleString()} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '12px' }} />
                      <Line type="monotone" dataKey="yhat_lower" name="Min Bounds" stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} activeDot={<ActiveBoundDot type="lower" />} opacity={0.5} />
                      <Line type="monotone" dataKey="yhat_upper" name="Max Bounds" stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} activeDot={<ActiveBoundDot type="upper" />} opacity={0.5} />
                      <Line type="monotone" dataKey="yhat" name="Expected (°C)" stroke="#ef4444" strokeWidth={4} dot={false} activeDot={<ActiveExpectedDot />} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* MOISTURE PREDICTION */}
              <div className="bg-indigo-100 rounded-[2.5rem] p-8 shadow-sm border border-indigo-200/50 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-manrope font-black text-lg text-stone-800 tracking-tight uppercase text-[11px] opacity-70">Soil Moisture Forecast (72h)</h3>
                </div>

                {predictions.moisture.alerts.status === 'ALARM' ? (
                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex items-start gap-4">
                    <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={24} />
                    <div>
                      <p className="font-bold text-amber-800">WATER STRESS RISK: {predictions.moisture.alerts.min_value?.toFixed(2)}%</p>
                      <p className="text-amber-700 text-[11px] mt-1 leading-relaxed">Expected drop below minimum threshold starting at <span className="font-bold">{new Date(predictions.moisture.alerts.danger_start_time).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</span>.</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center gap-4">
                    <CheckCircle className="text-emerald-500 flex-shrink-0" size={24} />
                    <div>
                      <p className="font-bold text-emerald-700">Moisture Levels Stable</p>
                      <p className="text-emerald-600 text-[11px] mt-1">No severe water stress predicted for the next 72 hours.</p>
                    </div>
                  </div>
                )}

                <div className="h-[280px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={predictions.moisture.forecast}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.5} />
                      <XAxis dataKey="ds" axisLine={false} tickLine={false} tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: '#596372', fontSize: 10, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#596372', fontSize: 10, fontWeight: 600 }} dx={-10} domain={['auto', 'auto']} />
                      <RechartsTooltip formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value} labelFormatter={(val) => new Date(val).toLocaleString()} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '12px' }} />
                      <Line type="monotone" dataKey="yhat_lower" name="Min Bounds" stroke="#3b82f6" strokeWidth={1} strokeDasharray="5 5" dot={false} activeDot={<ActiveBoundDot type="lower" />} opacity={0.5} />
                      <Line type="monotone" dataKey="yhat_upper" name="Max Bounds" stroke="#3b82f6" strokeWidth={1} strokeDasharray="5 5" dot={false} activeDot={<ActiveBoundDot type="upper" />} opacity={0.5} />
                      <Line type="monotone" dataKey="yhat" name="Expected (%)" stroke="#3b82f6" strokeWidth={4} dot={false} activeDot={<ActiveExpectedDot />} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2.3: WINE YIELD & CANOPY HEALTH */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* YIELD ESTIMATION */}
          <div className="bg-[#228B22] rounded-[2.5rem] p-8 shadow-2xl shadow-green-900/20 text-white flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]"></div>
            <div className="relative z-10 flex justify-between items-start mb-6">
              <div><h2 className="text-3xl font-manrope font-black">Wine Yield Estimation</h2></div>
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><Wine className="h-6 w-6 text-white" /></div>
            </div>
            <div className="relative z-10 flex-1 flex flex-col justify-center">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-3">Projected Volumetric Output</p>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-manrope font-black tracking-tighter leading-none">{latestStats?.totalWine?.toLocaleString() || '--'}</span>
                <span className="text-3xl font-manrope font-bold opacity-70">L</span>
                {latestStats?.totalWineMax && latestStats?.totalWineMax > latestStats?.totalWine && (
                  <span className="text-2xl font-manrope font-bold opacity-50 ml-3">± {Math.round(latestStats.totalWineMax - latestStats.totalWine).toLocaleString()} L</span>
                )}
              </div>
            </div>
            <Wine className="absolute -bottom-8 -right-8 w-64 h-64 text-white/5 -rotate-12 pointer-events-none" />
          </div>

          {/* Canopy Health Pie Chart (Final Layout) */}
          <div className="bg-amber-50/30 rounded-[2.5rem] p-10 shadow-ambient border border-amber-100/50 flex flex-col relative overflow-hidden">
            <div className="mb-12">
              <h3 className="font-manrope font-black text-stone-800 text-3xl tracking-tighter">Canopy Health Analytics</h3>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-12 flex-1">
              <div className="relative w-48 h-48 lg:w-52 lg:h-52 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={canopyData}
                      innerRadius={0}
                      outerRadius="100%"
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                      strokeWidth={0}
                      startAngle={90}
                      endAngle={450}
                    >
                      {canopyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-0 w-full">
                {canopyData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between border-b border-stone-200/30 pb-2">
                    <div className="flex items-center gap-4">
                      <div className="w-4 h-4 rounded-full shadow-lg" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-black text-stone-700 uppercase tracking-widest">{item.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-manrope font-black text-stone-800">{item.value}</span>
                      <span className="text-xs font-bold text-stone-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PART 3: AI VISION CAPTURES */}
      <div className="bg-stone-100/40 rounded-[2.5rem] p-8 shadow-ambient border border-stone-200 mt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h2 className="text-2xl font-manrope font-black text-on-surface flex items-center gap-3">
              <div className="p-2 bg-[#228B22]/10 rounded-xl"><Camera className="h-6 w-6 text-[#228B22]" /></div>
              AI Vision Captures
            </h2>
            <p className="text-stone-400 font-inter text-sm mt-1">Automated visual analysis from EdgeVine camera nodes.</p>
          </div>
          <div className="flex items-center gap-3 bg-stone-100 rounded-3xl p-1.5 shadow-inner">
            <div className="flex items-center px-4 gap-2"><Filter className="h-3.5 w-3.5 text-stone-400" /><span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Display</span></div>
            <div className="flex gap-1">
              {[4, 8, 12].map(num => (
                <button key={num} onClick={() => setImageLimit(num)} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black transition-all duration-300 ${imageLimit === num ? 'bg-white text-[#228B22] shadow-xl scale-105' : 'text-stone-500 hover:text-stone-800'}`}>{num}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {recentImages.slice(0, imageLimit).map((img) => (
            <VisionAnalyzedCard key={img.id} img={img} />
          ))}
        </div>
      </div>

    </div>
  );
}

function VisionAnalyzedCard({ img }: { img: any }) {
  const [showModal, setShowModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Only consider already-analyzed if we have a processed image URL (bounding boxes)
  const [result, setResult] = useState<any>(img.processed_image_url ? {
    grape_count: img.grape_count,
    health_prediction: img.health_status,
    liters_estimated: img.estimated_liters,
    processed_image_url: img.processed_image_url
  } : null);
  const [error, setError] = useState<string | null>(null);

  const startAnalysis = async () => {
    if (isAnalyzing || (result && result.processed_image_url)) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('imagePath', img.image_url);

      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);

        // Persist inference result to database
        try {
          await fetch('/api/vision/save-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recordId: img.id,
              grape_count: data.data.grape_count,
              health_status: data.data.health_prediction,
              estimated_liters: data.data.liters_estimated,
              processed_image_url: data.data.processed_image_url,
              leaf_healthy_count: data.data.leaf_healthy_count ?? 0,
              leaf_stress_count: data.data.leaf_stress_count ?? 0,
              leaf_disease_count: data.data.leaf_disease_count ?? 0
            })
          });
        } catch (saveErr) {
          console.warn("Failed to persist inference result:", saveErr);
        }
      } else {
        setError(data.details || data.error || "Analysis failed");
      }
    } catch (e: any) {
      setError(e.message);
      console.error("Analysis Error:", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-trigger inference on mount if not already analyzed
  useEffect(() => {
    if (!result && !isAnalyzing) {
      startAnalysis();
    }
  }, []);

  const processedImg = result?.processed_image_url ? `${result.processed_image_url}?t=${Date.now()}` : null;
  const healthStatus = result ? result.health_prediction : 'Pending';
  const grapeCount = result ? result.grape_count : '---';

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="group flex flex-col bg-white rounded-[2.5rem] overflow-hidden border border-stone-100 shadow-sm hover:shadow-2xl transition-all duration-700 hover:-translate-y-2 cursor-pointer"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-900 group">
          {img.grape_count === -1 ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-stone-900 text-stone-600 gap-3">
              <AlertTriangle size={32} className="opacity-20" />
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Scan Failed / Missing</span>
            </div>
          ) : (
            <img
              src={processedImg || img.image_url}
              alt={img.sensor_name}
              className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=800&q=80'; // Fallback statico elegante
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
          <div className="absolute top-4 left-4 px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
            <p className="text-[8px] font-black text-white uppercase tracking-widest">{img.sensor_name}</p>
          </div>
          {isAnalyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[1px]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-[#228B22]"></div>
            </div>
          )}
          <div className="absolute bottom-4 left-4">
            {isAnalyzing ? (
              <span className="flex items-center gap-2 text-[9px] font-black text-stone-300 bg-stone-950/80 backdrop-blur-md px-3 py-1.5 rounded-full uppercase tracking-widest shadow-xl border border-white/10">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-white/20 border-t-[#228B22] animate-spin"></span>
                Inference Running
              </span>
            ) : result && img.grape_count !== -1 ? (
              <span className="flex items-center gap-2 text-[9px] font-black text-[#228B22] bg-white/95 px-3 py-1.5 rounded-full uppercase tracking-widest shadow-xl border border-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#228B22]"></span>
                Inference Complete
              </span>
            ) : null}
          </div>
        </div>
        <div className="p-5 bg-white border-t border-stone-50 flex items-center justify-between">
          <p className="text-[9px] font-black text-stone-300 font-manrope uppercase tracking-[0.2em]">{img.date}</p>
        </div>
      </div>

      {/* IMMERSIVE AI ANALYTICS MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-2xl" onClick={() => setShowModal(false)}></div>

          <div className="relative w-full max-w-6xl aspect-video bg-[#0a0a0a] rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col md:flex-row shadow-2xl">
            {/* Image Section */}
            <div className="flex-1 relative bg-black group overflow-hidden">
              <img
                src={processedImg || img.image_url}
                className={`w-full h-full object-contain transition-all duration-1000 ${isAnalyzing ? 'scale-95 opacity-50 blur-sm' : 'scale-100'}`}
                alt="Enlarged analysis"
              />

              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  <div className="relative">
                    <div className="w-24 h-24 border-2 border-[#228B22]/20 rounded-full animate-[ping_2s_infinite]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu className="text-[#228B22] h-10 w-10 animate-pulse" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <h3 className="text-white font-manrope font-black text-xl tracking-[0.2em] uppercase">Neural Scan Active</h3>
                    <p className="text-stone-500 text-[10px] font-bold uppercase tracking-[0.4em] mt-2 animate-pulse">Running EdgeVine YOLOv8 Engine</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                  <AlertTriangle className="text-amber-500 h-16 w-16 mb-4" />
                  <h3 className="text-white font-black text-lg uppercase tracking-widest mb-2">Analysis Failed</h3>
                  <p className="text-stone-500 text-xs max-w-md leading-relaxed">{error}</p>
                  <button
                    onClick={startAnalysis}
                    className="mt-6 px-6 py-2 bg-stone-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-stone-700 transition-colors"
                  >
                    Retry Analysis
                  </button>
                </div>
              )}

              {result && !isAnalyzing && (
                <div className="absolute top-8 left-8 flex gap-3">
                  <div className="bg-[#228B22] text-white px-5 py-2 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2">
                    <CheckCircle size={14} /> Scan Complete
                  </div>
                </div>
              )}
            </div>

            {/* AI Control Panel */}
            <div className="w-full md:w-[400px] bg-[#111] p-10 flex flex-col border-l border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#228B22]/5 blur-[100px] pointer-events-none"></div>

              <button
                onClick={() => setShowModal(false)}
                className="absolute top-6 right-6 text-stone-500 hover:text-white transition-colors"
              >
                <Plus className="rotate-45 h-8 w-8" />
              </button>

              <div className="mb-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-[#228B22] rounded-full shadow-[0_0_10px_#228B22]"></div>
                  <span className="text-[10px] font-black text-[#228B22] uppercase tracking-[0.3em]">{img.sensor_name}</span>
                </div>
                <h2 className="text-3xl font-manrope font-black text-white leading-tight">AI Vision <br /><span className="text-[#228B22]">Analytics</span></h2>
                <p className="text-stone-500 text-xs mt-4 font-medium leading-relaxed">Advanced pixel-level inspection for yield estimation and pathogen detection.</p>
              </div>

              <div className="flex-1 flex flex-col gap-6">
                {/* Metric Box 1 */}
                <div className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Grapes Detected</span>
                    <span className="text-4xl font-manrope font-black text-white">{grapeCount}</span>
                  </div>
                  <div className="p-4 bg-[#228B22]/10 rounded-2xl text-[#228B22] group-hover:scale-110 transition-transform"><Wine size={24} /></div>
                </div>

                {/* Metric Box 2 */}
                <div className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">Canopy Status</span>
                    <span className={`text-4xl font-manrope font-black ${healthStatus === 'Healthy' ? 'text-[#228B22]' : result ? 'text-amber-500' : 'text-stone-700'}`}>
                      {healthStatus}
                    </span>
                  </div>
                  <div className={`p-4 rounded-2xl group-hover:scale-110 transition-transform ${healthStatus === 'Healthy' ? 'bg-[#228B22]/10 text-[#228B22]' : 'bg-amber-500/10 text-amber-500'}`}>
                    {healthStatus === 'Healthy' ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                <p className="text-[8px] font-bold text-stone-600 uppercase tracking-[0.4em]">Historical ID: {img.id}</p>
                <p className="text-stone-700 text-[10px] mt-2 font-inter">Capture Time: {img.date} • {img.time}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
