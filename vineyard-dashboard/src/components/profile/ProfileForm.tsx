import { useState, useRef, useEffect } from 'react';
import { Camera, Save, CheckCircle, MapPin, Navigation, Globe, Layers, Maximize } from 'lucide-react';

export function ProfileForm() {
  const [name, setName] = useState('Lorenzo');
  const [vineyardName, setVineyardName] = useState('Vineyard Estate');
  const [email, setEmail] = useState('lorenzo@edgevine.io');
  const [phone, setPhone] = useState('+39 333 1234567');
  const [photo, setPhoto] = useState('/images/john-doe.png');
  const [showToast, setShowToast] = useState(false);
  
  const [vineyardInfo, setVineyardInfo] = useState({
    province: '',
    region: '',
    address: '',
    centroid: '',
    totalRows: 0,
    totalMeters: 0,
    sectorCount: 0,
    sectorNames: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('edgevine_profile');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.photo) setPhoto(data.photo);
      } catch (e) {}
    }

    const fetchVineyardInfo = async () => {
      try {
        const res = await fetch('/api/vineyard/config');
        const data = await res.json();
        if (data.success && data.data) {
          const v = data.data;
          setVineyardInfo({
            province: v.province || 'Province N/A',
            region: v.region || 'Region Not Set',
            address: v.address || 'Address Not Registered',
            centroid: v.latitude ? `${Number(v.latitude).toFixed(4)}, ${Number(v.longitude).toFixed(4)}` : 'No Data',
            totalRows: v.total_rows_count || 0,
            totalMeters: v.total_row_meters || 0,
            sectorCount: v.sectors_count || 0,
            sectorNames: v.sector_names || ''
          });
          if (v.name_vineyard) setVineyardName(v.name_vineyard);
          if (v.owner) setName(v.owner);
          if (v.email) setEmail(v.email);
        }
      } catch (e) {
        console.error("Error fetching profile info:", e);
      }
    };
    fetchVineyardInfo();
  }, []);

  const handleSave = async () => {
    try {
      localStorage.setItem('edgevine_profile', JSON.stringify({ name, email, phone, photo }));
      await fetch('/api/vineyard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_vineyard: vineyardName,
          owner: name,
          email: email,
          province: vineyardInfo.province,
          region: vineyardInfo.region,
          address: vineyardInfo.address
        })
      });
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { name, photo } }));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      alert("Failed to save profile on database.");
    }
  };

  return (
    <>
      {showToast && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] bg-[#1B4332] border-2 border-[#228B22] text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in duration-500">
          <CheckCircle className="h-5 w-5 text-[#228B22]" />
          <span className="font-black uppercase tracking-widest text-xs">Profile saved successfully!</span>
        </div>
      )}

      <div className="flex flex-col gap-10 max-w-6xl mx-auto pb-20">
        
        {/* CARD 1: ACCOUNT SETTINGS */}
        <div className="bg-white border border-stone-100 rounded-[3.5rem] shadow-2xl p-10 lg:p-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-4 flex flex-col items-center">
              <label className="w-full text-[10px] font-black text-stone-300 uppercase tracking-[0.25em] mb-6 text-center">Profile Picture</label>
              <div className="relative">
                <div className="w-64 h-64 rounded-[3.5rem] overflow-hidden border-8 border-stone-50 shadow-xl">
                  <img src={photo} className="w-full h-full object-cover" />
                </div>
                <div onClick={() => fileInputRef.current?.click()} className="absolute -bottom-3 -right-3 w-14 h-14 bg-[#228B22] border-4 border-white rounded-[1.2rem] flex items-center justify-center text-white shadow-xl cursor-pointer hover:bg-[#1B4332] transition-all">
                  <Camera size={22} />
                </div>
                <input type="file" ref={fileInputRef} onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const r = new FileReader(); r.onload = ev => setPhoto(ev.target?.result as string); r.readAsDataURL(file);
                  }
                }} accept="image/*" className="hidden" />
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-300 uppercase tracking-[0.15em] ml-1">Owner Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-4 text-stone-800 font-bold outline-none text-sm transition-all shadow-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-300 uppercase tracking-[0.15em] ml-1">Phone Number</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-4 text-stone-800 font-bold outline-none text-sm transition-all shadow-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-300 uppercase tracking-[0.15em] ml-1">Email Address</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-4 text-stone-800 font-bold outline-none text-sm transition-all shadow-sm" />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-black text-stone-300 uppercase tracking-[0.15em] ml-1 flex items-center gap-2">
                  <Globe className="w-3 h-3 text-stone-300" />
                  Vineyard Designation
                </label>
                <input 
                  value={vineyardName} 
                  onChange={e => setVineyardName(e.target.value)} 
                  placeholder="e.g. Chianti Estate..."
                  className="w-full bg-stone-50 border-none rounded-2xl px-6 py-4 text-stone-800 font-bold outline-none text-sm transition-all shadow-sm" 
                />
              </div>

              <button onClick={handleSave} className="w-full bg-[#228B22] text-white font-black py-5 rounded-2xl shadow-xl hover:bg-[#1B4332] transition-all flex items-center justify-center gap-3 uppercase text-[11px] tracking-widest mt-4">
                <Save size={18} /> Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: ESTATE DETAILS GRID */}
        <div className="bg-stone-900 rounded-[3.5rem] p-8 lg:p-12 border border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#228B22]/10 rounded-full blur-[120px] -mr-40 -mt-40 opacity-40"></div>
          <div className="relative z-10 space-y-8">
            
            <div className="flex items-center gap-4 text-stone-300">
               <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-[#228B22] border border-white/5 shadow-inner">
                  <MapPin size={20} />
               </div>
               <div className="flex flex-col">
                  <h3 className="text-xl font-manrope font-black text-white tracking-tight leading-none">{vineyardName || 'Vineyard Estate'} Details</h3>
                  <p className="text-[9px] font-black text-stone-600 uppercase tracking-[0.1em] mt-1">Satellite Mapping & Active GIS Metrics</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
               
               {/* Location Box */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="text-[9px] font-black text-[#228B22] uppercase tracking-[0.2em]">Province & Region</div>
                  <input value={vineyardInfo.province} onChange={e => setVineyardInfo({...vineyardInfo, province: e.target.value})} className="bg-transparent border-none text-white font-manrope font-black text-xl p-0 w-full focus:ring-0 outline-none" />
                  <input value={vineyardInfo.region} onChange={e => setVineyardInfo({...vineyardInfo, region: e.target.value})} className="bg-transparent border-none text-[#228B22] text-[10px] font-black uppercase p-0 w-full focus:ring-0 outline-none" />
               </div>

               {/* GPS Box (Fixed Color) */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="text-[9px] font-black text-[#228B22] uppercase tracking-[0.2em]">Centroid Geodata</div>
                  <div className="text-white font-mono font-bold text-xl pt-1">{vineyardInfo.centroid}</div>
               </div>

               {/* Address Box */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="text-[9px] font-black text-[#228B22] uppercase tracking-[0.2em]">Registered Address</div>
                  <textarea value={vineyardInfo.address} onChange={e => setVineyardInfo({...vineyardInfo, address: e.target.value})} className="bg-transparent border-none text-white font-manrope font-black text-md p-0 w-full focus:ring-0 outline-none resize-none h-12 leading-tight" />
               </div>

               {/* Sectors Box */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-2 text-[#228B22]">
                    <Layers size={16} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Total Sectors</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{vineyardInfo.sectorCount}</span>
                    <span className="text-[9px] font-bold text-stone-600 uppercase">Areas</span>
                  </div>
                  <p className="text-[9px] font-bold text-stone-700 truncate">{vineyardInfo.sectorNames || 'No sectors'}</p>
               </div>

               {/* Units Box */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-2 text-[#228B22]">
                    <Navigation size={16} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Inventory Units</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{vineyardInfo.totalRows}</span>
                    <span className="text-[9px] font-bold text-stone-600 uppercase">Rows</span>
                  </div>
               </div>

               {/* Length Box */}
               <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-2 text-[#228B22]">
                    <Maximize size={16} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Total Asset Length</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white">{vineyardInfo.totalMeters.toLocaleString()}</span>
                    <span className="text-[9px] font-bold text-stone-600 uppercase">Meters</span>
                  </div>
               </div>

            </div>

          </div>
        </div>
      </div>
    </>
  );
}
