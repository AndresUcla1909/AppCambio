import type { TasaBcv } from "../bcv/scraper";
import { diasEntre } from "../almacen/buffer";
import type { DiaISO } from "../formato";
import { pedirJson, type ConfigSupabase, type Opciones } from "./tasas";

/**
 * Escritura de la tasa del BCV en Supabase. **Sólo servidor**: usa la clave
 * secreta (`SUPABASE_SERVICE_ROLE_KEY`), que se salta RLS. Nunca debe llevar
 * el prefijo `NEXT_PUBLIC_`, o llegaría al navegador.
 *
 * La usa `/api/cron/bcv`, que se llama de forma programada (ver
 * supabase/cron-bcv.sql).
 */

export function configAdmin(): ConfigSupabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return { url: url.replace(/\/+$/, ""), clave };
}

type TasaGuardada = { fecha: DiaISO; usd: number; eur: number | null };

/* ------------------------------------------------------------------ */
/* Validación — pura, para poder testearla                             */
/* ------------------------------------------------------------------ */

/**
 * Una variación diaria mayor que esta se trata como error de lectura y no se
 * guarda sola. La peor del historial desde 2021 fue +11,6 % (agosto de 2022).
 */
const VARIACION_MAXIMA = 0.25;

/**
 * Revisa que la tasa leída del BCV tenga sentido antes de guardarla.
 * Devuelve el motivo del rechazo, o `null` si se puede guardar.
 *
 * - La fecha valor ronda hoy: el BCV publica la del siguiente día hábil, a
 *   lo sumo unos días por delante (feriados largos), y nunca muy atrás.
 * - El salto frente a la última publicación guardada no es absurdo.
 */
export function motivoParaNoGuardar(
  nueva: TasaBcv,
  anterior: TasaGuardada | null,
  hoy: DiaISO,
): string | null {
  const desfase = diasEntre(hoy, nueva.fecha);
  if (desfase > 7 || desfase < -10) {
    return `La fecha valor ${nueva.fecha} está demasiado lejos de hoy (${hoy}).`;
  }
  if (anterior && anterior.fecha !== nueva.fecha) {
    const salto = Math.abs(nueva.usd / anterior.usd - 1);
    if (salto > VARIACION_MAXIMA) {
      return (
        `El dólar pasaría de ${anterior.usd} (${anterior.fecha}) a ${nueva.usd} ` +
        `(${(salto * 100).toFixed(1)} %): parece un error de lectura.`
      );
    }
  }
  return null;
}

/** Si lo que ya está guardado para esa fecha es igual a lo nuevo. */
export function sinCambios(nueva: TasaBcv, existente: TasaGuardada | null): boolean {
  if (!existente) return false;
  const igual = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) < 1e-8;
  // Un euro ausente en lo nuevo no cuenta como cambio: no se borra el guardado.
  return igual(nueva.usd, existente.usd) && (nueva.eur == null || igual(nueva.eur, existente.eur));
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

function aGuardada(cruda: unknown): TasaGuardada | null {
  if (!cruda || typeof cruda !== "object") return null;
  const o = cruda as Record<string, unknown>;
  const usd = Number(o.usd);
  if (typeof o.fecha !== "string" || !(usd > 0)) return null;
  const eur = o.eur == null ? null : Number(o.eur);
  return { fecha: o.fecha, usd, eur: eur != null && eur > 0 ? eur : null };
}

/** La última publicación anterior a una fecha, y la de esa misma fecha si existe. */
async function leerVecinas(
  fecha: DiaISO,
  opciones: Opciones,
): Promise<{ misma: TasaGuardada | null; anterior: TasaGuardada | null }> {
  const filas = await pedirJson(
    opciones,
    `tasas_bcv?select=fecha,usd,eur&fecha=lte.${fecha}&order=fecha.desc&limit=2`,
    { method: "GET" },
  );
  const lista = (Array.isArray(filas) ? filas : []).map(aGuardada).filter((f) => f != null);
  const misma = lista.find((f) => f.fecha === fecha) ?? null;
  const anterior = lista.find((f) => f.fecha < fecha) ?? null;
  return { misma, anterior };
}

export type ResultadoGuardado =
  | { accion: "insertada" | "actualizada" | "sin_cambios"; tasa: TasaBcv }
  | { accion: "rechazada"; tasa: TasaBcv; motivo: string };

/**
 * Guarda la tasa del BCV en Supabase si es nueva o cambió. Es idempotente:
 * llamarla muchas veces al día con la misma tasa no escribe nada, así no se
 * mueve `actualizado_en` y los teléfonos no vuelven a bajarla.
 */
export async function guardarTasaBcv(
  tasa: TasaBcv,
  hoy: DiaISO,
  opciones: Opciones,
): Promise<ResultadoGuardado> {
  const { misma, anterior } = await leerVecinas(tasa.fecha, opciones);

  const motivo = motivoParaNoGuardar(tasa, anterior, hoy);
  if (motivo) return { accion: "rechazada", tasa, motivo };
  if (sinCambios(tasa, misma)) return { accion: "sin_cambios", tasa };

  // Sin euro en lo leído, no se manda la columna: no borra el que hubiera.
  const fila: Record<string, unknown> = { fecha: tasa.fecha, usd: tasa.usd, fuente: "bcv" };
  if (tasa.eur != null) fila.eur = tasa.eur;

  await pedirJson(opciones, "tasas_bcv?on_conflict=fecha", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([fila]),
  });
  return { accion: misma ? "actualizada" : "insertada", tasa };
}
