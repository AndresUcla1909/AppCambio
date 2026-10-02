/**
 * Copia a public/ocr/ lo que Tesseract.js necesita para leer precios con la
 * cámara: el worker, el motor (WASM) y los datos del idioma.
 *
 * Así el OCR se sirve desde la propia app, sin depender de un CDN, y el
 * service worker puede guardarlo para que el modo cámara funcione sin
 * conexión. Corre en `postinstall` y antes de `build`; public/ocr/ no va al
 * repo porque son ~15 MB que ya están en node_modules.
 *
 * Es .mjs y no .ts a propósito: `postinstall` corre antes de que exista tsx.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "public", "ocr");

const require = createRequire(path.join(raiz, "package.json"));
const carpetaDe = (paquete, desde = require) =>
  path.dirname(desde.resolve(`${paquete}/package.json`));

const tesseract = carpetaDe("tesseract.js");
// El motor es dependencia de tesseract.js: se busca desde ahí por si npm no
// lo subió a la raíz de node_modules.
const motor = carpetaDe(
  "tesseract.js-core",
  createRequire(path.join(tesseract, "package.json")),
);
const idioma = carpetaDe("@tesseract.js-data/eng");

const archivos = [
  [path.join(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  // Sólo el motor LSTM, que es el que usa la app. Van las tres variantes
  // porque Tesseract elige en el teléfono según lo que soporte su WASM.
  ...["lstm", "simd-lstm", "relaxedsimd-lstm"].map((variante) => {
    const nombre = `tesseract-core-${variante}.wasm.js`;
    return [path.join(motor, nombre), nombre];
  }),
  // "best_int" es el modelo que Tesseract usa por defecto con el motor LSTM.
  [path.join(idioma, "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

mkdirSync(destino, { recursive: true });
for (const [origen, nombre] of archivos) {
  copyFileSync(origen, path.join(destino, nombre));
}
console.log(`OCR: ${archivos.length} archivos copiados a public/ocr/`);
