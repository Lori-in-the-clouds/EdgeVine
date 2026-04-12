/* empty css                 */
import { c as createComponent } from './astro-component_BY7O1oS3.mjs';
import 'piccolore';
import { o as renderHead, r as renderTemplate } from './server_VUPZCzj0.mjs';
import 'clsx';

const $$Login = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login | EdgeVine</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">${renderHead()}</head> <body class="bg-background text-on-background min-h-screen flex"> <!-- Split Screen Container --> <main class="flex w-full min-h-screen"> <!-- Left Side: Visual Anchor --> <section class="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary-container"> <img alt="Vineyard at sunset" class="absolute inset-0 w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-MUoQKHui-LYl4_gXWcE_qqDyhwlP5wDL8OVdYGQLE0le7-8wRMOaQIXttdlaUDmCdNvaBwRq7-5hmwWcdHxQVg9BNSpsk_85SSs1jUtmIXUPWdPpHReCprR1lRulZblSas42AnJV0gDkB9CoC3bx32QToWTpmo9Tse0f8oBGZvx367M-W-obq5G_vA_En4Z3iU9Ms0QeKBOtBb2FTNvG9awtZc1v_AYKE1Y226Yq7W1y3GSy1rgQB-7tlUUjWwvOEeW81f5LVjsa"> <!-- Tonal Overlay --> <div class="absolute inset-0 bg-gradient-to-tr from-on-primary-fixed-variant/40 to-transparent"></div> <!-- Branding/Value Prop Overlay --> <div class="relative z-10 p-16 flex flex-col justify-end h-full text-white"> <h2 class="text-5xl font-manrope font-extrabold tracking-tight mb-4 max-w-md text-[#FFFFFF]">Precision Viticulture for the Future</h2> <p class="text-xl text-primary-fixed-dim max-w-sm font-medium font-inter leading-relaxed">
Harnessing IoT data to cultivate excellence in every vine.
</p> </div> </section> <!-- Right Side: Interaction Canvas --> <section class="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 lg:p-24 bg-surface-container-lowest"> <div class="w-full max-w-md"> <!-- Brand Identity Cluster --> <div class="flex flex-col items-center gap-4 mb-8 text-center"> <div class="flex items-center justify-center w-14 h-14 rounded-xl bg-[#228B22] shadow-lg shadow-[#228B22]/20"> <img src="/icons/leaf-bold.svg" alt="EdgeVine Leaf Icon" class="w-8 h-8 brightness-0 invert"> </div> <div class="space-y-1"> <span class="text-5xl font-manrope font-extrabold text-forest-green tracking-tight block mb-2 text-[#228B22]">EdgeVine</span> <h1 class="text-3xl font-manrope font-extrabold text-on-surface tracking-tight whitespace-nowrap text-[#228B22]">Log in to EdgeVine</h1> </div> </div> <!-- Welcome Text --> <div class="mb-10 text-center"> <p class="text-on-surface-variant font-inter leading-relaxed">Welcome back. Enter your credentials to access your vineyard dashboard and real-time telemetry.</p> </div> <!-- Login Form --> <form class="space-y-6" onsubmit="window.location.href='/'; return false;"> <div> <label class="block text-sm font-inter font-semibold text-on-surface-variant mb-2 ml-1" for="email">Email</label> <input class="w-full px-5 py-4 rounded-xl border-none bg-surface-container-low focus:ring-2 focus:ring-primary focus:bg-white transition-all text-on-surface placeholder:text-outline font-inter" id="email" name="email" placeholder="name@vineyard.com" required type="email"> </div> <div> <div class="flex justify-between items-center mb-2 px-1"> <label class="text-sm font-inter font-semibold text-on-surface-variant" for="password">Password</label> <a class="text-sm font-inter font-semibold text-primary hover:text-primary-container transition-colors" href="#">Forgot password?</a> </div> <input class="w-full px-5 py-4 rounded-xl border-none bg-surface-container-low focus:ring-2 focus:ring-primary focus:bg-white transition-all text-on-surface placeholder:text-outline font-inter" id="password" name="password" placeholder="••••••••" required type="password"> </div> <button class="w-full py-4 px-6 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white font-manrope font-bold text-base shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all duration-200" type="submit">
Sign In to Dashboard
</button> </form> </div> </section> </main> </body></html>`;
}, "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/login.astro", void 0);

const $$file = "/Users/lorenzodimaio/Documents/Iot_project/vineyard-dashboard/src/pages/login.astro";
const $$url = "/login";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Login,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
