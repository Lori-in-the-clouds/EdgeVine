import React, { useState, useRef, useEffect } from 'react';
import { Camera, Save, CheckCircle, MapPin, Navigation, Globe } from 'lucide-react';

export function ProfileForm() {
  const [name, setName] = useState('John Doe');
  const [email, setEmail] = useState('john.doe@edgevine.io');
  const [phone, setPhone] = useState('+39 02 123 4567');
  const [photo, setPhoto] = useState('/images/john-doe.png');
  const [showToast, setShowToast] = useState(false);
  
  const [vineyardInfo, setVineyardInfo] = useState({
    province: 'Siena',
    address: 'Strada Provinciale del Chianti, 42',
    centroid: '43.4633, 11.3126'
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
        if (data.success && data.data && data.data.sectors && data.data.sectors.length > 0) {
          const v = data.data;
          let sumLat = 0, sumLng = 0, count = 0;
          v.sectors.forEach((s: any) => {
            if (s.perimeter && s.perimeter.coordinates) {
              const coords = s.perimeter.coordinates[0];
              coords.forEach((c: any) => {
                sumLat += c[1]; sumLng += c[0]; count++;
              });
            }
          });
          if (count > 0) {
            setVineyardInfo({
              province: 'Siena', // In future maybe from reverse geocode
              address: 'Strada Provinciale del Chianti, 42',
              centroid: `${(sumLat / count).toFixed(4)}, ${(sumLng / count).toFixed(4)}`
            });
          }
        } else {
          // Reset data if no sectors found
          setVineyardInfo({
            province: 'N/A',
            address: 'No Address Set',
            centroid: '--, --'
          });
        }
      } catch (e) {
        setVineyardInfo({
          province: 'N/A',
          address: 'Connection error',
          centroid: '--, --'
        });
      }
    };
    fetchVineyardInfo();
  }, []);

  const handleSave = () => {
    localStorage.setItem('edgevine_profile', JSON.stringify({ name, email, phone, photo }));
    window.dispatchEvent(new CustomEvent('profile-updated', { detail: { name, photo } }));
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <>
      {showToast && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] bg-[#1B4332] border-2 border-[#228B22] text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <CheckCircle className="h-5 w-5 text-[#228B22]" />
          <span className="font-black uppercase tracking-widest text-xs">Profile saved successfully!</span>
        </div>
      )}

      <div className="flex flex-col gap-10 max-w-6xl mx-auto">
        
        {/* CARD 1: USER ACCOUNT SETTINGS */}
        <div className="bg-white border border-stone-100 rounded-[3.5rem] shadow-2xl shadow-stone-200/40 p-10 lg:p-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-center">
            {/* Left: Avatar */}
            <div className="lg:col-span-4 flex flex-col items-center">
              <label className="w-full text-[10px] font-black text-stone-400 uppercase tracking-[0.25em] mb-6 text-center lg:text-left">Profile Picture</label>
              <div className="relative">
                <div className="w-72 h-72 rounded-[3.5rem] overflow-hidden border-8 border-stone-50 shadow-2xl transition-all duration-700 hover:rotate-1">
                  <img src={photo} className="w-full h-full object-cover shadow-inner" />
                </div>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-3 -right-3 w-16 h-16 bg-[#228B22] rounded-[1.5rem] flex items-center justify-center text-white shadow-[0_10px_30px_rgba(34,139,34,0.4)] border-[6px] border-white cursor-pointer hover:bg-[#1B4332] hover:scale-110 active:scale-95 transition-all group/cam"
                >
                  <Camera size={26} className="group-hover/cam:rotate-12 transition-transform" />
                </div>
                <input type="file" ref={fileInputRef} onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const r = new FileReader();
                    r.onload = ev => setPhoto(ev.target?.result as string);
                    r.readAsDataURL(file);
                  }
                }} accept="image/*" className="hidden" />
              </div>
            </div>

            {/* Right: Form */}
            <div className="lg:col-span-8 flex flex-col gap-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.25em] ml-1">Full Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-5 text-stone-800 font-bold focus:ring-4 focus:ring-[#228B22]/10 outline-none text-sm transition-all" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.25em] ml-1">Phone Number</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-5 text-stone-800 font-bold focus:ring-4 focus:ring-[#228B22]/10 outline-none text-sm transition-all" />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.25em] ml-1">Email Address</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-stone-50 border-none rounded-2xl px-6 py-5 text-stone-800 font-bold focus:ring-4 focus:ring-[#228B22]/10 outline-none text-sm transition-all" />
              </div>
              <button 
                onClick={handleSave}
                className="w-full bg-[#228B22] text-white font-black py-6 rounded-2xl shadow-xl shadow-green-900/10 hover:shadow-green-900/30 hover:bg-[#2EB82E] transition-all flex items-center justify-center gap-3 uppercase text-[12px] tracking-[0.2em]"
              >
                <Save size={20} /> Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: ESTATE LOCATION (DISTACHED) */}
        <div className="bg-stone-900 rounded-[3.5rem] p-12 border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#228B22]/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-[#228B22] border border-white/10">
                <MapPin size={24} />
              </div>
              <div className="flex flex-col">
                <h3 className="text-2xl font-manrope font-black text-white tracking-tight">Vineyard Estate Details</h3>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-1">Satellite Mapping & Active GIS Data</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 hover:bg-white/10 transition-all group/item">
                <div className="flex items-center gap-3 mb-4">
                  <Globe className="w-5 h-5 text-stone-500 group-hover/item:text-[#228B22] transition-colors" />
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.25em]">Province</span>
                </div>
                <p className="text-white font-manrope font-black text-xl leading-none">{vineyardInfo.province}</p>
                <div className="mt-3 text-[#228B22] text-[9px] font-black uppercase tracking-widest">Tuscany Region</div>
              </div>

              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 hover:bg-white/10 transition-all group/item">
                <div className="flex items-center gap-3 mb-4">
                  <Navigation className="w-5 h-5 text-stone-500 group-hover/item:text-[#228B22] transition-colors" />
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.25em]">Centroid Geodata</span>
                </div>
                <p className="text-white font-mono font-bold text-lg leading-none">{vineyardInfo.centroid}</p>
              </div>

              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 hover:bg-white/10 transition-all group/item">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin className="w-5 h-5 text-stone-500 group-hover/item:text-[#228B22] transition-colors" />
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.25em]">Registered via</span>
                </div>
                <p className="text-white font-manrope font-black text-lg leading-tight">{vineyardInfo.address}</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
