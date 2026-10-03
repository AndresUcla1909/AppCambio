"use client";

import type { RenglonLeido } from "./precio";

/**
 * El lector de precios del modo cámara, visto desde la página. El trabajo
 * pesado (PP-OCRv6 en ONNX Runtime) corre en un worker (`trabajador.ts`)
 * para que la imagen de la cámara no se trabe; aquí sólo se le mandan los
 * cuadros y se esperan las respuestas.
 *
 * Todo ocurre en el teléfono: la imagen nunca sale del aparato. Los modelos
 * se sirven desde /ocr/ y el service worker los guarda, así que tras el
 * primer uso funciona sin conexión.
 *
 * El worker se crea una sola vez y se reutiliza cada vez que se abre la
 * cámara: cargar los modelos tarda uno o dos segundos.
 */

type Pendiente = {
  resolver: (renglones: RenglonLeido[]) => void;
  rechazar: (error: Error) => void;
};

let trabajador: Worker | null = null;
let listo: Promise<void> | null = null;
let siguienteId = 0;
const pendientes = new Map<number, Pendiente>();

function crearTrabajador(): Worker {
  const nuevo = new Worker(new URL("./trabajador.ts", import.meta.url), {
    type: "module",
  });
  nuevo.onmessage = (evento: MessageEvent) => {
    const { tipo, id, renglones, mensaje } = evento.data;
    const pendiente = id != null ? pendientes.get(id) : undefined;
    if (!pendiente) return;
    pendientes.delete(id);
    if (tipo === "leido") pendiente.resolver(renglones);
    else pendiente.rechazar(new Error(mensaje ?? "El lector falló"));
  };
  return nuevo;
}

/** Marca de que la cámara ya se usó en este aparato (y los modelos están guardados). */
const CLAVE_USADA = "camara-usada-v1";

/** Arranca el lector (si hace falta) y espera a que tenga los modelos cargados. */
export function obtenerLector(): Promise<void> {
  listo ??= new Promise<void>((resolver, rechazar) => {
    trabajador ??= crearTrabajador();
    const alResponder = (evento: MessageEvent) => {
      if (evento.data.id != null) return;
      trabajador?.removeEventListener("message", alResponder);
      if (evento.data.tipo === "listo") {
        try {
          localStorage.setItem(CLAVE_USADA, "1");
        } catch {
          /* sólo sirve para precalentar */
        }
        resolver();
      } else {
        rechazar(new Error(evento.data.mensaje ?? "No se pudo cargar el lector"));
      }
    };
    trabajador.addEventListener("message", alResponder);
    trabajador.postMessage({ tipo: "preparar" });
  }).catch((error: unknown) => {
    // Si falló (p. ej. sin conexión la primera vez), el próximo intento
    // empieza de cero en vez de heredar el error.
    listo = null;
    throw error;
  });
  return listo;
}

/**
 * Si la cámara ya se usó en este aparato, carga el lector con calma al abrir
 * la app, para que al tocar "Cámara" ya esté listo. Los modelos salen de la
 * caché del teléfono, así que no gasta datos; y si nunca se usó, no hace
 * nada, para no descargar 10 MB que quizá nadie necesite.
 */
export function precalentarLector(): void {
  try {
    if (!localStorage.getItem(CLAVE_USADA)) return;
  } catch {
    return;
  }
  const arrancar = () => void obtenerLector().catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(arrancar, { timeout: 4000 });
  else setTimeout(arrancar, 2000);
}

/** Lee lo que hay en el lienzo y devuelve cada renglón con su geometría. */
export async function leerRenglones(lienzo: HTMLCanvasElement): Promise<RenglonLeido[]> {
  await obtenerLector();
  const contexto = lienzo.getContext("2d", { willReadFrequently: true });
  if (!contexto || !trabajador) return [];

  const { width: ancho, height: alto } = lienzo;
  const { data } = contexto.getImageData(0, 0, ancho, alto);
  const id = ++siguienteId;
  return new Promise<RenglonLeido[]>((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar });
    // Los píxeles se transfieren, no se copian.
    trabajador!.postMessage({ tipo: "leer", id, ancho, alto, datos: data.buffer }, [
      data.buffer,
    ]);
  });
}
