"use client";

import { useAplicarTema } from "@/lib/useTema";

/** Sin interfaz: mantiene <html> con el tema elegido mientras la app está abierta. */
export function AplicarTema() {
  useAplicarTema();
  return null;
}
