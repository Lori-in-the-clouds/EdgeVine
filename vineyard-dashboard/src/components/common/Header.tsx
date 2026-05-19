import { useState, useEffect } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';

export function Header() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userName, setUserName] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('edgevine_profile');
      if (saved) {
        try {
          return JSON.parse(saved).name || "John Doe";
        } catch(e) {}
      }
    }
    return "John Doe";
  });

  const [userPhoto, setUserPhoto] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('edgevine_profile');
      if (saved) {
        try {
          return JSON.parse(saved).photo || "/images/john-doe.png";
        } catch(e) {}
      }
    }
    return "/images/marco-rossi.png";
  });

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      if (e.detail?.name) setUserName(e.detail.name);
      if (e.detail?.photo) setUserPhoto(e.detail.photo);
    };
    window.addEventListener('profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('profile-updated', handleProfileUpdate);
  }, []);

  // Sync state initially with body class if needed, or assume default
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    document.body.classList.toggle('sidebar-collapsed');
  };

  return (
    <header className="h-[72px] m-4 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/20 shadow-ambient flex items-center justify-between px-6 z-40 relative group transition-all duration-500">
      
      {/* Sidebar Toggle */}
      <button 
        onClick={toggleSidebar}
        className="p-2 hover:bg-stone-50 rounded-lg transition-all duration-300 text-stone-500 hover:text-primary mr-2 group h-10 w-10 flex items-center justify-center relative overflow-hidden"
        aria-label="Toggle Sidebar"
      >
        <div className="relative h-6 w-6">
          <X className={`absolute inset-0 transition-all duration-500 transform ${isCollapsed ? 'rotate-90 opacity-0 scale-50' : 'rotate-0 opacity-100 scale-100'}`} />
          <Menu className={`absolute inset-0 transition-all duration-500 transform ${isCollapsed ? 'rotate-0 opacity-100 scale-100' : '-rotate-90 opacity-0 scale-50'}`} />
        </div>
      </button>

      {/* Spacer to keep profile on the right */}
      <div className="flex-1" />

      {/* Profile Block */}
      <div className="flex items-center gap-6">
        <a 
          href="/profile"
          className="flex items-center gap-3 cursor-pointer group hover:opacity-80 transition-all duration-200"
        >
          <div className="text-right hidden md:block group-hover:translate-x-[-4px] transition-transform">
            <p id="header-profile-name" className="text-sm font-semibold text-on-surface font-manrope">{userName}</p>
          </div>
          <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-stone-200 group-hover:shadow-md transition-all">
            <img 
              id="header-profile-photo"
              src={userPhoto}
              alt={userName}
              className="h-full w-full object-cover transition-all duration-700 ease-in-out opacity-100 group-hover:scale-110"
              key={userPhoto} // Key force re-mount to ensure transition if URL changes
            />
          </div>
          <ChevronDown className="h-4 w-4 text-on-surface-variant group-hover:text-primary transition-colors" />
        </a>
      </div>
    </header>
  );
}
