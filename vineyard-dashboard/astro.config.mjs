import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  devToolbar: {
    enabled: false,
  },
  integrations: [react(), tailwind()],
  vite: {
    ssr: {
      external: ['pg'],
      noExternal: [/@turf\/.*/],
    },
  },
});
