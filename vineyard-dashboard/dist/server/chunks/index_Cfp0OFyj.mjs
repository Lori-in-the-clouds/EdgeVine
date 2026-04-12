/* empty css                 */
import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './server_VUPZCzj0.mjs';
import { $ as $$MasterLayout } from './MasterLayout_8pzA2Fr9.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MasterLayout", $$MasterLayout, { "title": "Dashboard Map-First" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="absolute inset-0 overflow-hidden w-full h-full bg-stone-900 rounded-[2rem] border border-white/5">  <div class="absolute top-6 left-6 z-50 pointer-events-none bg-black/40 backdrop-blur-md p-5 rounded-2xl border border-white/10 shadow-2xl transition-all duration-500"> <h2 class="text-3xl font-manrope font-extrabold text-white tracking-tight drop-shadow-lg">
Vineyard Overview
</h2> <p class="text-white/70 font-inter text-xs uppercase tracking-widest mt-1 font-bold opacity-90">
Satellite Telemetry • Tuscany District
</p> </div>  <div class="absolute inset-0 z-0"> ${renderComponent($$result2, "DashboardMap", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/map/DashboardMap", "client:component-export": "DashboardMap" })} </div>  <a href="/edit" class="absolute bottom-10 right-10 z-[3000] flex items-center gap-3 bg-[#1B4332] text-white px-6 py-4 rounded-xl shadow-2xl hover:bg-[#2d5a44] hover:scale-105 active:scale-95 transition-all duration-300 border border-white/10 group"> <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-90 group-hover:rotate-12 transition-transform"> <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path> <path d="m15 5 4 4"></path> </svg> <span class="font-manrope font-extrabold text-xs tracking-widest uppercase">Edit Vineyard</span> </a>  <div class="absolute bottom-10 left-10 z-20 pointer-events-none hidden md:flex items-center gap-6 opacity-60"> <div class="h-[1px] w-12 bg-white/20"></div> <p class="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em]">Sentinel Active</p> </div> </div> ` })}`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/index.astro", void 0);

const $$file = "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
