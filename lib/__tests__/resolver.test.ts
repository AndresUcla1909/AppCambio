import { describe, expect, it, vi } from "vitest";
import type { FilaTasa, TasaVigente } from "../almacen/tipos";
import {
  evaluarFrescura,
  necesitaRemoto,
  resolverLocal,
  resolverTasa,
} from "../tasas/resolver";

function fila(fecha: string, usd: number): FilaTasa {
  return {
    fecha,
    usd,
    eur: null,
    fuente: "bcv",
    creado_en: "2026-09-01T00:00:00.000Z",
    actualizado_en: "2026-09-01T00:00:00.000Z",
  };
}

function remota(fecha: string, usd: number, solicitada: string): TasaVigente {
  return {
    fecha,
    usd,
    eur: null,
    usd_anterior: null,
    eur_anterior: null,
    fuente: "bcv",
    fecha_solicitada: solicitada,
    es_exacta: fecha === solicitada,
  };
}

const HOY = "2026-10-07";
// Viernes 02/10 y lunes 05/10: el martes 07 todavía es "fresca" la del 05.
const LOCALES = [fila("2026-10-02", 900), fila("2026-10-05", 910)];

describe("evaluarFrescura", () => {
  it("no avisa con un fin de semana normal", () => {
    // La del viernes usada el lunes: 3 días.
    const tasa = remota("2026-10-02", 900, "2026-10-05");
    expect(evaluarFrescura(tasa, "2026-10-05")).toEqual({ antiguedad: 3, desactualizada: false });
  });

  it("avisa a partir del quinto día", () => {
    const tasa = remota("2026-10-02", 900, "2026-10-07");
    expect(evaluarFrescura(tasa, "2026-10-07")).toEqual({ antiguedad: 5, desactualizada: true });
    expect(evaluarFrescura(tasa, "2026-10-06").desactualizada).toBe(false);
  });

  it("sin tasa no hay nada que evaluar", () => {
    expect(evaluarFrescura(null, HOY)).toEqual({ antiguedad: null, desactualizada: false });
  });
});

describe("resolverLocal", () => {
  it("encuentra la tasa en el búfer", () => {
    const r = resolverLocal(LOCALES, HOY, HOY);
    expect(r.tasa?.fecha).toBe("2026-10-05");
    expect(r.origen).toBe("local");
    expect(r.desactualizada).toBe(false);
    expect(necesitaRemoto(r)).toBe(false);
  });

  it("marca las fechas anteriores a la ventana", () => {
    const r = resolverLocal(LOCALES, "2026-06-01", HOY);
    expect(r.tasa).toBeNull();
    expect(r.fueraDeVentana).toBe(true);
    expect(necesitaRemoto(r)).toBe(true);
  });
});

describe("resolverTasa", () => {
  it("con el búfer al día no consulta Supabase", async () => {
    const consultarRemoto = vi.fn();
    const r = await resolverTasa({
      fecha: HOY,
      hoy: HOY,
      filas: LOCALES,
      enLinea: true,
      consultarRemoto,
    });
    expect(r.origen).toBe("local");
    expect(consultarRemoto).not.toHaveBeenCalled();
  });

  it("fecha fuera del búfer y con red: la busca en Supabase", async () => {
    const consultarRemoto = vi.fn(async (f: string) => remota("2026-05-29", 600, f));
    const r = await resolverTasa({
      fecha: "2026-06-01",
      hoy: HOY,
      filas: LOCALES,
      enLinea: true,
      consultarRemoto,
    });
    expect(consultarRemoto).toHaveBeenCalledWith("2026-06-01");
    expect(r.origen).toBe("supabase");
    expect(r.tasa?.usd).toBe(600);
    expect(r.fueraDeVentana).toBe(true);
    expect(r.desactualizada).toBe(false);
  });

  it("búfer desactualizado y con red: Supabase trae una más reciente", async () => {
    const viejas = [fila("2026-09-15", 842)];
    const consultarRemoto = vi.fn(async (f: string) => remota("2026-10-06", 915, f));
    const r = await resolverTasa({ fecha: HOY, hoy: HOY, filas: viejas, enLinea: true, consultarRemoto });
    expect(r.origen).toBe("supabase");
    expect(r.tasa?.fecha).toBe("2026-10-06");
    expect(r.desactualizada).toBe(false);
  });

  it("si Supabase no tiene nada mejor, se queda con la local marcada", async () => {
    const viejas = [fila("2026-09-15", 842)];
    const consultarRemoto = vi.fn(async (f: string) => remota("2026-09-11", 832, f));
    const r = await resolverTasa({ fecha: HOY, hoy: HOY, filas: viejas, enLinea: true, consultarRemoto });
    expect(r.origen).toBe("local");
    expect(r.tasa?.fecha).toBe("2026-09-15");
    expect(r.desactualizada).toBe(true);
  });

  it("sin red: no consulta y avisa que la local está desactualizada", async () => {
    const viejas = [fila("2026-09-15", 842)];
    const consultarRemoto = vi.fn();
    const r = await resolverTasa({ fecha: HOY, hoy: HOY, filas: viejas, enLinea: false, consultarRemoto });
    expect(consultarRemoto).not.toHaveBeenCalled();
    expect(r.tasa?.fecha).toBe("2026-09-15");
    expect(r.desactualizada).toBe(true);
    expect(r.antiguedad).toBe(22);
  });

  it("sin red y fuera del búfer: no hay tasa", async () => {
    const r = await resolverTasa({
      fecha: "2026-06-01",
      hoy: HOY,
      filas: LOCALES,
      enLinea: false,
      consultarRemoto: vi.fn(),
    });
    expect(r.tasa).toBeNull();
    expect(r.fueraDeVentana).toBe(true);
  });

  it("si Supabase falla se sigue con lo local", async () => {
    const viejas = [fila("2026-09-15", 842)];
    const consultarRemoto = vi.fn(async () => {
      throw new Error("timeout");
    });
    const r = await resolverTasa({ fecha: HOY, hoy: HOY, filas: viejas, enLinea: true, consultarRemoto });
    expect(r.origen).toBe("local");
    expect(r.desactualizada).toBe(true);
  });

  it("sin Supabase configurado funciona sólo con el búfer", async () => {
    const r = await resolverTasa({ fecha: HOY, hoy: HOY, filas: [], enLinea: true, consultarRemoto: null });
    expect(r.tasa).toBeNull();
    expect(r.fueraDeVentana).toBe(false);
  });
});
