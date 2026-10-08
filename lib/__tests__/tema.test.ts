import { describe, expect, it } from "vitest";
import { CLAVE_TEMA, esOscuro, esTema, scriptTema } from "../tema";

describe("esOscuro", () => {
  it("respeta la elección explícita sin importar el teléfono", () => {
    expect(esOscuro("oscuro", false)).toBe(true);
    expect(esOscuro("claro", true)).toBe(false);
  });

  it("en automático sigue al teléfono", () => {
    expect(esOscuro("sistema", true)).toBe(true);
    expect(esOscuro("sistema", false)).toBe(false);
  });
});

describe("esTema", () => {
  it("sólo acepta los tres valores conocidos", () => {
    expect(["claro", "oscuro", "sistema"].every(esTema)).toBe(true);
    expect(esTema("dark")).toBe(false);
    expect(esTema(null)).toBe(false);
  });
});

/**
 * Corre el script de <head> con un navegador mínimo de mentira y devuelve
 * cómo quedó <html>.
 */
function correrScript({
  guardado,
  sistemaOscuro = false,
  almacenRoto = false,
}: {
  guardado?: string;
  sistemaOscuro?: boolean;
  almacenRoto?: boolean;
}) {
  const clases = new Set(["dark"]); // Así llega el HTML estático.
  const raiz = {
    classList: {
      toggle: (clase: string, poner: boolean) => (poner ? clases.add(clase) : clases.delete(clase)),
    },
    style: { colorScheme: "" },
  };
  const localStorage = {
    getItem: (clave: string) => {
      if (almacenRoto) throw new Error("SecurityError");
      return clave === CLAVE_TEMA ? (guardado ?? null) : null;
    },
  };
  const matchMedia = () => ({ matches: sistemaOscuro });
  new Function("localStorage", "matchMedia", "document", scriptTema())(localStorage, matchMedia, {
    documentElement: raiz,
  });
  return { oscuro: clases.has("dark"), colorScheme: raiz.style.colorScheme };
}

describe("scriptTema (antes de pintar)", () => {
  it("sin elección guardada deja la app oscura, como siempre", () => {
    expect(correrScript({})).toEqual({ oscuro: true, colorScheme: "dark" });
  });

  it("quita el oscuro si se eligió el claro", () => {
    expect(correrScript({ guardado: "claro", sistemaOscuro: true })).toEqual({
      oscuro: false,
      colorScheme: "light",
    });
  });

  it("en automático sigue al teléfono", () => {
    expect(correrScript({ guardado: "sistema", sistemaOscuro: false }).oscuro).toBe(false);
    expect(correrScript({ guardado: "sistema", sistemaOscuro: true }).oscuro).toBe(true);
  });

  it("ignora un valor desconocido y usa el oscuro", () => {
    expect(correrScript({ guardado: "rosado" }).oscuro).toBe(true);
  });

  it("no rompe la página si localStorage falla (Safari privado)", () => {
    expect(correrScript({ almacenRoto: true }).oscuro).toBe(true);
  });
});
