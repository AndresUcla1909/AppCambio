import { NextResponse, type NextRequest } from "next/server";
import { almacen } from "@/lib/almacen";
import { parsearMonto } from "@/lib/formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Historial completo, de la fecha más reciente a la más antigua. */
export async function GET(request: NextRequest) {
  const limiteCrudo = request.nextUrl.searchParams.get("limite");
  const limite = limiteCrudo ? Number(limiteCrudo) : undefined;

  const filas = await almacen.listar(
    Number.isFinite(limite) && limite! > 0 ? limite : undefined,
  );
  return NextResponse.json(
    { filas },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Carga o corrección manual de una tasa. */
export async function POST(request: NextRequest) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { fecha, usd, eur } = (cuerpo ?? {}) as Record<string, unknown>;

  if (typeof fecha !== "string" || !DIA_ISO.test(fecha)) {
    return NextResponse.json(
      { error: "La fecha debe venir como AAAA-MM-DD." },
      { status: 400 },
    );
  }

  const usdNumero = normalizarTasa(usd);
  if (usdNumero == null) {
    return NextResponse.json(
      { error: "El dólar debe ser un número mayor que cero." },
      { status: 400 },
    );
  }

  // El euro es opcional.
  const eurNumero =
    eur === null || eur === undefined || eur === "" ? null : normalizarTasa(eur);
  if (eur !== null && eur !== undefined && eur !== "" && eurNumero == null) {
    return NextResponse.json(
      { error: "El euro debe ser un número mayor que cero." },
      { status: 400 },
    );
  }

  const guardada = await almacen.guardar({
    fecha,
    usd: usdNumero,
    eur: eurNumero,
    fuente: "manual",
  });

  return NextResponse.json(
    { ok: true, guardada },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Acepta tanto un número como un texto escrito a mano ("832,49"). */
function normalizarTasa(valor: unknown): number | null {
  const numero =
    typeof valor === "number"
      ? valor
      : typeof valor === "string"
        ? parsearMonto(valor)
        : null;
  if (numero == null || !Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}
