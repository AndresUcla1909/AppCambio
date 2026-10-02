"use client";

import type { Worker } from "tesseract.js";
import type { RenglonLeido } from "./precio";

/**
 * El lector de texto del modo cámara: Tesseract.js corriendo dentro del
 * teléfono. La imagen de la cámara nunca sale del aparato.
 *
 * Sus archivos se sirven desde /ocr/ (los copia scripts/copiar-ocr.mjs) y
 * Tesseract guarda el idioma en IndexedDB, así que después del primer uso
 * funciona sin conexión.
 *
 * Arrancarlo tarda uno o dos segundos, por eso se crea una sola vez y se
 * reutiliza cada vez que se abre la cámara.
 */
let lector: Promise<Worker> | null = null;

export function obtenerLector(): Promise<Worker> {
  lector ??= crearLector().catch((error: unknown) => {
    // Si falló (p. ej. sin conexión la primera vez), el próximo intento
    // empieza de cero en vez de heredar el error.
    lector = null;
    throw error;
  });
  return lector;
}

async function crearLector(): Promise<Worker> {
  // Se carga al abrir la cámara: no tiene por qué pesar en el arranque.
  const { createWorker, OEM, PSM } = await import("tesseract.js");

  // Rutas absolutas: el worker de Tesseract no resuelve bien las relativas.
  const base = new URL("/ocr/", window.location.origin).href;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
  });

  // Ojo: no se limita a dígitos con `tessedit_char_whitelist`. Probado con
  // etiquetas: obliga a leer las letras como números ("1kg" sale "1") y deja
  // la confianza en 0. Es mejor leer todo y que `elegirPrecio` filtre.
  await worker.setParameters({
    // Texto disperso: en una etiqueta el precio está suelto entre otras cosas.
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });

  return worker;
}

/** Lee la imagen y devuelve cada renglón con su tamaño y su confianza. */
export async function leerRenglones(
  imagen: HTMLCanvasElement,
): Promise<RenglonLeido[]> {
  const worker = await obtenerLector();
  const { data } = await worker.recognize(
    imagen,
    {},
    { blocks: true, text: false },
  );

  const renglones: RenglonLeido[] = [];
  for (const bloque of data.blocks ?? []) {
    for (const parrafo of bloque.paragraphs) {
      for (const linea of parrafo.lines) {
        renglones.push({
          texto: linea.text,
          confianza: linea.confidence,
          alto: linea.bbox.y1 - linea.bbox.y0,
        });
      }
    }
  }
  return renglones;
}
