"use client";

import { hoyCaracas, restarDias, type DiaISO } from "../formato";
import { inicioVentana } from "../almacen/buffer";
import { fundirEnBuffer, leerFilas } from "../almacen/navegador";
import { consultarRango, consultarTasaEn, configSupabase } from "../supabase/tasas";
import { resolverTasa, type ConsultaRemota, type ResultadoTasa } from "./resolver";

/**
 * El puente entre el resolvedor (puro) y el navegador: lee el búfer, sabe si
 * hay red y si Supabase está configurado.
 */

function hayRed(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function supabaseDisponible(): boolean {
  return configSupabase() != null;
}

function consultaRemota(): ConsultaRemota | null {
  const config = configSupabase();
  return config ? (fecha) => consultarTasaEn(fecha, { config }) : null;
}

/** La tasa BCV de una fecha: búfer, luego Supabase, luego aviso. */
export function resolverTasaBcv(fecha: DiaISO, hoy: DiaISO = hoyCaracas()): Promise<ResultadoTasa> {
  return resolverTasa({
    fecha,
    hoy,
    filas: leerFilas(),
    enLinea: hayRed(),
    consultarRemoto: consultaRemota(),
  });
}

/**
 * Trae de Supabase los últimos 60 días y los funde en el búfer, para que el
 * calendario los tenga sin red. Devuelve cuántas filas llegaron, o `null` si
 * no se pudo (sin red, sin Supabase o con error).
 */
export async function sincronizarBuffer(hoy: DiaISO = hoyCaracas()): Promise<number | null> {
  const config = configSupabase();
  if (!config || !hayRed()) return null;
  try {
    // Unos días antes del inicio de la ventana, para traer también la última
    // publicación anterior a ella: es la vigente si la ventana empieza en
    // fin de semana o feriado (los huecos del BCV no pasan de 5 días).
    // El búfer conserva sólo esa ancla y descarta el resto al escribir.
    const filas = await consultarRango(restarDias(inicioVentana(hoy), 10), { config });
    // La variación se recalcula en el teléfono: sólo se guarda la tasa.
    fundirEnBuffer(
      filas.map(({ fecha, usd, eur, fuente, creado_en, actualizado_en }) => ({
        fecha,
        usd,
        eur,
        fuente,
        creado_en,
        actualizado_en,
      })),
    );
    return filas.length;
  } catch {
    return null;
  }
}
