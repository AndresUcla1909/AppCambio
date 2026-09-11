import { describe, expect, it } from "vitest";
import {
  calcularBrecha,
  calcularVariacion,
  fechaADia,
  formatearDia,
  formatearMonto,
  formatearPorcentaje,
  formatearTasa,
  parsearMonto,
  restarDias,
} from "../formato";

describe("parsearMonto", () => {
  it("acepta el formato venezolano con punto de miles y coma decimal", () => {
    expect(parsearMonto("1.234,56")).toBe(1234.56);
    expect(parsearMonto("1.000.000,01")).toBe(1000000.01);
  });

  it("acepta el formato con punto decimal", () => {
    expect(parsearMonto("1234.56")).toBe(1234.56);
    expect(parsearMonto("0.75")).toBe(0.75);
  });

  it("trata una coma suelta como separador decimal", () => {
    expect(parsearMonto("1234,56")).toBe(1234.56);
    expect(parsearMonto("0,5")).toBe(0.5);
  });

  it("trata un punto con tres decimales como separador de miles", () => {
    // Quien escribe "1.000" en Venezuela quiere decir mil, no uno.
    expect(parsearMonto("1.000")).toBe(1000);
    expect(parsearMonto("12.500")).toBe(12500);
  });

  it("pero respeta el decimal cuando la parte entera es cero", () => {
    expect(parsearMonto("0.500")).toBe(0.5);
  });

  it("quita espacios, separadores de miles repetidos y símbolos", () => {
    expect(parsearMonto(" 1.000.000 ")).toBe(1000000);
    expect(parsearMonto("1,234,567.89")).toBe(1234567.89);
    expect(parsearMonto("$1.234,56")).toBe(1234.56);
    expect(parsearMonto("1.234,56 Bs")).toBe(1234.56);
  });

  it("devuelve null ante entradas que no son montos", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("   ")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
    expect(parsearMonto("12a3")).toBeNull();
    expect(parsearMonto("-5")).toBeNull();
  });

  it("acepta enteros simples", () => {
    expect(parsearMonto("100")).toBe(100);
    expect(parsearMonto("0")).toBe(0);
  });
});

describe("formateo es-VE", () => {
  it("usa punto de miles y coma decimal, con dos decimales fijos", () => {
    expect(formatearMonto(1234.5)).toBe("1.234,50");
    expect(formatearMonto(1000000)).toBe("1.000.000,00");
    expect(formatearMonto(0.5)).toBe("0,50");
  });

  it("muestra las tasas con hasta cuatro decimales", () => {
    expect(formatearTasa(832.4883)).toBe("832,4883");
    expect(formatearTasa(832.5)).toBe("832,50");
    expect(formatearTasa(null)).toBe("—");
  });

  it("pone signo explícito en los porcentajes", () => {
    expect(formatearPorcentaje(1.25)).toBe("+1,25 %");
    expect(formatearPorcentaje(-0.4)).toBe("-0,40 %");
    expect(formatearPorcentaje(null)).toBe("—");
  });

  it("da la vuelta a las fechas ISO", () => {
    expect(formatearDia("2026-09-11")).toBe("11/09/2026");
    expect(formatearDia(null)).toBe("—");
  });
});

describe("variación y brecha", () => {
  it("calcula la variación porcentual entre dos publicaciones", () => {
    expect(calcularVariacion(110, 100)).toBeCloseTo(10);
    expect(calcularVariacion(90, 100)).toBeCloseTo(-10);
  });

  it("calcula la brecha del USDT frente al BCV", () => {
    // Datos reales del 11/09/2026: USDT 953,60 contra BCV 832,4883.
    expect(calcularBrecha(953.6, 832.4883)).toBeCloseTo(14.548, 2);
  });

  it("devuelve null cuando no hay con qué comparar", () => {
    expect(calcularVariacion(100, null)).toBeNull();
    expect(calcularVariacion(null, 100)).toBeNull();
    expect(calcularVariacion(100, 0)).toBeNull();
  });
});

describe("fechas", () => {
  it("convierte un Date local a día ISO sin correrse de día", () => {
    expect(fechaADia(new Date(2026, 8, 11))).toBe("2026-09-11");
    expect(fechaADia(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("resta días cruzando el cambio de mes", () => {
    expect(restarDias("2026-09-11", 7)).toBe("2026-09-04");
    expect(restarDias("2026-03-01", 1)).toBe("2026-02-28");
  });
});
