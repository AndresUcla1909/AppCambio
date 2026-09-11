"use client";

import type { DiaISO } from "../formato";
import {
  fundir,
  historial,
  sanear,
  tasaVigenteEn,
  upsert,
} from "./logica";
import type { FilaTasa, FilaTasaConVariacion, TasaNueva, TasaVigente } from "./tipos";

/**
 * El historial vive en el navegador del teléfono. No hay servidor detrás.
 *
 * Se usa `localStorage` y no IndexedDB porque los datos son diminutos —una
 * fila por día hábil, unos 250 KB en diez años— y así el código queda
 * síncrono, que simplifica mucho los componentes.
 *
 * Consecuencia que hay que tener presente: estos datos son de **este
 * aparato**. Por eso existen `exportar()` e `importar()`.
 */

const CLAVE = "historial-tasas-v1";
const CLAVE_SEMBRADO = "historial-sembrado-v1";

/**
 * Tasas reales del BCV capturadas el 11/09/2026, para que el historial no
 * arranque vacío. La del 11 ya no se puede volver a obtener: el sitio del BCV
 * sólo muestra la vigente, y esa tarde pasó a publicar la del 15.
 */
const SEMILLA: TasaNueva[] = [
  { fecha: "2026-09-11", usd: 832.4883, eur: 968.06734453, fuente: "bcv" },
  { fecha: "2026-09-15", usd: 842.2067, eur: 977.8777773, fuente: "bcv" },
];

/* ------------------------------------------------------------------ */
/* Lectura y escritura crudas                                          */
/* ------------------------------------------------------------------ */

export function leerFilas(): FilaTasa[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    return sanear(JSON.parse(crudo));
  } catch {
    // Safari en privado, cuota llena o JSON corrupto: se empieza de cero en
    // memoria en vez de tumbar la app.
    return [];
  }
}

function escribirFilas(filas: FilaTasa[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(filas));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Operaciones de la app                                               */
/* ------------------------------------------------------------------ */

/** Historial completo, de la fecha más reciente a la más antigua. */
export function obtenerHistorial(limite?: number): FilaTasaConVariacion[] {
  return historial(leerFilas(), limite);
}

/** La tasa vigente en una fecha. `null` si no hay ninguna anterior. */
export function obtenerTasaVigente(fecha: DiaISO): TasaVigente | null {
  return tasaVigenteEn(leerFilas(), fecha);
}

/** Inserta o corrige una tasa. Devuelve el historial ya actualizado. */
export function guardarTasa(nueva: TasaNueva): FilaTasaConVariacion[] {
  const filas = upsert(leerFilas(), nueva);
  escribirFilas(filas);
  return historial(filas);
}

/** Cuántas publicaciones hay guardadas. */
export function contarFilas(): number {
  return leerFilas().length;
}

/**
 * Carga la semilla la primera vez que se abre la app en este aparato.
 * Se marca aparte para no volver a meterla si el usuario borra el historial
 * a propósito.
 */
export function sembrarSiHaceFalta(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(CLAVE_SEMBRADO)) return;
    localStorage.setItem(CLAVE_SEMBRADO, "1");
  } catch {
    return;
  }

  let filas = leerFilas();
  if (filas.length > 0) return;
  for (const tasa of SEMILLA) filas = upsert(filas, tasa);
  escribirFilas(filas);
}

/* ------------------------------------------------------------------ */
/* Respaldo                                                            */
/* ------------------------------------------------------------------ */

/** El historial completo como JSON, para guardarlo donde el usuario quiera. */
export function exportar(): string {
  return JSON.stringify(leerFilas(), null, 2);
}

export type ResultadoImportacion = {
  leidas: number;
  totalTrasImportar: number;
};

/**
 * Funde un respaldo con lo que ya hay en el aparato. No borra nada: ante la
 * misma fecha se queda con la versión actualizada más recientemente.
 */
export function importar(texto: string): ResultadoImportacion {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }

  const entrantes = sanear(datos);
  if (entrantes.length === 0) {
    throw new Error("El archivo no contiene ninguna tasa reconocible.");
  }

  const fundidas = fundir(leerFilas(), entrantes);
  if (!escribirFilas(fundidas)) {
    throw new Error("No se pudo guardar en este navegador.");
  }

  return { leidas: entrantes.length, totalTrasImportar: fundidas.length };
}

/** Borra el historial de este aparato. Sin vuelta atrás. */
export function borrarTodo(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
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
