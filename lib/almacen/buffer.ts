import { DIAS_BUFFER } from "../config";
import { diaEnCaracas, restarDias, type DiaISO } from "../formato";
import { ordenarAscendente } from "./logica";
import type { FilaTasa, MuestraP2P } from "./tipos";

/**
 * El búfer rotativo del teléfono: sólo se guardan los últimos `DIAS_BUFFER`
 * días de tasas BCV y de USDT. Lo anterior se descarta solo, cada vez que se
 * escribe; si hace falta, se consulta en Supabase cuando hay red.
 *
 * Funciones puras, para poder testearlas.
 */

/** El primer día que todavía entra en el búfer. */
export function inicioVentana(hoy: DiaISO, dias = DIAS_BUFFER): DiaISO {
  return restarDias(hoy, dias);
}

/** Si una fecha cae dentro del búfer (las futuras también: fecha valor de mañana). */
export function enVentana(fecha: DiaISO, hoy: DiaISO, dias = DIAS_BUFFER): boolean {
  return fecha >= inicioVentana(hoy, dias);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: DiaISO, hasta: DiaISO): number {
  const aUtc = (dia: DiaISO) => {
    const [anio, mes, dd] = dia.split("-").map(Number);
    return Date.UTC(anio, mes - 1, dd);
  };
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

/**
 * Deja sólo las tasas de la ventana, más la última anterior a ella: es la
 * vigente el primer día de la ventana si ese día no hubo publicación (un
 * sábado, por ejemplo), y la referencia para su variación.
 */
export function recortarFilas(
  filas: FilaTasa[],
  hoy: DiaISO,
  dias = DIAS_BUFFER,
): FilaTasa[] {
  const inicio = inicioVentana(hoy, dias);
  const ordenadas = ordenarAscendente(filas);
  const primeraDentro = ordenadas.findIndex((f) => f.fecha >= inicio);
  if (primeraDentro === -1) {
    // Todo es viejo: se conserva sólo la más reciente como ancla.
    return ordenadas.slice(-1);
  }
  return ordenadas.slice(Math.max(0, primeraDentro - 1));
}

/* ------------------------------------------------------------------ */
/* USDT                                                                */
/* ------------------------------------------------------------------ */

/** Ordena las muestras de la más antigua a la más reciente. */
function ordenarMuestras(muestras: MuestraP2P[]): MuestraP2P[] {
  return [...muestras].sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Registra el USDT recién visto. Se guarda uno por día (el último que se
 * vio), así el búfer no crece con cada refresco.
 */
export function registrarMuestraP2p(
  muestras: MuestraP2P[],
  precio: number,
  obtenidoEn: string,
): MuestraP2P[] {
  const instante = new Date(obtenidoEn);
  if (!(precio > 0) || Number.isNaN(instante.getTime())) return muestras;

  const dia = diaEnCaracas(instante);
  const existente = muestras.find((m) => m.dia === dia);
  // Una respuesta vieja (de una caché) no pisa una más reciente del mismo día.
  if (existente && existente.obtenidoEn >= obtenidoEn) return muestras;

  return ordenarMuestras([
    ...muestras.filter((m) => m.dia !== dia),
    { dia, precio, obtenidoEn },
  ]);
}

export function recortarMuestras(
  muestras: MuestraP2P[],
  hoy: DiaISO,
  dias = DIAS_BUFFER,
): MuestraP2P[] {
  return muestras.filter((m) => enVentana(m.dia, hoy, dias));
}

/** El USDT visto ese día, si lo hay. */
export function muestraDelDia(muestras: MuestraP2P[], dia: DiaISO): MuestraP2P | null {
  return muestras.find((m) => m.dia === dia) ?? null;
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Valida muestras que vienen del localStorage; descarta lo que no tenga forma. */
export function sanearMuestras(datos: unknown): MuestraP2P[] {
  if (!Array.isArray(datos)) return [];
  const porDia = new Map<string, MuestraP2P>();
  for (const cruda of datos) {
    if (!cruda || typeof cruda !== "object") continue;
    const o = cruda as Record<string, unknown>;
    const precio = Number(o.precio);
    if (typeof o.dia !== "string" || !DIA_ISO.test(o.dia)) continue;
    if (typeof o.obtenidoEn !== "string" || !(precio > 0)) continue;
    if (!porDia.has(o.dia)) porDia.set(o.dia, { dia: o.dia, precio, obtenidoEn: o.obtenidoEn });
  }
  return ordenarMuestras([...porDia.values()]);
}
