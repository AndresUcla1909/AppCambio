import { describe, expect, it } from "vitest";
import {
  convertirPrecio,
  elegirPrecio,
  montoAMostrar,
  montosEnTexto,
  registrarLectura,
  VENTANA_LECTURAS,
} from "../ocr/precio";
import { recorteEnVideo } from "../ocr/recorte";

describe("montosEnTexto", () => {
  it("lee precios en las dos convenciones", () => {
    expect(montosEnTexto("$3,50")).toEqual([3.5]);
    expect(montosEnTexto("3.50")).toEqual([3.5]);
    expect(montosEnTexto("1.250,00")).toEqual([1250]);
  });

  it("une separadores que el OCR dejó sueltos entre espacios", () => {
    expect(montosEnTexto("1 .250 ,00")).toEqual([1250]);
    expect(montosEnTexto("12 , 99")).toEqual([12.99]);
  });

  it("ignora signos sueltos en los extremos", () => {
    expect(montosEnTexto(",3,50.")).toEqual([3.5]);
    expect(montosEnTexto("€ 4,20 $")).toEqual([4.2]);
  });

  it("devuelve todos los montos del renglón, separados por espacios", () => {
    expect(montosEnTexto("2,00 15,75")).toEqual([2, 15.75]);
  });

  it("ignora medidas y porcentajes", () => {
    expect(montosEnTexto("Harina PAN 1kg")).toEqual([]);
    expect(montosEnTexto("Arroz 500 g")).toEqual([]);
    expect(montosEnTexto("Refresco 2L 1,5 lts")).toEqual([]);
    expect(montosEnTexto("Leche 250ml")).toEqual([]);
    expect(montosEnTexto("Promo 2x1")).toEqual([]);
    expect(montosEnTexto("Pack x6")).toEqual([]);
    expect(montosEnTexto("Ahorra 20%")).toEqual([]);
    expect(montosEnTexto("Ahorra 20 %")).toEqual([]);
  });

  it("no confunde una moneda pegada con una medida", () => {
    expect(montosEnTexto("3,50Bs")).toEqual([3.5]);
    expect(montosEnTexto("REF12.99")).toEqual([12.99]);
    expect(montosEnTexto("12.99 REF")).toEqual([12.99]);
    expect(montosEnTexto("Bs. 1.250,00")).toEqual([1250]);
  });

  it("descarta ceros y renglones sin números", () => {
    expect(montosEnTexto("0,00")).toEqual([]);
    expect(montosEnTexto("$ .,")).toEqual([]);
    expect(montosEnTexto("")).toEqual([]);
  });
});

describe("elegirPrecio", () => {
  it("elige el número escrito más grande, no el de mayor valor", () => {
    expect(
      elegirPrecio([
        { texto: "1000", confianza: 90, alto: 12 },
        { texto: "3,50", confianza: 85, alto: 48 },
      ]),
    ).toBe(3.5);
  });

  it("a igual tamaño gana la mayor confianza", () => {
    expect(
      elegirPrecio([
        { texto: "8,50", confianza: 70, alto: 40 },
        { texto: "9,50", confianza: 92, alto: 40 },
      ]),
    ).toBe(9.5);
  });

  it("descarta lo leído con poca confianza", () => {
    expect(elegirPrecio([{ texto: "7,77", confianza: 30, alto: 80 }])).toBeNull();
  });

  it("acierta con renglones tal como los entrega Tesseract", () => {
    // Lecturas reales de etiquetas de prueba, con su alto en píxeles.
    expect(
      elegirPrecio([
        { texto: "Harina PAN 1kg", confianza: 91, alto: 24 },
        { texto: "$ 3,50", confianza: 94, alto: 85 },
      ]),
    ).toBe(3.5);
    expect(
      elegirPrecio([
        { texto: "Bs. 1.250,00", confianza: 90, alto: 70 },
        { texto: "Precio incluye IVA", confianza: 94, alto: 19 },
      ]),
    ).toBe(1250);
  });

  it("si el precio sale borroso, no toma el peso del producto", () => {
    expect(
      elegirPrecio([
        { texto: "Harina PAN 1kg", confianza: 91, alto: 24 },
        { texto: "$ 3,5", confianza: 20, alto: 60 },
      ]),
    ).toBeNull();
  });

  it("devuelve null si no hay ningún número", () => {
    expect(elegirPrecio([])).toBeNull();
    expect(elegirPrecio([{ texto: "$", confianza: 95, alto: 40 }])).toBeNull();
  });
});

describe("estabilidad de la lectura", () => {
  /** Simula una secuencia de cuadros y devuelve lo mostrado tras cada uno. */
  function simular(lecturas: (number | null)[], inicial: number | null = null) {
    let ventana: (number | null)[] = [];
    let mostrado = inicial;
    return lecturas.map((lectura) => {
      ventana = registrarLectura(ventana, lectura);
      mostrado = montoAMostrar(ventana, mostrado);
      return mostrado;
    });
  }

  it("conserva sólo las últimas lecturas", () => {
    let ventana: (number | null)[] = [];
    for (let i = 0; i < 10; i++) ventana = registrarLectura(ventana, i);
    expect(ventana).toHaveLength(VENTANA_LECTURAS);
    expect(ventana.at(-1)).toBe(9);
  });

  it("no muestra nada hasta que un monto se repite", () => {
    expect(simular([3.5, 3.5])).toEqual([null, 3.5]);
  });

  it("una lectura errada suelta no reemplaza el resultado", () => {
    expect(simular([3.5, 3.5, 35, 3.5])).toEqual([null, 3.5, 3.5, 3.5]);
  });

  it("cambia cuando el nuevo precio se repite", () => {
    expect(simular([3.5, 3.5, 8, 8, 8]).at(-1)).toBe(8);
  });

  it("aguanta cuadros sin lectura y se limpia si no vuelve a ver números", () => {
    const mostrados = simular([3.5, 3.5, null, null, null, null]);
    expect(mostrados.slice(0, 5)).toEqual([null, 3.5, 3.5, 3.5, 3.5]);
    expect(mostrados.at(-1)).toBeNull();
  });
});

describe("convertirPrecio", () => {
  it("convierte en los dos sentidos", () => {
    expect(convertirPrecio(2, 866.5, "divisa_a_bs")).toBe(1733);
    expect(convertirPrecio(1733, 866.5, "bs_a_divisa")).toBe(2);
  });
});

describe("recorteEnVideo", () => {
  it("con la misma proporción es una simple escala", () => {
    expect(
      recorteEnVideo(
        { ancho: 1000, alto: 2000 },
        { ancho: 500, alto: 1000 },
        { x: 50, y: 400, ancho: 400, alto: 100 },
      ),
    ).toEqual({ x: 100, y: 800, ancho: 800, alto: 200 });
  });

  it("deshace el recorte de object-fit: cover", () => {
    // Video horizontal en una pantalla vertical: sobra video por los lados.
    const recorte = recorteEnVideo(
      { ancho: 1920, alto: 1080 },
      { ancho: 390, alto: 844 },
      { x: 45, y: 352, ancho: 300, alto: 140 },
    );
    expect(recorte).not.toBeNull();
    // Un recuadro centrado en la pantalla queda centrado en el video.
    expect(recorte!.x + recorte!.ancho / 2).toBeCloseTo(960, 0);
    expect(recorte!.y + recorte!.alto / 2).toBeCloseTo(540, 0);
    // La escala de cover es 844 / 1080.
    expect(recorte!.ancho).toBeCloseTo(300 / (844 / 1080), 0);
  });

  it("recorta lo que se sale de la imagen", () => {
    expect(
      recorteEnVideo(
        { ancho: 100, alto: 100 },
        { ancho: 100, alto: 100 },
        { x: -20, y: 90, ancho: 50, alto: 50 },
      ),
    ).toEqual({ x: 0, y: 90, ancho: 30, alto: 10 });
  });

  it("devuelve null sin video o con el recuadro fuera", () => {
    expect(
      recorteEnVideo({ ancho: 0, alto: 0 }, { ancho: 100, alto: 100 }, { x: 0, y: 0, ancho: 10, alto: 10 }),
    ).toBeNull();
    expect(
      recorteEnVideo({ ancho: 100, alto: 100 }, { ancho: 100, alto: 100 }, { x: 200, y: 0, ancho: 10, alto: 10 }),
    ).toBeNull();
  });
});
