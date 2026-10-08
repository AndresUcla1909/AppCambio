import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obtenerTasaBcv, type TasaBcv } from "../bcv/scraper";
import { GET, POST, maxDuration } from "@/app/api/cron/bcv/route";

// El BCV real no se toca: el scraper se prueba aparte (bcv.test.ts).
vi.mock("../bcv/scraper", () => ({ obtenerTasaBcv: vi.fn() }));
const scraper = vi.mocked(obtenerTasaBcv);

const SECRETO = "secreto-de-prueba";
const CLAVE_ADMIN = "sb_secret_xyz";
const URL_SUPABASE = "https://demo.supabase.co";
const MANANA: TasaBcv = { fecha: "2026-10-08", usd: 875.1, eur: 985.2 };

/** Supabase falso: responde en orden y anota lo que se le pidió. */
let pedidos: { url: string; init: RequestInit }[] = [];
function supabaseResponde(...respuestas: Response[]) {
  pedidos = [];
  const cola = [...respuestas];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      const siguiente = cola.shift();
      if (!siguiente) throw new Error(`Pedido inesperado a ${url}`);
      return siguiente;
    }),
  );
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function peticion(authorization?: string, method = "GET"): Request {
  return new Request("http://localhost/api/cron/bcv", {
    method,
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRETO);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", CLAVE_ADMIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE);
  // Tarde del 07/10 en Caracas: el BCV ya publicó la del 08/10.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T21:00:00Z"));
  scraper.mockReset();
  supabaseResponde();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/cron/bcv: autorización", () => {
  it.each([
    ["sin cabecera", undefined],
    ["con otro secreto", "Bearer otro-secreto"],
    ["sin el prefijo Bearer", SECRETO],
    ["con el secreto como prefijo de otro", `Bearer ${SECRETO}x`],
  ])("responde 401 %s y no toca ni el BCV ni Supabase", async (_caso, cabecera) => {
    const respuesta = await GET(peticion(cabecera));

    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual({ ok: false, error: "No autorizado." });
    expect(scraper).not.toHaveBeenCalled();
    expect(pedidos).toHaveLength(0);
  });

  it("responde 500 si el servidor no tiene CRON_SECRET, en vez de dejar pasar a cualquiera", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const respuesta = await GET(peticion("Bearer "));

    expect(respuesta.status).toBe(500);
    expect(scraper).not.toHaveBeenCalled();
  });

  it("no deja que la respuesta se guarde en caché", async () => {
    const respuesta = await GET(peticion());
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/cron/bcv: captura", () => {
  const autorizada = () => peticion(`Bearer ${SECRETO}`);

  it("guarda una tasa nueva con la clave secreta y responde 200", async () => {
    scraper.mockResolvedValue(MANANA);
    supabaseResponde(
      json([{ fecha: "2026-10-07", usd: 873.867, eur: 984.26 }]),
      json([{ ...MANANA, fuente: "bcv" }], 201),
    );

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, accion: "insertada", tasa: MANANA });

    expect(pedidos).toHaveLength(2);
    const [lectura, escritura] = pedidos;
    expect(lectura.url).toContain(`${URL_SUPABASE}/rest/v1/tasas_bcv?`);
    expect(escritura.url).toBe(`${URL_SUPABASE}/rest/v1/tasas_bcv?on_conflict=fecha`);
    expect(escritura.init.method).toBe("POST");
    expect((escritura.init.headers as Record<string, string>).apikey).toBe(CLAVE_ADMIN);
    expect(JSON.parse(escritura.init.body as string)).toEqual([
      { fecha: "2026-10-08", usd: 875.1, eur: 985.2, fuente: "bcv" },
    ]);
  });

  it("también acepta POST, que es como llama Supabase Cron", async () => {
    scraper.mockResolvedValue(MANANA);
    supabaseResponde(json([]), json([MANANA], 201));

    const respuesta = await POST(peticion(`Bearer ${SECRETO}`, "POST"));
    expect(respuesta.status).toBe(200);
  });

  it("no escribe si la tasa ya estaba guardada igual (idempotente)", async () => {
    scraper.mockResolvedValue(MANANA);
    supabaseResponde(json([{ fecha: MANANA.fecha, usd: MANANA.usd, eur: MANANA.eur }]));

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ ok: true, accion: "sin_cambios" });
    expect(pedidos).toHaveLength(1);
  });

  it("responde 422 y no guarda una lectura absurda del BCV", async () => {
    scraper.mockResolvedValue({ fecha: "2026-10-08", usd: 87.51, eur: null });
    supabaseResponde(json([{ fecha: "2026-10-07", usd: 873.867, eur: 984.26 }]));

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(422);
    expect(await respuesta.json()).toMatchObject({ ok: false, accion: "rechazada" });
    expect(pedidos).toHaveLength(1);
  });

  it("responde 502 si el BCV no responde, sin tocar Supabase", async () => {
    scraper.mockRejectedValue(new Error("The operation was aborted due to timeout"));

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(502);
    expect((await respuesta.json()).error).toMatch(/No se pudo leer el BCV/);
    expect(pedidos).toHaveLength(0);
  });

  it("responde 502 con la tasa leída si Supabase rechaza la escritura", async () => {
    scraper.mockResolvedValue(MANANA);
    supabaseResponde(json([]), json({ message: "permission denied" }, 401));

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(502);
    expect(await respuesta.json()).toMatchObject({ ok: false, tasa: MANANA });
  });

  it("responde 500 si falta la clave secreta de Supabase", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const respuesta = await GET(autorizada());

    expect(respuesta.status).toBe(500);
    expect(scraper).not.toHaveBeenCalled();
  });
});

describe("/api/cron/bcv: límites de tiempo", () => {
  it("deja margen para el peor caso (BCV 12 s + Supabase 2 × 5 s)", () => {
    expect(maxDuration).toBeGreaterThanOrEqual(22);
    expect(maxDuration).toBeLessThanOrEqual(60);
  });
});

describe("vercel.json", () => {
  it("programa el endpoint de lunes a viernes a las 5 p. m. de Caracas (21:00 UTC)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };

    expect(config.crons).toEqual([{ path: "/api/cron/bcv", schedule: "0 21 * * 1-5" }]);
    expect(existsSync("app/api/cron/bcv/route.ts")).toBe(true);
  });
});
