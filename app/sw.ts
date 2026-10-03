import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist inyecta aquí la lista de archivos del shell en tiempo de build.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * El lector del modo cámara (public/ocr/: motor WASM y modelos, ~10 MB
 * comprimidos) no está en el precache. Se guarda la primera vez que se usa
 * y desde entonces se sirve de aquí, también sin conexión. Cada archivo
 * lleva su versión en el nombre, así que nunca cambia bajo la misma
 * dirección; el límite de entradas descarta los de versiones viejas.
 */
const CACHE_OCR = "ocr";

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
      handler: new CacheFirst({
        cacheName: CACHE_OCR,
        plugins: [new ExpirationPlugin({ maxEntries: 8 })],
      }),
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

// El lector anterior (Tesseract) guardaba sus archivos en "ocr-<versión>":
// ya no se usan y ocupan ~15 MB.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith("ocr-"))
          .map((nombre) => caches.delete(nombre)),
      ),
    ),
  );
});

serwist.addEventListeners();
