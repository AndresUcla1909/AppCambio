import { describe, expect, it } from "vitest";
import {
  actualizar,
  agregar,
  CARRITO_VACIO,
  enAmbas,
  nombreDe,
  ponerDescuentoGeneral,
  quitar,
  sanearCarrito,
  subtotal,
  tieneDescuentos,
  totales,
  type Carrito,
} from "../compras/logica";
import { columnasDelPdf, filasDelPdf, generarPdf, nombreDelArchivo } from "../compras/pdf";

const TASA = 800;

/** Carrito de prueba: $2,50 ×2, Bs 1.600 ×1 y un queso de $8/kg × 0,5. */
function carritoDePrueba(): Carrito {
  let c = agregar(CARRITO_VACIO, { nombre: "Harina", precio: 2.5, moneda: "usd", cantidad: 2 }, "a");
  c = agregar(c, { precio: 1600, moneda: "bs" }, "b");
  c = agregar(c, { nombre: "Queso", precio: 8, moneda: "usd", cantidad: 0.5 }, "c");
  return c;
}

describe("conversión", () => {
  it("pasa a la otra moneda con la tasa BCV, sin tocar la original", () => {
    expect(enAmbas(2.5, "usd", TASA)).toEqual({ usd: 2.5, bs: 2000 });
    expect(enAmbas(1000, "bs", TASA)).toEqual({ usd: 1.25, bs: 1000 });
  });

  it("redondea a céntimos lo convertido", () => {
    expect(enAmbas(1, "bs", 866.5612)).toEqual({ usd: 0, bs: 1 });
    expect(enAmbas(3.33, "usd", 866.5612).bs).toBe(2885.65);
  });

  it("sin tasa deja la otra moneda vacía", () => {
    expect(enAmbas(5, "usd", null)).toEqual({ usd: 5, bs: null });
  });
});

describe("subtotales y totales", () => {
  it("multiplica por la cantidad, con decimales para lo pesado", () => {
    const [harina, , queso] = carritoDePrueba().articulos;
    expect(subtotal(harina, TASA)).toEqual({ usd: 5, bs: 4000 });
    expect(subtotal(queso, TASA)).toEqual({ usd: 4, bs: 3200 });
  });

  it("suma todo en las dos monedas", () => {
    const t = totales(carritoDePrueba(), TASA);
    expect(t.total).toEqual({ usd: 11, bs: 8800 });
    expect(t.articulos).toBe(3);
    expect(t.unidades).toBe(3.5);
    expect(t.ahorro).toEqual({ usd: 0, bs: 0 });
  });

  it("con precios en las dos monedas y sin tasa, no inventa totales", () => {
    expect(totales(carritoDePrueba(), null).total).toEqual({ usd: null, bs: null });
  });

  it("carrito vacío suma cero", () => {
    expect(totales(CARRITO_VACIO, TASA).total).toEqual({ usd: 0, bs: 0 });
  });
});

describe("descuentos", () => {
  it("el de un artículo rebaja sólo ese artículo", () => {
    const c = actualizar(carritoDePrueba(), "a", { descuento: 20 });
    expect(subtotal(c.articulos[0], TASA)).toEqual({ usd: 4, bs: 3200 });
    const t = totales(c, TASA);
    expect(t.total).toEqual({ usd: 10, bs: 8000 });
    expect(t.ahorro).toEqual({ usd: 1, bs: 800 });
  });

  it("el general se aplica sobre lo que ya quedó con los descuentos de cada artículo", () => {
    let c = actualizar(carritoDePrueba(), "a", { descuento: 20 });
    c = ponerDescuentoGeneral(c, 10);
    const t = totales(c, TASA);
    expect(t.sinDescuentos).toEqual({ usd: 11, bs: 8800 });
    expect(t.subtotal).toEqual({ usd: 10, bs: 8000 });
    expect(t.descuentoGeneral).toEqual({ usd: 1, bs: 800 });
    expect(t.total).toEqual({ usd: 9, bs: 7200 });
    expect(t.ahorro).toEqual({ usd: 2, bs: 1600 });
  });

  it("los porcentajes quedan entre 0 y 100", () => {
    const c = ponerDescuentoGeneral(actualizar(carritoDePrueba(), "b", { descuento: 150 }), -5);
    expect(c.articulos[1].descuento).toBe(100);
    expect(c.descuento).toBe(0);
    expect(subtotal(c.articulos[1], TASA)).toEqual({ usd: 0, bs: 0 });
  });

  it("sabe si hay algún descuento", () => {
    expect(tieneDescuentos(carritoDePrueba())).toBe(false);
    expect(tieneDescuentos(ponerDescuentoGeneral(carritoDePrueba(), 5))).toBe(true);
  });
});

describe("operaciones", () => {
  it("rechaza precios o cantidades que no sirven", () => {
    expect(() => agregar(CARRITO_VACIO, { precio: 0, moneda: "usd" })).toThrow();
    expect(() => agregar(CARRITO_VACIO, { precio: 1, moneda: "usd", cantidad: 0 })).toThrow();
    const c = carritoDePrueba();
    expect(actualizar(c, "a", { cantidad: -1 })).toBe(c);
  });

  it("quita y renombra", () => {
    const c = quitar(carritoDePrueba(), "b");
    expect(c.articulos.map((a) => a.id)).toEqual(["a", "c"]);
    expect(nombreDe(carritoDePrueba().articulos[1], 1)).toBe("Artículo 2");
  });

  it("recupera lo que se pueda de datos guardados dañados", () => {
    expect(sanearCarrito(null)).toEqual(CARRITO_VACIO);
    const c = sanearCarrito({
      titulo: "Mercado",
      descuento: 300,
      articulos: [
        { id: "x", precio: 2, moneda: "usd", cantidad: 1 },
        { id: "x", precio: 3, moneda: "bs", cantidad: 2, descuento: 10 },
        { precio: -1, moneda: "usd", cantidad: 1 },
        { precio: 1, moneda: "eur", cantidad: 1 },
      ],
    });
    expect(c.titulo).toBe("Mercado");
    expect(c.descuento).toBe(100);
    expect(c.articulos).toHaveLength(2);
    expect(new Set(c.articulos.map((a) => a.id)).size).toBe(2);
    expect(c.articulos[0].descuento).toBe(0);
  });
});

describe("PDF", () => {
  const tasa = { valor: TASA, fecha: "2026-10-02" };

  it("arma las filas con cada monto en las dos monedas", () => {
    const filas = filasDelPdf(carritoDePrueba(), tasa);
    expect(filas[0].map((c) => c.texto)).toEqual(["1", "Harina", "2", "$ 2,50", "Bs 2.000,00", "$ 5,00", "Bs 4.000,00"]);
    // El de bolívares: lo convertido es el precio en dólares.
    expect(filas[1].map((c) => c.convertido)).toEqual([false, false, false, true, false, true, false]);
    expect(filas[2][2].texto).toBe("0,5");
  });

  it("agrega la columna de descuento sólo si hace falta", () => {
    expect(columnasDelPdf(carritoDePrueba())).not.toContain("Desc.");
    const c = actualizar(carritoDePrueba(), "a", { descuento: 15 });
    expect(columnasDelPdf(c)).toContain("Desc.");
    expect(filasDelPdf(c, tasa)[0][5].texto).toBe("15 %");
    expect(filasDelPdf(c, tasa)[1][5].texto).toBe("—");
  });

  it("genera un PDF con el título", () => {
    const c = { ...ponerDescuentoGeneral(carritoDePrueba(), 10), titulo: "Mercado del sabado" };
    const bytes = new Uint8Array(generarPdf(c, tasa));
    const texto = new TextDecoder("latin1").decode(bytes);
    expect(texto.startsWith("%PDF")).toBe(true);
    expect(texto).toContain("Mercado del sabado");
    expect(texto).toContain("Descuento a todo");
  });

  it("nombra el archivo con el título, sin acentos ni símbolos", () => {
    const archivo = nombreDelArchivo({ ...CARRITO_VACIO, titulo: "Compras Excelsior / Ñandú" });
    expect(archivo).toMatch(/^compras-excelsior-nandu-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(nombreDelArchivo(CARRITO_VACIO)).toMatch(/^compras-/);
  });
});
