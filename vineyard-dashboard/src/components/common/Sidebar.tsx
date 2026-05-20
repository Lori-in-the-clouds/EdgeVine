import React from 'react';
import { LayoutDashboard, Network, BarChart3, Settings } from 'lucide-react';

export function Sidebar({ initialPath = '' }: { initialPath?: string }) {
  const [currentPath, setCurrentPath] = React.useState(initialPath);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Alerts & Network', icon: Network, path: '/alerts' },
    { label: 'Statistics', icon: BarChart3, path: '/statistics' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <aside className="sidebar-component fixed left-0 top-0 h-[calc(100vh-32px)] w-64 m-4 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl flex flex-col p-6 gap-2 z-50 shadow-2xl">
      {/* Branding Section (Modern Minimal) */}
      <div className="mb-10 flex flex-col gap-1 px-2">
        <h1 className="text-2xl font-manrope font-extrabold text-[#228B22] tracking-tight block mb-1">
          EdgeVine
        </h1>
        <p className="text-[10px] text-stone-400 font-bold font-inter uppercase tracking-widest">
          Organic Precision
        </p>
      </div>

      {/* Navigation Section */}
      <nav className="flex-grow space-y-2 mt-2">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? (currentPath === '/' || currentPath === '/index.html')
            : currentPath.startsWith(item.path);
          return (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 group ${isActive
                  ? 'bg-[#228B22] text-white shadow-lg shadow-green-900/20 scale-[1.02]'
                  : 'text-stone-500 hover:text-[#228B22] hover:bg-white/50'
                }`}
            >
              <item.icon className={`h-5 w-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              <span className={`font-semibold text-sm font-inter ${isActive ? 'opacity-100' : 'opacity-80'}`}>{item.label}</span>
            </a>
          );
        })}
      </nav>

    </aside>
  );
}
