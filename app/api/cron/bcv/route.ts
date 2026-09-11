import { NextResponse, type NextRequest } from "next/server";
import { obtenerTasaBcv } from "@/lib/bcv/scraper";
import { almacen } from "@/lib/almacen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Captura la tasa del BCV y la guarda por su **fecha valor**.
 *
 * Es idempotente: el BCV publica por la tarde la tasa del siguiente día
 * hábil, así que llamar a esto varias veces al día actualiza la misma fila
 * en vez de duplicarla.
 *
 * Lo protege `CRON_SECRET`. En desarrollo, si la variable no está definida,
 * se permite la llamada para poder probar desde localhost.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const enviado = request.headers.get("authorization");

  if (secreto) {
    if (enviado !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // En producción, sin secreto configurado el endpoint queda cerrado.
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor" },
      { status: 500 },
    );
  }

  try {
    const tasa = await obtenerTasaBcv();
    const guardada = await almacen.guardar({
      fecha: tasa.fecha,
      usd: tasa.usd,
      eur: tasa.eur,
      fuente: "bcv",
    });
    return NextResponse.json(
      { ok: true, guardada },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/cron/bcv]", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Falló la captura del BCV" },
      { status: 502 },
    );
  }
}

/** Cómodo para dispararlo desde el navegador durante el desarrollo. */
export async function GET(request: NextRequest) {
  return POST(request);
}
