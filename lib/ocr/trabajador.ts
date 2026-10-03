/**
 * Worker del lector de precios: carga los modelos de PP-OCRv6 en ONNX
 * Runtime y lee los cuadros que le manda la cámara. Corre aparte para que
 * la imagen de la cámara no se trabe mientras lee.
 *
 * Mensajes:
 *   → { tipo: "preparar" }                       ← { tipo: "listo" } | { tipo: "error" }
 *   → { tipo: "leer", id, ancho, alto, datos }   ← { tipo: "leido", id, renglones } | { tipo: "error", id }
 */

import * as ort from "onnxruntime-web/wasm";
import { leerRenglones, type Diccionario, type Ejecutar, type Modelo } from "./motor";
import { prepararDiccionario } from "./reconocimiento";

declare const self: DedicatedWorkerGlobalScope;

/** Dónde se sirven los modelos y el motor WASM (los copia scripts/copiar-ocr.mjs). */
const RUTA = new URL("/ocr/", self.location.origin).href;

/**
 * Los archivos llevan su versión en el nombre: el service worker los guarda
 * para siempre, así que al cambiarlos tiene que cambiar la dirección.
 */
const MODELO = "ppocrv6-tiny";

type Listo = { sesiones: Record<Modelo, ort.InferenceSession>; diccionario: Diccionario };
let preparado: Promise<Listo> | null = null;

function preparar(): Promise<Listo> {
  preparado ??= (async () => {
    ort.env.wasm.wasmPaths = { wasm: `${RUTA}ort-${ort.env.versions.web}.wasm` };
    // Un solo hilo: varios exigen aislar la página (COOP/COEP) y, en un
    // worker que ya corre aparte, la cámara no se resiente.
    ort.env.wasm.numThreads = 1;

    const [deteccion, reconocimiento, texto] = await Promise.all([
      ort.InferenceSession.create(`${RUTA}${MODELO}-deteccion.onnx`),
      ort.InferenceSession.create(`${RUTA}${MODELO}-reconocimiento.onnx`),
      fetch(`${RUTA}${MODELO}-diccionario.txt`).then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el diccionario");
        return r.text();
      }),
    ]);
    // Un carácter por línea. Se toleran finales "\r\n" por si el archivo
    // pasó por Windows (en el repo va marcado como binario para evitarlo).
    const lineas = texto.split("\n").map((l) => l.replace(/\r$/, ""));
    if (lineas[lineas.length - 1] === "") lineas.pop();
    return {
      sesiones: { deteccion, reconocimiento },
      diccionario: prepararDiccionario(lineas),
    };
  })().catch((error: unknown) => {
    // Que el próximo intento empiece de cero (p. ej. si faltaba conexión).
    preparado = null;
    throw error;
  });
  return preparado;
}

self.onmessage = async (evento: MessageEvent) => {
  const mensaje = evento.data;
  try {
    const { sesiones, diccionario } = await preparar();
    if (mensaje.tipo === "preparar") {
      self.postMessage({ tipo: "listo" });
      return;
    }

    if (mensaje.tipo === "leer") {
      const ejecutar: Ejecutar = async (modelo, tensor, forma) => {
        const sesion = sesiones[modelo];
        const resultado = await sesion.run({
          [sesion.inputNames[0]]: new ort.Tensor("float32", tensor, forma),
        });
        const salida = resultado[sesion.outputNames[0]];
        return { datos: salida.data as Float32Array, forma: salida.dims };
      };
      const imagen = {
        ancho: mensaje.ancho,
        alto: mensaje.alto,
        datos: new Uint8ClampedArray(mensaje.datos),
      };
      const renglones = await leerRenglones(imagen, ejecutar, diccionario);
      self.postMessage({ tipo: "leido", id: mensaje.id, renglones });
    }
  } catch (error) {
    self.postMessage({
      tipo: "error",
      id: mensaje.id,
      mensaje: error instanceof Error ? error.message : String(error),
    });
  }
};
