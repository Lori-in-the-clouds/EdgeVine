import { useState, useEffect } from "react";

export default function Sidebar() {
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  const links = [
    { name: "Settings", href: "/settings" },
    { name: "Live Overview", href: "/" },
    { name: "Statistics", href: "/stats" },
  ];

  return (
    <div className="w-64 h-screen bg-transparent text-white p-8 flex flex-col border-r border-white/5">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-8 h-8 bg-[#228B22] rounded-lg rotate-12 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(34,139,34,0.4)]">
          🍇
        </div>
        <h1 className="text-xl font-manrope font-black tracking-tighter">
          EDGE<span className="text-[#228B22]">VINE</span>
        </h1>
      </div>

      <nav className="flex flex-col gap-4">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.href}
            className={`group flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 ${
              pathname === link.href
                ? "bg-[#228B22] text-white shadow-lg"
                : "text-stone-500 hover:text-white hover:bg-white/5"
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest">{link.name}</span>
          </a>
        ))}
      </nav>

      <div className="mt-auto pt-8 border-t border-white/5">
         <p className="text-[9px] font-bold text-stone-600 uppercase tracking-widest">Network Status</p>
         <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 bg-[#228B22] rounded-full animate-pulse"></div>
            <span className="text-[10px] text-stone-400 font-bold">Encrypted Node Active</span>
         </div>
      </div>
    </div>
  );
}