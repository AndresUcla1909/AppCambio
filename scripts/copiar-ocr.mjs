/**
 * Copia a public/ocr/ lo que necesita el lector de precios del modo cámara:
 * el motor WASM de ONNX Runtime (desde node_modules) y los modelos de
 * PP-OCRv6 con su diccionario (desde modelos/ocr/, que sí va en el repo).
 *
 * Así todo se sirve desde la propia app, sin depender de un CDN, y el
 * service worker puede guardarlo para que la cámara funcione sin conexión.
 * Corre en `postinstall` y antes de `build`; public/ocr/ no va al repo.
 *
 * Es .mjs y no .ts a propósito: `postinstall` corre antes de que exista tsx.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "public", "ocr");

const require = createRequire(path.join(raiz, "package.json"));
// El paquete no expone su package.json; su archivo principal ya está en dist/.
const ort = path.dirname(require.resolve("onnxruntime-web"));
const { version } = JSON.parse(readFileSync(path.join(ort, "..", "package.json"), "utf8"));
const modelos = path.join(raiz, "modelos", "ocr");

const archivos = [
  // El motor WASM. La versión "bundle" que importa el worker ya trae su
  // código de arranque; sólo hace falta el binario. Lleva la versión en el
  // nombre: el service worker lo guarda para siempre, y al actualizar ONNX
  // Runtime el código nuevo no debe toparse con un binario viejo.
  [path.join(ort, "ort-wasm-simd-threaded.wasm"), `ort-${version}.wasm`],
  // Los modelos ya traen su versión en el nombre (ppocrv6-tiny-…).
  ...readdirSync(modelos).map((nombre) => [path.join(modelos, nombre), nombre]),
];

// Se vacía antes para que no queden archivos de versiones anteriores.
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const [origen, nombre] of archivos) {
  copyFileSync(origen, path.join(destino, nombre));
}
console.log(`OCR: ${archivos.length} archivos copiados a public/ocr/`);
