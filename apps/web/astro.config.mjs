import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import vercel from "@astrojs/vercel";

/**
 * La web necesita SSR para poder leer SQLite en la ruta `/api/events` y en la
 * página principal, así que se compila como servidor Node standalone.
 * Para desplegar en Vercel se usa su adapter (serverless).
 */
const host = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 4321);

export default defineConfig({
  output: "server",
  adapter: process.env.VERCEL ? vercel() : node({ mode: "standalone" }),
  server: {
    host,
    port: Number.isFinite(port) ? port : 4321,
  },
  vite: {
    ssr: {
      // Los paquetes del workspace y `@libsql/client` se resuelven en runtime
      // desde `node_modules` para reusar su `dist` (libSQL usa bindings nativos).
      external: ["@app/db", "@app/shared", "@libsql/client"],
    },
  },
});
