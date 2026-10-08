import type { DiaISO } from "../formato";
import type { FilaTasaConVariacion, FuenteTasa, TasaVigente } from "../almacen/tipos";

/**
 * Lectura del historial del BCV guardado en Supabase.
 *
 * Sólo lee, con la clave anónima (pública por diseño: RLS sólo permite
 * `select`). Va directo a la API REST de PostgREST con `fetch`, sin el SDK:
 * son dos consultas y así no pesa en el teléfono.
 *
 * Es opcional: sin las variables de entorno, `configSupabase()` devuelve
 * `null` y la app vive sólo con el búfer local.
 */

export type ConfigSupabase = { url: string; clave: string };

type Pedir = typeof fetch;

export type Opciones = {
  config: ConfigSupabase;
  /** Para los tests. Por defecto, el `fetch` del navegador. */
  pedir?: Pedir;
  timeoutMs?: number;
};

export class ErrorSupabase extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorSupabase";
  }
}

/** Una consulta lenta no debe dejar la calculadora esperando. */
const TIMEOUT_MS = 8000;

export function configSupabase(): ConfigSupabase | null {
  // Acceso literal: Next sólo incrusta en el cliente `process.env.NEXT_PUBLIC_*` escrito así.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return { url: url.replace(/\/+$/, ""), clave };
}

/** La tasa vigente en una fecha según Supabase (`tasa_bcv_en`). `null` si no hay ninguna. */
export async function consultarTasaEn(
  fecha: DiaISO,
  opciones: Opciones,
): Promise<TasaVigente | null> {
  const filas = await pedirJson(opciones, "rpc/tasa_bcv_en", {
    method: "POST",
    body: JSON.stringify({ p_fecha: fecha }),
  });
  if (!Array.isArray(filas) || filas.length === 0) return null;
  return aTasaVigente(filas[0], fecha);
}

/** Supabase devuelve como mucho 1000 filas por consulta (`max-rows`). */
const TAMANO_PAGINA = 1000;

/**
 * Las publicaciones desde una fecha (o todas, con `desde = null`), de la más
 * reciente a la más antigua, igual que `historial()` del almacén local.
 * Pide página tras página hasta traerlas todas.
 */
export async function consultarRango(
  desde: DiaISO | null,
  opciones: Opciones,
): Promise<FilaTasaConVariacion[]> {
  const filtro = desde ? `&fecha=gte.${desde}` : "";
  const resultado: FilaTasaConVariacion[] = [];

  for (let desplazamiento = 0; ; desplazamiento += TAMANO_PAGINA) {
    const pagina = await pedirJson(
      opciones,
      `tasas_bcv_con_variacion?select=*&order=fecha.desc${filtro}` +
        `&limit=${TAMANO_PAGINA}&offset=${desplazamiento}`,
      { method: "GET" },
    );
    if (!Array.isArray(pagina)) break;
    for (const cruda of pagina) {
      const fila = aFilaConVariacion(cruda);
      if (fila) resultado.push(fila);
    }
    if (pagina.length < TAMANO_PAGINA) break;
  }
  return resultado;
}

/* ------------------------------------------------------------------ */
/* Conversión — pura, para poder testearla                             */
/* ------------------------------------------------------------------ */

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const FUENTES = new Set<FuenteTasa>(["bcv", "api_respaldo", "manual"]);

/** PostgREST devuelve `numeric` como número o como texto según la versión. */
function numero(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Postgres responde "2026-10-06 20:00:00.123456+00:00"; el teléfono guarda
 * "2026-10-06T20:00:00.123Z". Se normaliza para poder compararlos como texto
 * al fundir (gana la más reciente).
 */
function instante(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function fuente(valor: unknown): FuenteTasa {
  return typeof valor === "string" && FUENTES.has(valor as FuenteTasa)
    ? (valor as FuenteTasa)
    : "bcv";
}

export function aTasaVigente(cruda: unknown, solicitada: DiaISO): TasaVigente | null {
  if (!cruda || typeof cruda !== "object") return null;
  const o = cruda as Record<string, unknown>;
  const usd = numero(o.usd);
  if (typeof o.fecha !== "string" || !DIA_ISO.test(o.fecha) || usd == null) return null;
  return {
    fecha: o.fecha,
    usd,
    eur: numero(o.eur),
    usd_anterior: numero(o.usd_anterior),
    eur_anterior: numero(o.eur_anterior),
    fuente: fuente(o.fuente),
    fecha_solicitada: solicitada,
    es_exacta: o.fecha === solicitada,
  };
}

export function aFilaConVariacion(cruda: unknown): FilaTasaConVariacion | null {
  if (!cruda || typeof cruda !== "object") return null;
  const o = cruda as Record<string, unknown>;
  const usd = numero(o.usd);
  if (typeof o.fecha !== "string" || !DIA_ISO.test(o.fecha) || usd == null) return null;
  const creado = instante(o.creado_en) ?? "";
  return {
    fecha: o.fecha,
    usd,
    eur: numero(o.eur),
    fuente: fuente(o.fuente),
    creado_en: creado,
    actualizado_en: instante(o.actualizado_en) ?? creado,
    usd_anterior: numero(o.usd_anterior),
    eur_anterior: numero(o.eur_anterior),
  };
}

/* ------------------------------------------------------------------ */
/* Red                                                                 */
/* ------------------------------------------------------------------ */

/**
 * La clave va siempre en `apikey`. En `Authorization` sólo si es un JWT (la
 * clave `anon` de siempre): las claves nuevas (`sb_publishable_…`) no lo son
 * y Supabase rechaza la petición si llegan como Bearer.
 */
export function cabeceras(clave: string): Record<string, string> {
  const esJwt = clave.split(".").length === 3;
  return {
    apikey: clave,
    ...(esJwt ? { Authorization: `Bearer ${clave}` } : {}),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Una petición a la API REST de Supabase. También la usa el servidor para escribir. */
export async function pedirJson(
  { config, pedir = (...args) => fetch(...args), timeoutMs = TIMEOUT_MS }: Opciones,
  ruta: string,
  init: RequestInit,
): Promise<unknown> {
  let respuesta: Response;
  try {
    respuesta = await pedir(`${config.url}/rest/v1/${ruta}`, {
      ...init,
      headers: { ...cabeceras(config.clave), ...(init.headers as Record<string, string>) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ErrorSupabase(`No se pudo contactar a Supabase: ${(error as Error).message}`);
  }
  if (!respuesta.ok) {
    // El cuerpo trae el motivo (p. ej. una regla de RLS): sirve en los logs.
    const detalle = await respuesta.text().catch(() => "");
    throw new ErrorSupabase(
      `Supabase respondió ${respuesta.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`,
    );
  }
  try {
    return await respuesta.json();
  } catch {
    throw new ErrorSupabase("Supabase devolvió una respuesta ilegible.");
  }
}
