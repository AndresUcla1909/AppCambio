import { describe, expect, it } from "vitest";
import {
  diasEntre,
  enVentana,
  inicioVentana,
  muestraDelDia,
  recortarFilas,
  recortarMuestras,
  registrarMuestraP2p,
  sanearMuestras,
} from "../almacen/buffer";
import type { FilaTasa, MuestraP2P } from "../almacen/tipos";

function fila(fecha: string, usd = 800): FilaTasa {
  return {
    fecha,
    usd,
    eur: null,
    fuente: "bcv",
    creado_en: "2026-09-01T00:00:00.000Z",
    actualizado_en: "2026-09-01T00:00:00.000Z",
  };
}

const HOY = "2026-10-07";

describe("ventana", () => {
  it("empieza 60 días antes de hoy", () => {
    expect(inicioVentana(HOY)).toBe("2026-08-08");
    expect(enVentana("2026-08-08", HOY)).toBe(true);
    expect(enVentana("2026-08-07", HOY)).toBe(false);
  });

  it("incluye fechas futuras (la fecha valor de mañana)", () => {
    expect(enVentana("2026-10-08", HOY)).toBe(true);
  });

  it("cuenta días de calendario, también entre meses", () => {
    expect(diasEntre("2026-09-28", "2026-10-02")).toBe(4);
    expect(diasEntre("2026-10-02", "2026-09-28")).toBe(-4);
    expect(diasEntre("2026-10-07", "2026-10-07")).toBe(0);
  });
});

describe("recortarFilas", () => {
  it("descarta lo viejo pero deja la última anterior como ancla", () => {
    const filas = [
      fila("2026-07-01"),
      fila("2026-08-06"),
      fila("2026-08-10"),
      fila("2026-10-08"),
    ];
    const recortadas = recortarFilas(filas, HOY);
    // El 06/08 es la vigente el sábado 08/08, primer día de la ventana.
    expect(recortadas.map((f) => f.fecha)).toEqual([
      "2026-08-06",
      "2026-08-10",
      "2026-10-08",
    ]);
  });

  it("si todo es viejo conserva sólo la más reciente", () => {
    const recortadas = recortarFilas([fila("2026-01-02"), fila("2026-03-05")], HOY);
    expect(recortadas.map((f) => f.fecha)).toEqual(["2026-03-05"]);
  });

  it("no toca nada si todo está dentro", () => {
    const filas = [fila("2026-09-11"), fila("2026-09-15")];
    expect(recortarFilas(filas, HOY)).toEqual(filas);
  });

  it("con el búfer vacío devuelve vacío", () => {
    expect(recortarFilas([], HOY)).toEqual([]);
  });
});

describe("muestras de USDT", () => {
  it("guarda una por día de Caracas: la última vista", () => {
    let muestras: MuestraP2P[] = [];
    // 10:00 y 15:00 en Caracas (UTC-4) son el mismo día.
    muestras = registrarMuestraP2p(muestras, 950, "2026-10-07T14:00:00.000Z");
    muestras = registrarMuestraP2p(muestras, 955, "2026-10-07T19:00:00.000Z");
    expect(muestras).toEqual([
      { dia: "2026-10-07", precio: 955, obtenidoEn: "2026-10-07T19:00:00.000Z" },
    ]);
  });

  it("usa el día de Caracas, no el de UTC", () => {
    // 02:00 UTC del 8 son las 22:00 del 7 en Caracas.
    const muestras = registrarMuestraP2p([], 950, "2026-10-08T02:00:00.000Z");
    expect(muestras[0].dia).toBe("2026-10-07");
  });

  it("una respuesta más vieja no pisa una más reciente", () => {
    const actual = registrarMuestraP2p([], 955, "2026-10-07T19:00:00.000Z");
    const conVieja = registrarMuestraP2p(actual, 900, "2026-10-07T14:00:00.000Z");
    expect(conVieja).toBe(actual);
  });

  it("ignora precios o fechas inválidos", () => {
    expect(registrarMuestraP2p([], 0, "2026-10-07T14:00:00.000Z")).toEqual([]);
    expect(registrarMuestraP2p([], 950, "ayer")).toEqual([]);
  });

  it("recorta a la ventana y busca por día", () => {
    const muestras: MuestraP2P[] = [
      { dia: "2026-07-01", precio: 700, obtenidoEn: "2026-07-01T14:00:00.000Z" },
      { dia: "2026-10-06", precio: 950, obtenidoEn: "2026-10-06T14:00:00.000Z" },
    ];
    const recortadas = recortarMuestras(muestras, HOY);
    expect(recortadas.map((m) => m.dia)).toEqual(["2026-10-06"]);
    expect(muestraDelDia(recortadas, "2026-10-06")?.precio).toBe(950);
    expect(muestraDelDia(recortadas, "2026-10-05")).toBeNull();
  });

  it("sanea lo que viene del localStorage", () => {
    const limpias = sanearMuestras([
      { dia: "2026-10-06", precio: 950, obtenidoEn: "2026-10-06T14:00:00.000Z" },
      { dia: "2026-10-06", precio: 1, obtenidoEn: "2026-10-06T15:00:00.000Z" },
      { dia: "06/10/2026", precio: 950, obtenidoEn: "x" },
      { dia: "2026-10-05", precio: -1, obtenidoEn: "x" },
      "basura",
    ]);
    expect(limpias).toEqual([
      { dia: "2026-10-06", precio: 950, obtenidoEn: "2026-10-06T14:00:00.000Z" },
    ]);
    expect(sanearMuestras(null)).toEqual([]);
  });
});
