"use client";

import { CLAVE_CACHE_OFFLINE, CLAVE_TASA_PREFERIDA } from "./config";
import type { PrecioP2P } from "./binance/p2p";
import type { TasaVigente } from "./almacen/tipos";
import type { DiaISO } from "./formato";

export type TipoTasa = "usdt" | "bcv_usd" | "bcv_eur";

export type CacheOffline = {
  dia: DiaISO;
  bcv: TasaVigente | null;
  p2p: PrecioP2P | null;
  guardadoEn: string;
};

/**
 * Últimas tasas vistas, para que la calculadora siga sirviendo sin conexión.
 * `localStorage` puede fallar (Safari privado, cuota llena); nunca debe
 * tumbar la app.
 */
export function guardarCache(cache: CacheOffline): void {
  try {
    localStorage.setItem(CLAVE_CACHE_OFFLINE, JSON.stringify(cache));
  } catch {
    // Sin caché offline se vive; sin app, no.
  }
}

export function leerCache(): CacheOffline | null {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE_OFFLINE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as CacheOffline;
    if (!datos || typeof datos.guardadoEn !== "string") return null;
    return datos;
  } catch {
    return null;
  }
}

export function guardarTasaPreferida(tipo: TipoTasa): void {
  try {
    localStorage.setItem(CLAVE_TASA_PREFERIDA, tipo);
  } catch {
    /* preferencia opcional */
  }
}

export function leerTasaPreferida(): TipoTasa | null {
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
