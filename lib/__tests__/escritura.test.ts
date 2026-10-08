import { describe, expect, it, vi } from "vitest";
import {
  guardarTasaBcv,
  motivoParaNoGuardar,
  sinCambios,
} from "../supabase/escritura";

const CONFIG = { url: "https://demo.supabase.co", clave: "sb_secret_xyz" };
const HOY = "2026-10-07";

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("motivoParaNoGuardar", () => {
  const anterior = { fecha: "2026-10-07", usd: 873.867, eur: 984.26 };

  it("acepta la tasa de mañana con una variación normal", () => {
    expect(motivoParaNoGuardar({ fecha: "2026-10-08", usd: 875.1, eur: 985 }, anterior, HOY)).toBeNull();
  });

  it("acepta la devaluación más fuerte del historial (+11,6 %)", () => {
    expect(motivoParaNoGuardar({ fecha: "2026-10-08", usd: 975.3, eur: null }, anterior, HOY)).toBeNull();
  });

  it("rechaza un salto absurdo, típico de un error de lectura", () => {
    const motivo = motivoParaNoGuardar({ fecha: "2026-10-08", usd: 87.3867, eur: null }, anterior, HOY);
    expect(motivo).toMatch(/error de lectura/);
  });

  it("rechaza fechas valor muy lejos de hoy", () => {
    expect(motivoParaNoGuardar({ fecha: "2026-12-01", usd: 875, eur: null }, anterior, HOY)).toMatch(
      /demasiado lejos/,
    );
    expect(motivoParaNoGuardar({ fecha: "2025-01-01", usd: 875, eur: null }, null, HOY)).toMatch(
      /demasiado lejos/,
    );
  });

  it("sin publicación anterior (tabla vacía) sólo revisa la fecha", () => {
    expect(motivoParaNoGuardar({ fecha: "2026-10-08", usd: 1, eur: null }, null, HOY)).toBeNull();
  });
});

describe("sinCambios", () => {
  const guardada = { fecha: "2026-10-07", usd: 873.867, eur: 984.26261811 };

  it("igual en dólar y euro: no hay que escribir", () => {
    expect(sinCambios({ fecha: "2026-10-07", usd: 873.867, eur: 984.26261811 }, guardada)).toBe(true);
  });

  it("un euro ausente en lo leído no cuenta como cambio", () => {
    expect(sinCambios({ fecha: "2026-10-07", usd: 873.867, eur: null }, guardada)).toBe(true);
  });

  it("un euro que falta en lo guardado sí hay que completarlo", () => {
    const sinEuro = { ...guardada, eur: null };
    expect(sinCambios({ fecha: "2026-10-07", usd: 873.867, eur: 984.26261811 }, sinEuro)).toBe(false);
  });

  it("si no existía, hay que insertarla", () => {
    expect(sinCambios({ fecha: "2026-10-08", usd: 875, eur: null }, null)).toBe(false);
  });
});

describe("guardarTasaBcv", () => {
  it("inserta una fecha nueva con upsert por fecha y la clave secreta", async () => {
    const pedir = vi.fn(async (url: string) =>
      url.includes("select=")
        ? json([{ fecha: "2026-10-07", usd: 873.867, eur: 984.26 }])
        : json([{ fecha: "2026-10-08" }], 201),
    );
    const r = await guardarTasaBcv({ fecha: "2026-10-08", usd: 875.1, eur: 985.2 }, HOY, {
      config: CONFIG,
      pedir: pedir as unknown as typeof fetch,
    });

    expect(r.accion).toBe("insertada");
    const [url, init] = pedir.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://demo.supabase.co/rest/v1/tasas_bcv?on_conflict=fecha");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Prefer).toContain("resolution=merge-duplicates");
    expect(h.apikey).toBe("sb_secret_xyz");
    expect(h.Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual([
      { fecha: "2026-10-08", usd: 875.1, eur: 985.2, fuente: "bcv" },
    ]);
  });

  it("si ya está igual no escribe nada", async () => {
    const pedir = vi.fn(async () => json([{ fecha: "2026-10-07", usd: 873.867, eur: 984.26261811 }]));
    const r = await guardarTasaBcv({ fecha: "2026-10-07", usd: 873.867, eur: 984.26261811 }, HOY, {
      config: CONFIG,
      pedir: pedir as unknown as typeof fetch,
    });
    expect(r.accion).toBe("sin_cambios");
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("sin euro en lo leído no manda la columna, para no borrarlo", async () => {
    const pedir = vi.fn(async (url: string) => (url.includes("select=") ? json([]) : json([], 201)));
    await guardarTasaBcv({ fecha: "2026-10-08", usd: 875.1, eur: null }, HOY, {
      config: CONFIG,
      pedir: pedir as unknown as typeof fetch,
    });
    const [, init] = pedir.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))[0]).not.toHaveProperty("eur");
  });

  it("no guarda una tasa rechazada", async () => {
    const pedir = vi.fn(async () => json([{ fecha: "2026-10-07", usd: 873.867, eur: 984.26 }]));
    const r = await guardarTasaBcv({ fecha: "2026-10-08", usd: 8.73867, eur: null }, HOY, {
      config: CONFIG,
      pedir: pedir as unknown as typeof fetch,
    });
    expect(r.accion).toBe("rechazada");
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
