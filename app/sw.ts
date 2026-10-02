import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, Serwist } from "serwist";
import paqueteOcr from "tesseract.js/package.json";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist inyecta aquí la lista de archivos del shell en tiempo de build.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * El OCR del modo cámara (public/ocr/) pesa ~15 MB y no está en el precache.
 * Se guarda la primera vez que se usa y desde entonces se sirve de aquí, también
 * sin conexión. La caché lleva la versión de Tesseract.js en el nombre: al
 * actualizarlo, el worker nuevo no se mezcla con el motor viejo.
 */
const CACHE_OCR = `ocr-${paqueteOcr.version}`;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // La app es de una sola persona: no hay motivo para dejar versiones viejas.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/ocr/"),
      handler: new CacheFirst({ cacheName: CACHE_OCR }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/sin-conexion",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

// Las cachés del OCR de versiones anteriores sólo ocupan espacio.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith("ocr-") && nombre !== CACHE_OCR)
          .map((nombre) => caches.delete(nombre)),
      ),
    ),
  );
});

serwist.addEventListeners();
