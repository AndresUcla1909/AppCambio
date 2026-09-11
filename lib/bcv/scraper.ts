import * as cheerio from "cheerio";
import { URL_BCV, USER_AGENT } from "../config";
import type { DiaISO } from "../formato";

export type TasaBcv = {
  /** Fecha valor publicada por el BCV, no la fecha del scraping. */
  fecha: DiaISO;
  usd: number;
  eur: number | null;
};

/**
 * Convierte un número del BCV a `number`.
 * Vienen como "832,48830000" (punto de miles, coma decimal) y a veces con
 * espacios alrededor: "  968,06734453 ".
 */
export function parsearNumeroBcv(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const limpio = texto
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * Extrae la tasa del HTML de la portada del BCV.
 *
 * Estructura real (verificada el 11/09/2026):
 *   <div id="dolar"> … <strong class="strong-tb">832,48830000</strong> …
 *   <div id="euro">  … <strong class="strong-tb"> 968,06734453</strong> …
 *   <div class="pull-right dinpro center">Fecha Valor:
 *     <span class="date-display-single" content="2026-09-11T00:00:00-04:00">…
 */
export function parsearHtmlBcv(html: string): TasaBcv {
  const $ = cheerio.load(html);

  const usd = parsearNumeroBcv($("#dolar strong").first().text());
  if (usd == null) {
    throw new Error(
      "No se encontró la tasa del dólar en el HTML del BCV (selector '#dolar strong').",
    );
  }

  // El euro es opcional: si un día no lo publican, la app sigue funcionando.
  const eur = parsearNumeroBcv($("#euro strong").first().text());

  const fecha = extraerFechaValor($);
  if (!fecha) {
    throw new Error("No se encontró la fecha valor en el HTML del BCV.");
  }

  return { fecha, usd, eur };
}

/**
 * La fecha valor vive en el bloque de tasas. Hay más `date-display-single` en
 * la página (reservas, tasas de interés), así que se busca primero el del
 * contenedor correcto y sólo entonces se cae al primero del documento.
 */
function extraerFechaValor($: cheerio.CheerioAPI): DiaISO | null {
  const candidatos = [
    $("div.pull-right.dinpro.center span.date-display-single").first(),
    $("span.date-display-single").first(),
  ];

  for (const elemento of candidatos) {
    if (elemento.length === 0) continue;
    const contenido = elemento.attr("content");
    const dia = normalizarDia(contenido);
    if (dia) return dia;
  }
  return null;
}

/** "2026-09-11T00:00:00-04:00" -> "2026-09-11" */
function normalizarDia(contenido: string | undefined): DiaISO | null {
  if (!contenido) return null;
  const coincidencia = contenido.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!coincidencia) return null;
  const dia = coincidencia[1];
  // Descarta fechas absurdas por si el HTML cambia de forma.
  if (Number.isNaN(new Date(`${dia}T00:00:00Z`).getTime())) return null;
  return dia;
}

/**
 * Descarga la portada del BCV.
 *
 * El sitio ha tenido la cadena de certificados incompleta. Si eso vuelve a
 * pasar, se reintenta con validación TLS relajada **sólo para bcv.org.ve**,
 * nunca de forma global.
 */
async function descargarHtmlBcv(): Promise<string> {
  try {
    return await pedir(false);
  } catch (error) {
    if (!esErrorDeCertificado(error)) throw error;
    console.warn("[bcv] certificado inválido; reintentando sin validar TLS");
    return await pedir(true);
  }
}

async function pedir(tlsRelajado: boolean): Promise<string> {
  const opciones: RequestInit & { dispatcher?: unknown } = {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  };

  if (tlsRelajado) {
    const { Agent } = await import("undici");
    opciones.dispatcher = new Agent({
      connect: { rejectUnauthorized: false },
    });
  }

  const respuesta = await fetch(URL_BCV, opciones);
  if (!respuesta.ok) {
    throw new Error(`El BCV respondió ${respuesta.status} ${respuesta.statusText}`);
  }
  return await respuesta.text();
}

const CODIGOS_TLS = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function esErrorDeCertificado(error: unknown): boolean {
  let actual = error as { code?: string; cause?: unknown } | undefined;
  for (let i = 0; i < 5 && actual; i++) {
    if (actual.code && CODIGOS_TLS.has(actual.code)) return true;
    actual = actual.cause as typeof actual;
  }
  return false;
}

/** Descarga y parsea la tasa vigente publicada por el BCV. */
export async function obtenerTasaBcv(): Promise<TasaBcv> {
  const html = await descargarHtmlBcv();
  return parsearHtmlBcv(html);
}
