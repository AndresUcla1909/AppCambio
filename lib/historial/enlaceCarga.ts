import type { DiaISO } from "../formato";

/**
 * El enlace "Cargarla manualmente" de la calculadora lleva al historial con
 * el formulario abierto y la fecha que se estaba viendo: `#cargar=AAAA-MM-DD`.
 */

const PREFIJO = "#cargar";

export function enlaceCargar(dia: DiaISO): string {
  return `/historial${PREFIJO}=${dia}`;
}

/**
 * Lee el `location.hash`. `null` si no pide abrir el formulario; si lo pide,
 * la fecha (o `null` en `dia` si no trae una válida).
 */
export function leerEnlaceCargar(hash: string): { dia: DiaISO | null } | null {
  if (hash !== PREFIJO && !hash.startsWith(`${PREFIJO}=`)) return null;
  const dia = hash.slice(PREFIJO.length + 1);
  return { dia: esDiaValido(dia) ? dia : null };
}

/** "2026-02-31" tiene la forma correcta pero no existe: se descarta. */
function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [anio, mes, dd] = dia.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dd));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dd;
}
