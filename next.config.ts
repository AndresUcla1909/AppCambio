import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // El scraper del BCV usa cheerio: debe quedarse del lado del servidor.
  serverExternalPackages: ["cheerio"],
  // Next 16 genera estos archivos en cada arranque; el proyecto ya tiene SPEC.md.
  agentRules: false,
};

const conServiceWorker = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En desarrollo el service worker estorba: cachea y esconde los cambios.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

/**
 * Serwist todavía compila el service worker con webpack, y Next 16 usa
 * Turbopack por defecto. Como en desarrollo el SW está desactivado, allí se
 * deja la configuración limpia (Turbopack) y sólo el build lo envuelve
 * (ese corre con `next build --webpack`).
 */
export default process.env.NODE_ENV === "production"
  ? conServiceWorker(nextConfig)
  : nextConfig;
