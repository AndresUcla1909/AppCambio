"use client";

import { useMemo, useSyncExternalStore } from "react";
import { sanearMuestras } from "./buffer";
import { sanear } from "./logica";
import { CLAVE, CLAVE_P2P, leerCrudo, suscribirAlmacen } from "./navegador";
import type { FilaTasa, MuestraP2P } from "./tipos";

/**
 * El búfer local como estado de React. Se re-renderiza solo cuando cambia lo
 * guardado (en esta pestaña o en otra), sin `useEffect` + `setState`.
 *
 * Devuelven `null` en el servidor y durante la hidratación: el localStorage
 * sólo existe en el navegador.
 */

const sinDatosEnServidor = () => undefined;

function useCrudo(clave: string): string | null | undefined {
  return useSyncExternalStore(suscribirAlmacen, () => leerCrudo(clave), sinDatosEnServidor);
}

function parsear(crudo: string | null): unknown {
  if (!crudo) return null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

/** Las tasas BCV del búfer, de la más antigua a la más reciente. */
export function useFilasBuffer(): FilaTasa[] | null {
  const crudo = useCrudo(CLAVE);
  return useMemo(() => (crudo === undefined ? null : sanear(parsear(crudo))), [crudo]);
}

/** El USDT guardado, un valor por día. */
export function useMuestrasP2p(): MuestraP2P[] | null {
  const crudo = useCrudo(CLAVE_P2P);
  return useMemo(() => (crudo === undefined ? null : sanearMuestras(parsear(crudo))), [crudo]);
}

function suscribirRed(alCambiar: () => void): () => void {
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);
  return () => {
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}

/** Si el navegador cree que hay red. En el servidor se asume que sí. */
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribirRed,
    () => navigator.onLine,
    () => true,
  );
}
