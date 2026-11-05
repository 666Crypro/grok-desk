import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: resolve(root, "js"),
    cssCodeSplit: false,
    sourcemap: false,
    target: "es2022",
    lib: {
      entry: resolve(root, "js/wallet.js"),
      formats: ["es"],
      fileName: () => "wallet.bundle.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "wallet.bundle.[ext]",
      },
    },
  },
});
