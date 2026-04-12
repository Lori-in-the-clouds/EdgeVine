/* empty css                 */
import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './server_VUPZCzj0.mjs';
import { $ as $$MasterLayout } from './MasterLayout_8pzA2Fr9.mjs';

const $$Alerts = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MasterLayout", $$MasterLayout, { "title": "Alerts & Network" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-[1400px] mx-auto"> <header class="mb-6 mt-2"> <h1 class="text-3xl font-manrope font-bold text-on-surface">
Network & Alerts
</h1> <p class="text-on-surface-variant font-inter mt-1">
Monitoraggio heatmap regionale e log di sistema
</p> </header> ${renderComponent($$result2, "AlertsView", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/components/alerts/AlertsView", "client:component-export": "AlertsView" })} </div> ` })}`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/alerts.astro", void 0);

const $$file = "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/alerts.astro";
const $$url = "/alerts";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Alerts,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
