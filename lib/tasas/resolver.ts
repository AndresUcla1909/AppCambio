import { DIAS_MAX_SIN_ACTUALIZAR } from "../config";
import type { DiaISO } from "../formato";
import { diasEntre, enVentana } from "../almacen/buffer";
import { tasaVigenteEn } from "../almacen/logica";
import type { FilaTasa, TasaVigente } from "../almacen/tipos";

/**
 * Decide de dónde sale la tasa BCV de una fecha:
 *
 *   1. El búfer local de 60 días del teléfono (instantáneo, sin red).
 *   2. Si ahí no está, o lo que hay está desactualizado, y hay red:
 *      Supabase.
 *   3. Si nada de eso sirve: lo mejor que haya en el teléfono, marcado como
 *      desactualizado, o nada si la fecha es anterior al búfer.
 *
 * Sin React ni localStorage: recibe las filas y la consulta remota, para
 * poder testearlo.
 */

export type OrigenTasa = "local" | "supabase";

export type ResultadoTasa = {
  tasa: TasaVigente | null;
  origen: OrigenTasa | null;
  /** Días entre la fecha pedida y la de la tasa usada. */
  antiguedad: number | null;
  /** La tasa usada tiene más de `DIAS_MAX_SIN_ACTUALIZAR` días. */
  desactualizada: boolean;
  /** La fecha es anterior a los 60 días que guarda el teléfono. */
  fueraDeVentana: boolean;
};

/** Cuántos días tiene la tasa usada y si ya no es de fiar. */
export function evaluarFrescura(
  tasa: TasaVigente | null,
  fechaSolicitada: DiaISO,
  maxDias = DIAS_MAX_SIN_ACTUALIZAR,
): { antiguedad: number | null; desactualizada: boolean } {
  if (!tasa) return { antiguedad: null, desactualizada: false };
  const antiguedad = diasEntre(tasa.fecha, fechaSolicitada);
  return { antiguedad, desactualizada: antiguedad > maxDias };
}

function resultado(
  tasa: TasaVigente | null,
  origen: OrigenTasa | null,
  fecha: DiaISO,
  hoy: DiaISO,
): ResultadoTasa {
  return {
    tasa,
    origen: tasa ? origen : null,
    ...evaluarFrescura(tasa, fecha),
    fueraDeVentana: !enVentana(fecha, hoy),
  };
}

/** Lo que dice el búfer local, sin esperar a nada. */
export function resolverLocal(filas: FilaTasa[], fecha: DiaISO, hoy: DiaISO): ResultadoTasa {
  return resultado(tasaVigenteEn(filas, fecha), "local", fecha, hoy);
}

/** Si vale la pena preguntarle a Supabase por esta fecha. */
export function necesitaRemoto(local: ResultadoTasa): boolean {
  return local.tasa == null || local.desactualizada;
}

export type ConsultaRemota = (fecha: DiaISO) => Promise<TasaVigente | null>;

/**
 * Resuelve la tasa de una fecha con el orden descrito arriba. Un fallo de
 * Supabase (sin red, caído, lento) nunca rompe: se sigue con lo local.
 */
export async function resolverTasa(opciones: {
  fecha: DiaISO;
  hoy: DiaISO;
  filas: FilaTasa[];
  enLinea: boolean;
  /** `null` si Supabase no está configurado. */
  consultarRemoto: ConsultaRemota | null;
}): Promise<ResultadoTasa> {
  const { fecha, hoy, filas, enLinea, consultarRemoto } = opciones;
  const local = resolverLocal(filas, fecha, hoy);
  if (!necesitaRemoto(local) || !enLinea || !consultarRemoto) return local;

  let remota: TasaVigente | null = null;
  try {
    remota = await consultarRemoto(fecha);
  } catch {
    return local;
  }

  // Sólo se usa si mejora lo que ya había: más reciente que la local.
  if (remota && (!local.tasa || remota.fecha > local.tasa.fecha)) {
    return resultado(remota, "supabase", fecha, hoy);
  }
  return local;
}
