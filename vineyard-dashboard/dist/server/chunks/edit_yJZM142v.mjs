/* empty css                 */
import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './server_VUPZCzj0.mjs';
import { $ as $$MasterLayout } from './MasterLayout_8pzA2Fr9.mjs';

const $$Edit = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MasterLayout", $$MasterLayout, { "title": "Map Configuration" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="px-6 py-10"> <div class="mb-10 text-center md:text-left"> <h1 class="text-4xl font-manrope font-extrabold text-stone-800 tracking-tight mb-2">
Dashboard Configuration
</h1> <p class="text-stone-500 font-inter font-medium opacity-80 max-w-2xl">
Manage your sentinel vineyard zones, GPS centroids, and soil telemetry parameters 
        to ensure Organic Precision across all sectors.
</p> </div>  ${renderComponent($$result2, "EditForm", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/edit/EditForm", "client:component-export": "EditForm" })} </div> ` })}`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/edit.astro", void 0);

const $$file = "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/edit.astro";
const $$url = "/edit";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Edit,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
