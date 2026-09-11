import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsearHtmlBcv, parsearNumeroBcv } from "../bcv/scraper";

const html = readFileSync(
  path.join(__dirname, "../bcv/__fixtures__/bcv.html"),
  "utf8",
);

describe("parsearNumeroBcv", () => {
  it("interpreta el formato del BCV", () => {
    expect(parsearNumeroBcv("832,48830000")).toBe(832.4883);
    expect(parsearNumeroBcv("1.234,56")).toBe(1234.56);
  });

  it("tolera los espacios con que el euro viene envuelto", () => {
    expect(parsearNumeroBcv(" 968,06734453")).toBe(968.06734453);
    expect(parsearNumeroBcv("\n\t968,06 ")).toBe(968.06);
  });

  it("rechaza basura y valores no positivos", () => {
    expect(parsearNumeroBcv("")).toBeNull();
    expect(parsearNumeroBcv(null)).toBeNull();
    expect(parsearNumeroBcv("N/D")).toBeNull();
    expect(parsearNumeroBcv("0,00")).toBeNull();
  });
});

describe("parsearHtmlBcv sobre el HTML real del BCV", () => {
  it("saca el dólar, el euro y la fecha valor", () => {
    const tasa = parsearHtmlBcv(html);
    expect(tasa.usd).toBe(832.4883);
    expect(tasa.eur).toBe(968.06734453);
    expect(tasa.fecha).toBe("2026-09-11");
  });

  it("toma la fecha del bloque de tasas, no la de otras secciones", () => {
    // La portada trae varios `date-display-single` (reservas, tasas de
    // interés). El correcto es el del contenedor de la fecha valor.
    const tasa = parsearHtmlBcv(html);
    expect(tasa.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tasa.fecha).not.toBe("2026-08-01");
  });

  it("sigue funcionando si el euro no está publicado", () => {
    const sinEuro = html.replace(/id="euro"/, 'id="euro-desactivado"');
    const tasa = parsearHtmlBcv(sinEuro);
    expect(tasa.usd).toBe(832.4883);
    expect(tasa.eur).toBeNull();
  });

  it("falla con un mensaje claro si desaparece el dólar", () => {
    const sinDolar = html.replace(/id="dolar"/, 'id="dolar-desactivado"');
    expect(() => parsearHtmlBcv(sinDolar)).toThrow(/dólar/i);
  });
});
