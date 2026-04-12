/* empty css                 */
import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './server_VUPZCzj0.mjs';
import { $ as $$MasterLayout } from './MasterLayout_8pzA2Fr9.mjs';

const $$Statistics = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MasterLayout", $$MasterLayout, { "title": "Statistics" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-6xl mx-auto"> <header class="mb-8 mt-2"> <h1 class="text-3xl font-manrope font-bold text-on-surface">
Predictive Analytics
</h1> <p class="text-on-surface-variant font-inter mt-1">
Telemetry health data and estimated production insights.
</p> </header> ${renderComponent($$result2, "DashboardStats", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/stats/DashboardStats", "client:component-export": "DashboardStats" })} </div> ` })}`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/statistics.astro", void 0);

const $$file = "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/statistics.astro";
const $$url = "/statistics";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Statistics,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
