import { NextResponse, type NextRequest } from "next/server";
import { almacen } from "@/lib/almacen";
import { hoyCaracas } from "@/lib/formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tasa BCV vigente en una fecha: la última publicada con fecha valor <= la
 * pedida. Los fines de semana y feriados no tienen publicación propia, así
 * que devuelven la del último día hábil con `es_exacta: false`.
 */
export async function GET(request: NextRequest) {
  const pedida = request.nextUrl.searchParams.get("fecha") ?? hoyCaracas();

  if (!DIA_ISO.test(pedida)) {
    return NextResponse.json(
      { error: "La fecha debe venir como AAAA-MM-DD." },
      { status: 400 },
    );
  }

  const tasa = await almacen.tasaEn(pedida);
  return NextResponse.json(
    { tasa },
    { headers: { "Cache-Control": "no-store" } },
  );
}
