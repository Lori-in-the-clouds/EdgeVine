"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Settings", href: "/settings" },
    { name: "Live Overview", href: "/" },
    { name: "Statistics", href: "/stats" },
  ];

  return (
    <div className="w-64 h-screen bg-gray-900 text-white p-4">
      <h1 className="text-xl font-bold mb-6">
        🌿 Smart Vineyard
      </h1>

      <nav className="flex flex-col gap-2">
        {links.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className={`p-2 rounded ${
              pathname === link.href
                ? "bg-green-600"
                : "hover:bg-gray-700"
            }`}
          >
            {link.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}