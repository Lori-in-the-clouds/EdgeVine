import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { o as renderHead, n as renderComponent, p as renderSlot, r as renderTemplate } from './server_VUPZCzj0.mjs';
/* empty css                 */
import { jsxs, jsx } from 'react/jsx-runtime';
import React from 'react';
import { X, Menu, Search, ChevronDown, LayoutDashboard, Network, BarChart3 } from 'lucide-react';

function Header() {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    document.body.classList.toggle("sidebar-collapsed");
  };
  return /* @__PURE__ */ jsxs("header", { className: "h-[72px] m-4 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/20 shadow-ambient flex items-center justify-between px-6 z-40 relative group transition-all duration-500", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: toggleSidebar,
        className: "p-2 hover:bg-stone-50 rounded-lg transition-all duration-300 text-stone-500 hover:text-primary mr-2 group h-10 w-10 flex items-center justify-center relative overflow-hidden",
        "aria-label": "Toggle Sidebar",
        children: /* @__PURE__ */ jsxs("div", { className: "relative h-6 w-6", children: [
          /* @__PURE__ */ jsx(X, { className: `absolute inset-0 transition-all duration-500 transform ${isCollapsed ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"}` }),
          /* @__PURE__ */ jsx(Menu, { className: `absolute inset-0 transition-all duration-500 transform ${isCollapsed ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"}` })
        ] })
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "flex-1 max-w-md mx-4", children: /* @__PURE__ */ jsxs("div", { className: "relative flex items-center w-full h-10 rounded-full bg-surface-container-low overflow-hidden transition-all focus-within:bg-surface-bright focus-within:ring-2 focus-within:ring-primary-fixed-dim", children: [
      /* @__PURE__ */ jsx("div", { className: "grid place-items-center h-full w-12 text-on-surface-variant", children: /* @__PURE__ */ jsx(Search, { className: "h-5 w-5" }) }),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-2 font-inter",
          type: "text",
          id: "search",
          placeholder: "Search zones, sensors, or alerts..."
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex items-center gap-6", children: /* @__PURE__ */ jsxs(
      "a",
      {
        href: "/profile",
        className: "flex items-center gap-3 cursor-pointer group hover:opacity-80 transition-all duration-200",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "text-right hidden md:block group-hover:translate-x-[-4px] transition-transform", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-on-surface font-manrope", children: "Marco Rossi" }),
            /* @__PURE__ */ jsx("p", { className: "text-xs text-on-surface-variant font-inter uppercase tracking-wide", children: "Agronomist" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "h-10 w-10 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-stone-200 group-hover:shadow-md transition-all", children: /* @__PURE__ */ jsx(
            "img",
            {
              src: "/images/marco-rossi.png",
              alt: "Marco Rossi",
              className: "h-full w-full object-cover"
            }
          ) }),
          /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4 text-on-surface-variant group-hover:text-primary transition-colors" })
        ]
      }
    ) })
  ] });
}

function Sidebar() {
  const [currentPath, setCurrentPath] = React.useState("/");
  React.useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);
  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Alerts & Network", icon: Network, path: "/alerts" },
    { label: "Statistics", icon: BarChart3, path: "/statistics" }
  ];
  return /* @__PURE__ */ jsxs("aside", { className: "sidebar-component fixed left-0 top-0 h-[calc(100vh-32px)] w-64 m-4 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl flex flex-col p-6 gap-2 z-50 shadow-2xl", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-10 flex flex-col gap-1 px-2", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-2xl font-manrope font-extrabold text-[#228B22] tracking-tight block mb-1", children: "EdgeVine" }),
      /* @__PURE__ */ jsx("p", { className: "text-[10px] text-stone-400 font-bold font-inter uppercase tracking-widest", children: "Organic Precision" })
    ] }),
    /* @__PURE__ */ jsx("nav", { className: "flex-grow space-y-2 mt-2", children: navItems.map((item) => {
      const isActive = currentPath === item.path || item.path !== "/" && currentPath.startsWith(item.path);
      return /* @__PURE__ */ jsxs(
        "a",
        {
          href: item.path,
          className: `flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 group ${isActive ? "bg-[#228B22] text-white shadow-lg shadow-green-900/20 scale-[1.02]" : "text-stone-500 hover:text-[#228B22] hover:bg-white/50"}`,
          children: [
            /* @__PURE__ */ jsx(item.icon, { className: `h-5 w-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}` }),
            /* @__PURE__ */ jsx("span", { className: `font-semibold text-sm font-inter ${isActive ? "opacity-100" : "opacity-80"}`, children: item.label })
          ]
        },
        item.path
      );
    }) }),
    /* @__PURE__ */ jsx("div", { className: "mt-auto px-2 py-4 opacity-20 hover:opacity-100 transition-opacity", children: /* @__PURE__ */ jsx("p", { className: "text-[8px] font-bold text-stone-500 uppercase tracking-[0.2em]", children: "TerraForge Systems" }) })
  ] });
}

const $$MasterLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$MasterLayout;
  const { title } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} | EdgeVine</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">${renderHead()}</head> <body class="bg-background min-h-screen"> ${renderComponent($$result, "Sidebar", Sidebar, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/common/Sidebar", "client:component-export": "Sidebar" })} <div class="main-content min-h-screen ml-72 flex flex-col bg-background transition-all duration-500"> ${renderComponent($$result, "Header", Header, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/common/Header", "client:component-export": "Header" })} <main class="flex-1 mx-4 mb-4 overflow-hidden relative rounded-2xl"> ${renderSlot($$result, $$slots["default"])} </main> </div> </body></html>`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/layouts/MasterLayout.astro", void 0);

export { $$MasterLayout as $ };
