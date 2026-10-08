import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { obtenerTasaBcv, type TasaBcv } from "@/lib/bcv/scraper";
import { hoyCaracas } from "@/lib/formato";
import { configAdmin, guardarTasaBcv } from "@/lib/supabase/escritura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tope de la función en Vercel. El peor caso es el BCV colgado (TIMEOUT_BCV_MS,
 * 12 s) más leer y escribir en Supabase (5 s cada una): 22 s. Con 30 s siempre
 * se alcanza a responder con el error en vez de que Vercel corte a ciegas.
 */
export const maxDuration = 30;

/** Supabase está en la misma región que la función (São Paulo): responde rápido. */
const TIMEOUT_SUPABASE_MS = 5000;

/**
 * Captura programada: lee la tasa que publica el BCV y la guarda en Supabase.
 *
 * La llama Vercel Cron de lunes a viernes (vercel.json), y opcionalmente
 * Supabase Cron (supabase/cron-bcv.sql), con `Authorization: Bearer <CRON_SECRET>`.
 * Es idempotente: si la tasa ya está guardada no escribe nada, así que
 * llamarla de más no hace daño.
 *
 * Acepta GET y POST: Vercel Cron llama con GET y pg_net con POST.
 */

const SIN_CACHE = { "Cache-Control": "no-store" };

function responder(cuerpo: Record<string, unknown>, status = 200) {
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

/** Compara en tiempo constante, para no filtrar el secreto letra a letra. */
function autorizado(peticion: Request, secreto: string): boolean {
  const recibido = Buffer.from(peticion.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

async function capturar(peticion: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("[cron/bcv] falta CRON_SECRET");
    return responder({ ok: false, error: "CRON_SECRET no está configurado." }, 500);
  }
  if (!autorizado(peticion, secreto)) {
    return responder({ ok: false, error: "No autorizado." }, 401);
  }

  const config = configAdmin();
  if (!config) {
    console.error("[cron/bcv] falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL");
    return responder({ ok: false, error: "Supabase no está configurado en el servidor." }, 500);
  }

  let tasa: TasaBcv;
  try {
    tasa = await obtenerTasaBcv();
  } catch (error) {
    console.error("[cron/bcv] no se pudo leer el BCV:", error);
    return responder({ ok: false, error: `No se pudo leer el BCV: ${(error as Error).message}` }, 502);
  }

  try {
    const resultado = await guardarTasaBcv(tasa, hoyCaracas(), {
      config,
      timeoutMs: TIMEOUT_SUPABASE_MS,
    });
    if (resultado.accion === "rechazada") {
      // No es un fallo de red: hace falta que una persona lo mire.
      console.warn("[cron/bcv] tasa rechazada:", resultado.motivo, tasa);
      return responder({ ok: false, ...resultado }, 422);
    }
    console.log(`[cron/bcv] ${resultado.accion}:`, tasa);
    return responder({ ok: true, ...resultado });
  } catch (error) {
    console.error("[cron/bcv] no se pudo guardar en Supabase:", error);
    return responder({ ok: false, error: (error as Error).message, tasa }, 502);
  }
}

export { capturar as GET, capturar as POST };
