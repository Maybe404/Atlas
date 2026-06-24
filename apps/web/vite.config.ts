import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Force the heavy rendering libs into their own chunks so the entry bundle stays small enough
// to clear the 500 kB warning. Mermaid / cytoscape are only needed when a markdown doc
// actually contains a diagram, and KaTeX only for math. Rollup's automatic splitting can't
// always tease these apart because they're pulled in via Promise.all in the markdown renderer.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    // Mermaid (665 kB) and the React app bundle (969 kB) inherently exceed the 500 kB default
    // warning threshold. Mermaid is already lazy-loaded (see apps/web/src/markdown/renderer.ts),
    // and the React app is the entry chunk — the rest of the vendor surface (KaTeX, the
    // highlight.js grammars, individual mermaid diagram definitions) is already code-split via
    // the manualChunks below. Bump the threshold so the build stops screaming about chunks
    // that are correct by design.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          mermaid: ['mermaid'],
          katex: ['@vscode/markdown-it-katex', 'katex'],
        },
      },
    },
  },
});
