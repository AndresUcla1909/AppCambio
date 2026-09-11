import { describe, expect, it } from "vitest";
import { elegirAnuncio, nombresMetodosPago, type AnuncioP2P } from "../binance/p2p";

function anuncio(
  precio: string,
  disponible: string,
  min: string,
  max: string,
  nick = "alguien",
): AnuncioP2P {
  return {
    adv: {
      price: precio,
      tradableQuantity: disponible,
      minSingleTransAmount: min,
      maxSingleTransAmount: max,
      tradeMethods: [{ tradeMethodShortName: "Banco de Venezuela" }],
    },
    advertiser: { nickName: nick },
  };
}

const OPCIONES = { montoUsdt: 100, montoBs: 95_650, posicion: 2 };

describe("elegirAnuncio", () => {
  it("toma el segundo anuncio de los que sirven", () => {
    const lista = [
      anuncio("954.000", "565.77", "70000", "1908000", "RARR-29"),
      anuncio("953.500", "225.29", "50000", "500000", "RicardoJ98"),
      anuncio("953.004", "3645.02", "90000", "7969491", "Luishein"),
    ];
    const elegido = elegirAnuncio(lista, OPCIONES);
    expect(elegido?.anuncio.advertiser.nickName).toBe("RicardoJ98");
    expect(elegido?.posicion).toBe(2);
    expect(elegido?.usoRespaldo).toBe(false);
  });

  it("descarta a quien no tiene USDT suficientes", () => {
    const lista = [
      anuncio("960.000", "50", "70000", "1908000", "pocosUsdt"),
      anuncio("954.000", "565.77", "70000", "1908000", "primeroUtil"),
      anuncio("953.500", "225.29", "50000", "500000", "segundoUtil"),
    ];
    const elegido = elegirAnuncio(lista, OPCIONES);
    expect(elegido?.anuncio.advertiser.nickName).toBe("segundoUtil");
  });

  it("descarta a quien no acepta ese monto en bolívares", () => {
    const lista = [
      // Pide un mínimo por encima de los 95.650 Bs de la operación.
      anuncio("960.000", "5000", "3700000", "34000000", "mínimoAlto"),
      // Su máximo se queda corto.
      anuncio("959.000", "5000", "300", "4000", "máximoBajo"),
      anuncio("954.000", "565.77", "70000", "1908000", "primeroUtil"),
      anuncio("953.500", "225.29", "50000", "500000", "segundoUtil"),
    ];
    const elegido = elegirAnuncio(lista, OPCIONES);
    expect(elegido?.anuncio.advertiser.nickName).toBe("segundoUtil");
  });

  it("si sólo hay un anuncio válido, lo usa y lo marca como respaldo", () => {
    const lista = [anuncio("954.000", "565.77", "70000", "1908000", "único")];
    const elegido = elegirAnuncio(lista, OPCIONES);
    expect(elegido?.anuncio.advertiser.nickName).toBe("único");
    expect(elegido?.posicion).toBe(1);
    expect(elegido?.usoRespaldo).toBe(true);
  });

  it("devuelve null si ninguno sirve", () => {
    const lista = [anuncio("954.000", "10", "70000", "1908000", "sinFondos")];
    expect(elegirAnuncio(lista, OPCIONES)).toBeNull();
  });

  it("respeta una posición distinta configurada", () => {
    const lista = [
      anuncio("954.000", "565.77", "70000", "1908000", "a"),
      anuncio("953.500", "225.29", "50000", "500000", "b"),
      anuncio("953.004", "3645.02", "90000", "7969491", "c"),
    ];
    expect(
      elegirAnuncio(lista, { ...OPCIONES, posicion: 1 })?.anuncio.advertiser
        .nickName,
    ).toBe("a");
    expect(
      elegirAnuncio(lista, { ...OPCIONES, posicion: 3 })?.anuncio.advertiser
        .nickName,
    ).toBe("c");
  });
});

describe("nombresMetodosPago", () => {
  it("saca los nombres legibles", () => {
    expect(nombresMetodosPago(anuncio("1", "200", "1", "999999"))).toEqual([
      "Banco de Venezuela",
    ]);
  });

  it("no revienta si el anuncio no trae métodos", () => {
    const sinMetodos = anuncio("1", "200", "1", "999999");
    delete sinMetodos.adv.tradeMethods;
    expect(nombresMetodosPago(sinMetodos)).toEqual([]);
  });
});
