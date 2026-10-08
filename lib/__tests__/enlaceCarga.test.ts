import { describe, expect, it } from "vitest";
import { enlaceCargar, leerEnlaceCargar } from "../historial/enlaceCarga";

describe("enlace para cargar una tasa a mano", () => {
  it("lleva la fecha que se estaba viendo y se lee de vuelta", () => {
    const enlace = enlaceCargar("2026-10-05");
    expect(enlace).toBe("/historial#cargar=2026-10-05");
    expect(leerEnlaceCargar(enlace.slice(enlace.indexOf("#")))).toEqual({ dia: "2026-10-05" });
  });

  it("sin fecha igual abre el formulario", () => {
    expect(leerEnlaceCargar("#cargar")).toEqual({ dia: null });
  });

  it("descarta fechas imposibles o mal escritas, pero abre el formulario", () => {
    expect(leerEnlaceCargar("#cargar=2026-02-31")).toEqual({ dia: null });
    expect(leerEnlaceCargar("#cargar=ayer")).toEqual({ dia: null });
  });

  it("otro hash no abre nada", () => {
    expect(leerEnlaceCargar("")).toBeNull();
    expect(leerEnlaceCargar("#cargarla")).toBeNull();
    expect(leerEnlaceCargar("#arriba")).toBeNull();
  });
});
