import { ZONA_HORARIA } from "./config";

/* ------------------------------------------------------------------ */
/* Números                                                             */
/* ------------------------------------------------------------------ */

/**
 * Interpreta un monto escrito a mano y devuelve el número, o `null` si no
 * se entiende. Acepta las dos convenciones que la gente usa en la práctica:
 *
 *   "1.234,56"  -> 1234.56   (es-VE: punto de miles, coma decimal)
 *   "1234.56"   -> 1234.56   (en-US o teclado numérico)
 *   "1.000"     -> 1000      (miles: tres dígitos tras un punto único)
 *   "0.500"     -> 0.5       (salvo que la parte entera sea 0)
 *
 * Rechaza negativos: aquí sólo hay montos.
 */
export function parsearMonto(entrada: string): number | null {
  if (typeof entrada !== "string") return null;

  // Fuera espacios (incluidos los no separables del formateo), moneda y "Bs".
  const texto = entrada
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/[$€]/g, "")
    .replace(/bs\.?/gi, "");

  if (!texto) return null;
  if (!/^[0-9.,]+$/.test(texto)) return null;

  const comas = (texto.match(/,/g) ?? []).length;
  const puntos = (texto.match(/\./g) ?? []).length;

  let normalizado: string;

  if (comas > 0 && puntos > 0) {
    // Con ambos separadores, el que aparece de último es el decimal.
    normalizado =
      texto.lastIndexOf(",") > texto.lastIndexOf(".")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
  } else if (comas > 0) {
    // Una sola coma es decimal (convención venezolana); varias son miles.
    normalizado = comas === 1 ? texto.replace(",", ".") : texto.replace(/,/g, "");
  } else if (puntos > 1) {
    normalizado = texto.replace(/\./g, "");
  } else if (puntos === 1) {
    const [entero, decimal] = texto.split(".");
    // "1.000" en Venezuela son mil, no uno; pero "0.500" sí es medio.
    const pareceMiles = decimal.length === 3 && entero !== "" && entero !== "0";
    normalizado = pareceMiles ? entero + decimal : texto;
  } else {
    normalizado = texto;
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero;
}

const fmtMonto = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtTasa = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Monto de dinero: siempre con dos decimales. */
export function formatearMonto(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return fmtMonto.format(n);
}

/** Tasa de cambio: hasta cuatro decimales, sin ceros de relleno inútiles. */
export function formatearTasa(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return fmtTasa.format(n);
}

/** Variación o brecha, con signo explícito: "+1,25 %". */
export function formatearPorcentaje(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const signo = n > 0 ? "+" : "";
  return `${signo}${fmtMonto.format(n)} %`;
}

/** Variación porcentual entre dos tasas. `null` si no hay con qué comparar. */
export function calcularVariacion(
  actual: number | null | undefined,
  anterior: number | null | undefined,
): number | null {
  if (actual == null || anterior == null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior === 0) {
    return null;
  }
  return (actual / anterior - 1) * 100;
}

/** Brecha del USDT frente al dólar BCV, en por ciento. */
export function calcularBrecha(
  usdt: number | null | undefined,
  bcv: number | null | undefined,
): number | null {
  return calcularVariacion(usdt, bcv);
}

/* ------------------------------------------------------------------ */
/* Fechas — siempre en horario de Caracas                              */
/* ------------------------------------------------------------------ */

/** Un día del calendario, en formato "AAAA-MM-DD". */
export type DiaISO = string;

const fmtDiaCaracas = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** El día que es "hoy" en Caracas, sin importar dónde corra el servidor. */
export function hoyCaracas(): DiaISO {
  return fmtDiaCaracas.format(new Date());
}

/** Convierte un instante a su día de calendario en Caracas. */
export function diaEnCaracas(fecha: Date): DiaISO {
  return fmtDiaCaracas.format(fecha);
}

/** Un `Date` del calendario (medianoche local) al día ISO que representa. */
export function fechaADia(fecha: Date): DiaISO {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Día ISO a `Date` en medianoche local, para el calendario. */
export function diaAFecha(dia: DiaISO): Date {
  const [anio, mes, dd] = dia.split("-").map(Number);
  return new Date(anio, mes - 1, dd);
}

/** "2026-09-11" -> "11/09/2026" */
export function formatearDia(dia: DiaISO | null | undefined): string {
  if (!dia) return "—";
  const [anio, mes, dd] = dia.split("-");
  if (!anio || !mes || !dd) return "—";
  return `${dd}/${mes}/${anio}`;
}

/** "2026-09-11" -> "viernes, 11 de septiembre" */
export function formatearDiaLargo(dia: DiaISO | null | undefined): string {
  if (!dia) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(diaAFecha(dia));
}

/** Marca de tiempo completa: "11/09/2026, 04:32 p. m." */
export function formatearInstante(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
}

/** Sólo la hora: "04:32 p. m." */
export function formatearHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
}

/** Resta días a un día ISO, respetando el calendario. */
export function restarDias(dia: DiaISO, dias: number): DiaISO {
  const fecha = diaAFecha(dia);
  fecha.setDate(fecha.getDate() - dias);
  return fechaADia(fecha);
}
