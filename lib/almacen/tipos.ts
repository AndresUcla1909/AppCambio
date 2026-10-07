import type { DiaISO } from "../formato";

export type FuenteTasa = "bcv" | "api_respaldo" | "manual";

/** Una fila de `tasas_bcv`: la tasa oficial de una fecha valor. */
export type FilaTasa = {
  fecha: DiaISO;
  usd: number;
  eur: number | null;
  fuente: FuenteTasa;
  creado_en: string;
  actualizado_en: string;
};

/** Fila del historial con la variación respecto a la publicación anterior. */
export type FilaTasaConVariacion = FilaTasa & {
  usd_anterior: number | null;
  eur_anterior: number | null;
};

/**
 * Resultado de pedir "la tasa vigente el día X".
 * Equivale a la función `tasa_bcv_en(p_fecha)` del SPEC.
 */
export type TasaVigente = {
  fecha: DiaISO;
  usd: number;
  eur: number | null;
  usd_anterior: number | null;
  eur_anterior: number | null;
  fuente: FuenteTasa;
  /** El día que pidió el usuario. */
  fecha_solicitada: DiaISO;
  /** `false` si ese día no tuvo publicación (fin de semana, feriado). */
  es_exacta: boolean;
};

/**
 * El USDT de un día, tal como se vio por última vez. No es una tasa oficial:
 * sirve para mostrarlo sin conexión y para consultar días pasados.
 */
export type MuestraP2P = {
  dia: DiaISO;
  precio: number;
  /** Cuándo se obtuvo, en ISO. */
  obtenidoEn: string;
};

/** Lo que hay que aportar para guardar una tasa. */
export type TasaNueva = {
  fecha: DiaISO;
  usd: number;
  eur: number | null;
  fuente: FuenteTasa;
};
