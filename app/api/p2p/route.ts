import { NextResponse } from "next/server";
import { CACHE_P2P_SEGUNDOS } from "@/lib/config";
import { ErrorP2P, obtenerPrecioP2P } from "@/lib/binance/p2p";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Binance bloquea peticiones desde IPs de Estados Unidos. La región de
// despliegue (São Paulo) se fija en vercel.json: Next 16 dejó obsoleto el
// antiguo `export const preferredRegion`.

export async function GET() {
  try {
    const precio = await obtenerPrecioP2P();
    return NextResponse.json(precio, {
      headers: {
        // El precio no se guarda en base de datos: lo cachea el CDN, una hora.
        "Cache-Control": `public, s-maxage=${CACHE_P2P_SEGUNDOS}, stale-while-revalidate=300`,
      },
    });
  } catch (error) {
    const esDeP2P = error instanceof ErrorP2P;
    const mensaje = esDeP2P
      ? error.message
      : "No se pudo obtener el precio de Binance P2P.";
    console.error("[api/p2p]", error);
    return NextResponse.json(
      { error: mensaje },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
