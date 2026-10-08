"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CLAVE_TEMA, TEMA_POR_DEFECTO, aplicarTema, esOscuro, esTema, type Tema } from "./tema";

/**
 * El tema como estado de React. `localStorage` puede fallar (Safari privado,
 * cuota llena): entonces vale el tema por defecto y nunca tumba la app.
 */

const EVENTO_CAMBIO = "tema";
const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

export function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento, el cambio dura hasta cerrar la app.
  }
  temaSinAlmacen = tema;
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

/** Respaldo en memoria si `localStorage` no deja guardar. */
let temaSinAlmacen: Tema | null = null;

function leerTema(): Tema {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    if (esTema(valor)) return valor;
  } catch {
    // Sigue con el respaldo.
  }
  return temaSinAlmacen ?? TEMA_POR_DEFECTO;
}

function sistemaOscuro(): boolean {
  return window.matchMedia(CONSULTA_OSCURO).matches;
}

function suscribir(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_OSCURO);
  window.addEventListener(EVENTO_CAMBIO, alCambiar);
  // Otra pestaña cambió el tema.
  window.addEventListener("storage", alCambiar);
  // El teléfono pasó a modo claro u oscuro (importa con "sistema").
  consulta.addEventListener("change", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, alCambiar);
    window.removeEventListener("storage", alCambiar);
    consulta.removeEventListener("change", alCambiar);
  };
}

/** La elección guardada y si la pantalla queda oscura con ella. */
export function useTema(): { tema: Tema; oscuro: boolean } {
  const tema = useSyncExternalStore(suscribir, leerTema, () => TEMA_POR_DEFECTO);
  const oscuroSistema = useSyncExternalStore(suscribir, sistemaOscuro, () => true);
  return { tema, oscuro: esOscuro(tema, oscuroSistema) };
}

/**
 * Mantiene <html> al día cuando cambia la elección o el ajuste del teléfono.
 * El primer pintado ya lo resolvió el script de `scriptTema()`.
 */
export function useAplicarTema(): void {
  const { oscuro } = useTema();
  // Lee el valor real y no `oscuro`: en la hidratación el hook todavía trae
  // el del servidor (oscuro), y aplicarlo haría parpadear el tema claro.
  useEffect(() => aplicarTema(esOscuro(leerTema(), sistemaOscuro())), [oscuro]);
}
