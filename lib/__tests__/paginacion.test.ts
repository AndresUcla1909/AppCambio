import { describe, expect, it } from "vitest";
import { esFilasPorPagina, paginar } from "../historial/paginacion";

const numeros = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginar", () => {
  it("la primera página trae las primeras filas", () => {
    expect(paginar(numeros(43), 1, 10)).toEqual({
      filas: numeros(10),
      pagina: 1,
      totalPaginas: 5,
      desde: 1,
      hasta: 10,
      total: 43,
    });
  });

  it("la última página trae sólo lo que queda", () => {
    const p = paginar(numeros(43), 5, 10);
    expect(p.filas).toEqual([41, 42, 43]);
    expect([p.desde, p.hasta]).toEqual([41, 43]);
  });

  it("acota una página que ya no existe (el rango se achicó) a la última", () => {
    const p = paginar(numeros(7), 4, 10);
    expect(p.pagina).toBe(1);
    expect(p.filas).toEqual(numeros(7));
  });

  it("acota páginas menores que 1 o sin sentido a la primera", () => {
    expect(paginar(numeros(30), 0, 10).pagina).toBe(1);
    expect(paginar(numeros(30), -3, 10).pagina).toBe(1);
    expect(paginar(numeros(30), Number.NaN, 10).pagina).toBe(1);
  });

  it("sin filas devuelve una sola página vacía", () => {
    expect(paginar([], 1, 10)).toEqual({ filas: [], pagina: 1, totalPaginas: 1, desde: 0, hasta: 0, total: 0 });
  });

  it("cambia el total de páginas según las filas por página", () => {
    expect(paginar(numeros(60), 1, 20).totalPaginas).toBe(3);
    expect(paginar(numeros(60), 1, 50).totalPaginas).toBe(2);
    expect(paginar(numeros(60), 2, 50).filas).toEqual(numeros(60).slice(50));
  });
});

describe("esFilasPorPagina", () => {
  it("sólo acepta las opciones del selector", () => {
    expect([5, 10, 20, 50].every(esFilasPorPagina)).toBe(true);
    expect(esFilasPorPagina(15)).toBe(false);
    expect(esFilasPorPagina("10")).toBe(false);
  });
});
