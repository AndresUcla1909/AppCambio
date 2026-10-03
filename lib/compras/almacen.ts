"use client";

import { CARRITO_VACIO, sanearCarrito, type Carrito } from "./logica";

/**
 * El carrito vive en el navegador del teléfono, como el historial: no hay
 * servidor detrás. Se guarda en cada cambio para no perder nada si iOS
 * cierra la app en segundo plano a mitad de la compra.
 */

const CLAVE = "carrito-compras-v1";

export function leerCarrito(): Carrito {
  if (typeof window === "undefined") return { ...CARRITO_VACIO };
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? sanearCarrito(JSON.parse(crudo)) : { ...CARRITO_VACIO };
  } catch {
    // Safari en privado o datos corruptos: se empieza de cero.
    return { ...CARRITO_VACIO };
  }
}

/** Devuelve `false` si no se pudo guardar (cuota llena, modo privado). */
export function guardarCarrito(carrito: Carrito): boolean {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(carrito));
    return true;
  } catch {
    return false;
  }
}
