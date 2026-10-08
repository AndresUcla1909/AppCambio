import { describe, expect, it, vi } from "vitest";
import {
  aFilaConVariacion,
  aTasaVigente,
  cabeceras,
  consultarRango,
  consultarTasaEn,
  ErrorSupabase,
} from "../supabase/tasas";

const CONFIG = { url: "https://demo.supabase.co", clave: "anon-123" };

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("aTasaVigente", () => {
  it("convierte la fila de tasa_bcv_en, con numeric como texto", () => {
    const tasa = aTasaVigente(
      {
        fecha: "2026-09-11",
        usd: "832.48830000",
        eur: 968.06734453,
        usd_anterior: null,
        eur_anterior: "960.5",
        fuente: "bcv",
      },
      "2026-09-13",
    );
    expect(tasa).toEqual({
      fecha: "2026-09-11",
      usd: 832.4883,
      eur: 968.06734453,
      usd_anterior: null,
      eur_anterior: 960.5,
      fuente: "bcv",
      fecha_solicitada: "2026-09-13",
      es_exacta: false,
    });
  });

  it("descarta filas sin fecha o sin dólar válidos", () => {
    expect(aTasaVigente({ fecha: "11/09/2026", usd: 1 }, "2026-09-11")).toBeNull();
    expect(aTasaVigente({ fecha: "2026-09-11", usd: 0 }, "2026-09-11")).toBeNull();
    expect(aTasaVigente(null, "2026-09-11")).toBeNull();
  });
});

describe("aFilaConVariacion", () => {
  it("usa creado_en si falta actualizado_en y una fuente desconocida pasa a bcv", () => {
    const fila = aFilaConVariacion({
      fecha: "2026-09-15",
      usd: 842.2,
      eur: null,
      fuente: "otra",
      creado_en: "2026-09-12T20:00:00Z",
    });
    expect(fila?.fuente).toBe("bcv");
    expect(fila?.actualizado_en).toBe("2026-09-12T20:00:00.000Z");
    expect(fila?.eur).toBeNull();
  });

  it("normaliza las marcas de tiempo de Postgres a ISO en UTC", () => {
    const fila = aFilaConVariacion({
      fecha: "2026-10-06",
      usd: 915,
      creado_en: "2026-10-06 16:00:00.123456-04:00",
      actualizado_en: "2026-10-06 20:00:00.5+00:00",
    });
    expect(fila?.creado_en).toBe("2026-10-06T20:00:00.123Z");
    expect(fila?.actualizado_en).toBe("2026-10-06T20:00:00.500Z");
  });
});

describe("consultarTasaEn", () => {
  it("llama al RPC con la clave anónima y la fecha", async () => {
    const pedir = vi.fn(async () =>
      respuestaJson([{ fecha: "2026-09-15", usd: 842.2, eur: 977.8, fuente: "bcv" }]),
    );
    const tasa = await consultarTasaEn("2026-09-15", { config: CONFIG, pedir });

    expect(tasa?.usd).toBe(842.2);
    expect(tasa?.es_exacta).toBe(true);
    const [url, init] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://demo.supabase.co/rest/v1/rpc/tasa_bcv_en");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ p_fecha: "2026-09-15" });
    expect((init.headers as Record<string, string>).apikey).toBe("anon-123");
  });

  it("devuelve null si no hay ninguna tasa anterior", async () => {
    const pedir = vi.fn(async () => respuestaJson([]));
    expect(await consultarTasaEn("2020-01-01", { config: CONFIG, pedir })).toBeNull();
  });

  it("convierte errores de red y de HTTP en ErrorSupabase", async () => {
    const caida = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(consultarTasaEn("2026-09-15", { config: CONFIG, pedir: caida })).rejects.toThrow(
      ErrorSupabase,
    );

    const error500 = vi.fn(async () => respuestaJson({ message: "x" }, 500));
    await expect(
      consultarTasaEn("2026-09-15", { config: CONFIG, pedir: error500 }),
    ).rejects.toThrow("Supabase respondió 500");
  });
});

describe("cabeceras", () => {
  it("la clave publishable nueva va sólo en apikey", () => {
    const h = cabeceras("sb_publishable_abc123");
    expect(h.apikey).toBe("sb_publishable_abc123");
    expect(h.Authorization).toBeUndefined();
  });

  it("la clave anon (JWT) va también como Bearer", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma";
    expect(cabeceras(jwt).Authorization).toBe(`Bearer ${jwt}`);
  });
});

describe("consultarRango", () => {
  it("filtra desde la fecha pedida y descarta filas inválidas", async () => {
    const pedir = vi.fn(async () =>
      respuestaJson([
        { fecha: "2026-09-15", usd: 842.2, usd_anterior: 832.5 },
        { fecha: "roto", usd: 1 },
        { fecha: "2026-09-11", usd: 832.5 },
      ]),
    );
    const filas = await consultarRango("2026-08-01", { config: CONFIG, pedir });

    expect(filas.map((f) => f.fecha)).toEqual(["2026-09-15", "2026-09-11"]);
    expect(filas[0].usd_anterior).toBe(832.5);
    const [url] = pedir.mock.calls[0] as unknown as [string];
    expect(url).toContain(
      "tasas_bcv_con_variacion?select=*&order=fecha.desc&fecha=gte.2026-08-01&limit=1000&offset=0",
    );
  });

  it("pide página tras página: Supabase corta en 1000 filas", async () => {
    // 1206 publicaciones: una página llena de 1000 y otra de 206.
    const todas = Array.from({ length: 1206 }, (_, i) => ({
      fecha: new Date(Date.UTC(2021, 9, 4) + i * 86_400_000).toISOString().slice(0, 10),
      usd: 4 + i,
    }));
    const pedir = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      return respuestaJson(todas.slice(offset, offset + 1000));
    });
    const filas = await consultarRango(null, { config: CONFIG, pedir: pedir as unknown as typeof fetch });

    expect(filas).toHaveLength(1206);
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(String(pedir.mock.calls[1][0])).toContain("offset=1000");
  });

  it("sin fecha pide todo el historial", async () => {
    const pedir = vi.fn(async () => respuestaJson([]));
    await consultarRango(null, { config: CONFIG, pedir });
    const [url] = pedir.mock.calls[0] as unknown as [string];
    expect(url).not.toContain("gte.");
  });
});
