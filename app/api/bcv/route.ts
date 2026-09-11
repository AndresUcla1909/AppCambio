import { NextResponse } from "next/server";
import { obtenerTasaBcv } from "@/lib/bcv/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devuelve la tasa que el BCV publica ahora mismo. **No la guarda**: el
 * historial vive en el navegador de quien usa la app.
 *
 * Este rodeo por el servidor es obligatorio: bcv.org.ve no envía cabeceras
 * CORS, así que el navegador no puede leerlo directamente.
 */
export async function GET() {
  try {
    const tasa = await obtenerTasaBcv();
    return NextResponse.json(tasa, {
      headers: {
        // El BCV publica una vez al día; media hora de caché es de sobra y
        // evita machacar su servidor.
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/bcv]", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "No se pudo leer el BCV" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
