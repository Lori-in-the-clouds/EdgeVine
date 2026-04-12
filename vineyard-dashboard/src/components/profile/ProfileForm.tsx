import React, { useState, useRef } from 'react';
import { Camera, Save, CheckCircle } from 'lucide-react';

export function ProfileForm() {
  const [name, setName] = useState('John Doe');
  const [email, setEmail] = useState('john.doe@edgevine.io');
  const [phone, setPhone] = useState('+1 555 123 4567');
  const [photo, setPhoto] = useState('/images/john-doe.png');
  const [showToast, setShowToast] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persistence data on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('edgevine_profile');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.photo) setPhoto(data.photo);
      } catch (e) {
        console.error("Failed to load profile from storage", e);
      }
    }
  }, []);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhoto(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // Persist to localStorage
    const profileData = { name, email, phone, photo };
    localStorage.setItem('edgevine_profile', JSON.stringify(profileData));

    // Dipatch custom event for the Header ONLY ON SAVE
    const event = new CustomEvent('profile-updated', {
      detail: { name, photo }
    });
    window.dispatchEvent(event);

    // Show success toast
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  return (
    <>
      {showToast && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] bg-[#1B4332] border-2 border-[#228B22] text-white px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(34,139,34,0.3)] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <CheckCircle className="h-5 w-5 text-[#228B22]" />
          <span className="font-black uppercase tracking-widest text-xs">Profile saved successfully!</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20 relative max-w-5xl">
        {/* Profile Image Section - Left Aligned Side */}
        <div className="lg:col-span-5 flex flex-col items-start gap-4">
          <label className="block text-xs font-inter font-bold text-stone-500 uppercase tracking-wider pl-1 font-manrope">Profile Picture</label>
          <div className="relative group">
            <div className="w-64 h-64 rounded-3xl overflow-hidden border-8 border-white shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]">
              <img alt={name} className="w-full h-full object-cover" src={photo} />
            </div>
            
            <div 
              onClick={handlePhotoClick}
              className="absolute -bottom-4 -right-4 w-12 h-12 bg-[#228B22] rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-white cursor-pointer hover:scale-110 transition-transform"
            >
              <Camera className="w-5 h-5" />
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>

        {/* Form Section - Right Aligned Side (still in left-aligned container) */}
        <div className="lg:col-span-7 bg-white border border-stone-200 p-8 lg:p-10 rounded-[2.5rem] shadow-sm space-y-8 w-full">
          <div className="space-y-6">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="block text-xs font-inter font-bold text-on-surface-variant uppercase tracking-wider pl-1">Full Name</label>
              <div className="relative">
                <input 
                  className="w-full font-inter bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface font-medium focus:ring-2 focus:ring-terraforge/30 transition-all shadow-sm outline-none" 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <label className="block text-xs font-inter font-bold text-on-surface-variant uppercase tracking-wider pl-1">Email Address</label>
              <div className="relative">
                <input 
                  className="w-full font-inter bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface font-medium focus:ring-2 focus:ring-terraforge/30 transition-all shadow-sm outline-none" 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <label className="block text-xs font-inter font-bold text-on-surface-variant uppercase tracking-wider pl-1">Phone Number</label>
              <div className="relative">
                <input 
                  className="w-full font-inter bg-surface-container-lowest border-none rounded-xl px-4 py-4 text-on-surface font-medium focus:ring-2 focus:ring-terraforge/30 transition-all shadow-sm outline-none" 
                  type="tel" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          {/* Action Button */}
          <div className="pt-4">
            <button 
              onClick={handleSave}
              className="w-full bg-terraforge text-white font-bold font-inter py-4 rounded-xl shadow-lg hover:shadow-xl hover:opacity-95 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
