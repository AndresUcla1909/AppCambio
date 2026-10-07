"use client";

import { hoyCaracas } from "../formato";
import {
  recortarFilas,
  recortarMuestras,
  registrarMuestraP2p,
  sanearMuestras,
} from "./buffer";
import { fundir, sanear, upsert } from "./logica";
import type { FilaTasa, MuestraP2P, TasaNueva } from "./tipos";

/**
 * El búfer local del teléfono: los últimos 60 días de tasas BCV y de USDT
 * (ver `buffer.ts`). Cada escritura descarta lo que quedó fuera de la
 * ventana; lo anterior se consulta en Supabase cuando hay red.
 *
 * Se usa `localStorage` y no IndexedDB porque los datos son diminutos —unas
 * 60 filas— y así el código queda síncrono, que simplifica mucho los
 * componentes. Las pantallas lo leen como estado con `hooks.ts`.
 */

export const CLAVE = "historial-tasas-v1";
export const CLAVE_P2P = "p2p-muestras-v1";

/** Se dispara en cada escritura, para que las pantallas abiertas se enteren. */
const EVENTO_CAMBIO = "almacen-tasas";

/**
 * Para `useSyncExternalStore`: avisa de cambios hechos en esta pestaña y en
 * otras (el evento `storage` sólo llega desde las demás).
 */
export function suscribirAlmacen(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_CAMBIO, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

/** El texto guardado tal cual: es estable entre lecturas, sirve de snapshot. */
export function leerCrudo(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Lectura y escritura crudas                                          */
/* ------------------------------------------------------------------ */

function leerJson(clave: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    // Safari en privado, cuota llena o JSON corrupto: se empieza de cero en
    // memoria en vez de tumbar la app.
    return null;
  }
}

function escribirJson(clave: string, datos: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(clave, JSON.stringify(datos));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

export function leerFilas(): FilaTasa[] {
  return sanear(leerJson(CLAVE));
}

/** Guarda las filas ya recortadas a la ventana. */
function escribirFilas(filas: FilaTasa[]): void {
  escribirJson(CLAVE, recortarFilas(filas, hoyCaracas()));
}

function leerMuestrasP2p(): MuestraP2P[] {
  return sanearMuestras(leerJson(CLAVE_P2P));
}

function escribirMuestras(muestras: MuestraP2P[]): void {
  escribirJson(CLAVE_P2P, recortarMuestras(muestras, hoyCaracas()));
}

/* ------------------------------------------------------------------ */
/* Operaciones de la app                                               */
/* ------------------------------------------------------------------ */

/** Inserta o corrige una tasa (la captura del BCV o la carga manual). */
export function guardarTasa(nueva: TasaNueva): void {
  escribirFilas(upsert(leerFilas(), nueva));
}

/**
 * Funde en el búfer tasas que llegaron de Supabase. Ante la misma fecha gana
 * la actualizada más recientemente; lo que cae fuera de la ventana se
 * descarta al escribir.
 */
export function fundirEnBuffer(entrantes: FilaTasa[]): void {
  if (entrantes.length === 0) return;
  escribirFilas(fundir(leerFilas(), entrantes));
}

/** Guarda el USDT recién obtenido (uno por día: el último visto). */
export function guardarMuestraP2p(precio: number, obtenidoEn: string): void {
  escribirMuestras(registrarMuestraP2p(leerMuestrasP2p(), precio, obtenidoEn));
}

/**
 * Rota el búfer: descarta lo que quedó fuera de los 60 días aunque no se
 * haya escrito nada nuevo (la app pudo pasar semanas cerrada). Se llama al
 * abrir la app; es idempotente.
 */
export function rotarBuffer(): void {
  const filas = leerFilas();
  if (filas.length > 0) escribirFilas(filas);
  const muestras = leerMuestrasP2p();
  if (muestras.length > 0) escribirMuestras(muestras);
}

/**
 * Pide al navegador que no descarte estos datos si necesita espacio.
 * En una PWA instalada en iOS suele concederse; si no, no pasa nada grave.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
