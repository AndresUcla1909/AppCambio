"use server";

import { revalidatePath } from "next/cache";
import { obtenerTasaBcv } from "@/lib/bcv/scraper";
import { almacen } from "@/lib/almacen";
import { formatearDia, formatearTasa } from "@/lib/formato";

export type ResultadoActualizacion =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string };

/**
 * Dispara la captura del BCV desde el servidor.
 *
 * Va por acción de servidor a propósito: así el navegador nunca ve el
 * `CRON_SECRET` ni necesita llamar al endpoint protegido.
 */
export async function actualizarBcvAhora(): Promise<ResultadoActualizacion> {
  try {
    const tasa = await obtenerTasaBcv();
    await almacen.guardar({
      fecha: tasa.fecha,
      usd: tasa.usd,
      eur: tasa.eur,
      fuente: "bcv",
    });

    revalidatePath("/");
    revalidatePath("/historial");

    return {
      ok: true,
      mensaje: `Guardada la tasa del ${formatearDia(tasa.fecha)}: Bs ${formatearTasa(tasa.usd)}`,
    };
  } catch (error) {
    return {
      ok: false,
      mensaje: (error as Error).message ?? "No se pudo actualizar",
    };
  }
}
