"use client";

import { useSyncExternalStore } from "react";
import { CLAVE_TASA_PREFERIDA } from "./config";

export type TipoTasa = "usdt" | "bcv_usd" | "bcv_eur";

/**
 * La tasa que queda seleccionada al abrir la app. Se elige en el menú
 * lateral de la calculadora; tocar una tarjeta cambia la tasa del momento,
 * no la de por defecto.
 *
 * `localStorage` puede fallar (Safari privado, cuota llena); nunca debe
 * tumbar la app.
 */

const EVENTO_CAMBIO = "preferencias";

export function guardarTasaPreferida(tipo: TipoTasa): void {
  try {
    localStorage.setItem(CLAVE_TASA_PREFERIDA, tipo);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

function leerTasaPreferida(): TipoTasa | null {
  try {
    const valor = localStorage.getItem(CLAVE_TASA_PREFERIDA);
    if (valor === "usdt" || valor === "bcv_usd" || valor === "bcv_eur") {
      return valor;
    }
    return null;
  } catch {
    return null;
  }
}

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_CAMBIO, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

/** La tasa por defecto como estado: `null` en el servidor o si no se eligió. */
export function useTasaPreferida(): TipoTasa | null {
  return useSyncExternalStore(suscribir, leerTasaPreferida, () => null);
}
