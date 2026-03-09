import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import mainPkg from "../package.json" with { type: "json" };

export default defineConfig({
  plugins: [tailwindcss(), nitro()],
  resolve: {
    tsconfigPaths: true,
    external: [mainPkg.name, ...Object.keys(mainPkg.dependencies)],
  },
  nitro: {
    preset: "standard",
    serverDir: "./server",
    entry: "./server/entry.ts",
    minify: true,
    serveStatic: "inline",
    inlineDynamicImports: true,
  },
});
