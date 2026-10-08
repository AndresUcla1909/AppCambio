import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // El scraper del BCV usa cheerio: debe quedarse del lado del servidor.
  serverExternalPackages: ["cheerio"],
  // Next 16 genera archivos de reglas para agentes en cada arranque; no hacen falta.
  agentRules: false,
};

const conServiceWorker = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En desarrollo el service worker estorba: cachea y esconde los cambios.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  // Sólo los archivos sueltos de public/. El OCR del modo cámara (public/ocr/,
  // ~15 MB) no se descarga al instalar: lo guarda el service worker la
  // primera vez que se abre la cámara.
  globPublicPatterns: ["*"],
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
