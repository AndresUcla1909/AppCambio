import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { cajasDeTexto } from "../ocr/deteccion";
import { glifosDelRenglon, patronesDeCentimos } from "../ocr/geometria";
import { aTensorBGR, redimensionar, umbralOtsu, type Caja, type Imagen } from "../ocr/imagen";
import { leerRenglones, type Ejecutar } from "../ocr/motor";
import { elegirPrecio } from "../ocr/precio";
import { decodificar, prepararDiccionario } from "../ocr/reconocimiento";

/** Una imagen de un solo color, con rectángulos de otro (los "caracteres"). */
function imagenCon(ancho: number, alto: number, rectangulos: Caja[], fondo = 240, tinta = 20): Imagen {
  const datos = new Uint8ClampedArray(ancho * alto * 4).fill(255);
  for (let i = 0; i < ancho * alto; i++) datos.fill(fondo, i * 4, i * 4 + 3);
  for (const r of rectangulos) {
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) datos.fill(tinta, (y * ancho + x) * 4, (y * ancho + x) * 4 + 3);
    }
  }
  return { ancho, alto, datos };
}

describe("imagen", () => {
  it("redimensiona sin alterar una imagen lisa", () => {
    const lisa = imagenCon(10, 6, [], 100);
    const grande = redimensionar(lisa, 25, 15);
    expect(grande.ancho).toBe(25);
    expect([...grande.datos.slice(0, 4)]).toEqual([100, 100, 100, 255]);
  });

  it("el umbral de Otsu separa tinta y fondo", () => {
    const grises = Float32Array.from([...Array(50).fill(30), ...Array(50).fill(220)]);
    const umbral = umbralOtsu(grises);
    expect(umbral).toBeGreaterThanOrEqual(30);
    expect(umbral).toBeLessThan(220);
  });

  it("pasa a BGR normalizado y rellena a la derecha con gris medio", () => {
    const img = { ancho: 1, alto: 1, datos: Uint8ClampedArray.from([255, 0, 0, 255]) };
    const tensor = aTensorBGR(img, 2);
    // Planos B, G, R, cada uno de 1×2: el rojo puro queda en el tercero.
    expect([...tensor]).toEqual([-1, 0, -1, 0, 1, 0]);
  });
});

describe("cajasDeTexto", () => {
  it("convierte cada mancha del mapa en una caja, agrandada y escalada", () => {
    const ancho = 64;
    const alto = 32;
    const mapa = new Float32Array(ancho * alto);
    for (let y = 10; y < 16; y++) for (let x = 5; x < 30; x++) mapa[y * ancho + x] = 0.9;
    // Una mancha tenue: no llega al umbral de caja.
    for (let y = 20; y < 26; y++) for (let x = 40; x < 60; x++) mapa[y * ancho + x] = 0.35;

    const cajas = cajasDeTexto(mapa, ancho, alto, 128, 64);
    expect(cajas).toHaveLength(1);
    const [c] = cajas;
    // El núcleo marcado es x 5–29, y 10–15 en el mapa; la imagen es el doble.
    expect(c.x0).toBeLessThan(10);
    expect(c.x1).toBeGreaterThan(60);
    expect(c.y0).toBeLessThan(20);
    expect(c.y1).toBeGreaterThan(32);
  });
});

describe("decodificar", () => {
  const diccionario = prepararDiccionario(["$", "5", "7", "9", "日"]);
  // Clases: 0 blanco, 1 "$", 2 "5", 3 "7", 4 "9", 5 "日", 6 espacio.
  function salida(pasos: number[][]): Float32Array {
    return Float32Array.from(pasos.flat());
  }
  const entrada = { tensor: new Float32Array(), ancho: 80, anchoUtil: 80, caja: { x0: 0, y0: 0, x1: 80, y1: 48 } };

  it("junta repeticiones, quita blancos y ubica cada carácter", () => {
    const uno = (c: number) => [0, 1, 2, 3, 4, 5, 6].map((i) => (i === c ? 0.9 : 0.01));
    const lectura = decodificar(salida([uno(2), uno(2), uno(0), uno(3), uno(0), uno(4), uno(0), uno(0), uno(4), uno(0)]), 10, 7, diccionario, entrada);
    expect(lectura.texto).toBe("5799");
    expect(lectura.confianza).toBeCloseTo(90, 0);
    const centros = lectura.simbolos.map((s) => (s.x0 + s.x1) / 2);
    expect(centros).toEqual([...centros].sort((a, b) => a - b));
  });

  it("no acepta caracteres fuera de los de una etiqueta", () => {
    // En el primer paso el modelo prefiere "日", pero luego viene un "9".
    const lectura = decodificar(salida([[0.01, 0.01, 0.01, 0.01, 0.3, 0.6, 0.01]]), 1, 7, diccionario, entrada);
    expect(lectura.texto).toBe("9");
  });
});

describe("patronesDeCentimos", () => {
  const g = (x0: number, y0: number, x1: number, y1: number): Caja => ({ x0, y0, x1, y1 });

  it("reconoce un entero grande con dos dígitos pequeños arriba", () => {
    const [patron] = patronesDeCentimos([g(0, 0, 40, 100), g(45, 0, 65, 50), g(68, 0, 88, 50)]);
    expect(patron.enteros).toBe(1);
  });

  it("también si los céntimos van abajo, como en etiquetas electrónicas", () => {
    expect(patronesDeCentimos([g(0, 0, 40, 100), g(45, 50, 65, 100), g(68, 50, 88, 100)])).toHaveLength(1);
  });

  it("no confunde dígitos iguales ni la perspectiva con céntimos", () => {
    expect(patronesDeCentimos([g(0, 0, 40, 100), g(45, 0, 85, 100), g(90, 0, 130, 100)])).toHaveLength(0);
    // Cada dígito un poco más chico y centrado: es la etiqueta inclinada.
    expect(patronesDeCentimos([g(0, 0, 40, 100), g(45, 5, 82, 95), g(87, 9, 121, 91)])).toHaveLength(0);
  });

  it("ignora lo que viene detrás de los céntimos", () => {
    const conMarco = [g(0, 0, 40, 100), g(45, 0, 65, 50), g(68, 0, 88, 50), g(95, -10, 110, 120)];
    expect(patronesDeCentimos(conMarco)).toHaveLength(1);
  });
});

describe("glifosDelRenglon", () => {
  it("encuentra cada carácter con su tamaño, sea tinta oscura o clara", () => {
    const rects = [
      { x0: 10, y0: 10, x1: 30, y1: 50 },
      { x0: 40, y0: 10, x1: 52, y1: 30 },
    ];
    const caja = { x0: 0, y0: 0, x1: 70, y1: 60 };
    for (const [fondo, tinta] of [[240, 20], [30, 250]]) {
      const glifos = glifosDelRenglon(imagenCon(70, 60, rects, fondo, tinta), caja, 2);
      expect(glifos).toEqual(rects);
    }
  });
});

describe("elegirPrecio con geometría", () => {
  it("une céntimos pequeños que el OCR leyó pegados", () => {
    const renglon = {
      texto: "579",
      confianza: 95,
      alto: 120,
      caja: { x0: 0, y0: 0, x1: 100, y1: 120 },
      simbolos: [
        { car: "5", x0: 0, x1: 45 },
        { car: "7", x0: 45, x1: 70 },
        { car: "9", x0: 70, x1: 100 },
      ],
      glifos: [
        { x0: 5, y0: 10, x1: 40, y1: 110 },
        { x0: 46, y0: 10, x1: 66, y1: 55 },
        { x0: 70, y0: 10, x1: 90, y1: 55 },
      ],
    };
    expect(elegirPrecio([renglon])).toBe(5.79);
  });

  it("une céntimos que quedaron en otra caja a la derecha", () => {
    const entero = { texto: "41", confianza: 98, alto: 60, caja: { x0: 0, y0: 0, x1: 50, y1: 60 } };
    const centimos = { texto: "99", confianza: 97, alto: 30, caja: { x0: 52, y0: 5, x1: 80, y1: 35 } };
    expect(elegirPrecio([entero, centimos])).toBe(41.99);
  });

  it("entre números del mismo tamaño gana el que lleva moneda", () => {
    expect(elegirPrecio([{ texto: "100 9r.-€ 2,00", confianza: 90, alto: 40 }])).toBe(2);
  });

  it("no toma un código de barras por precio", () => {
    expect(
      elegirPrecio([
        { texto: "6253506223570", confianza: 99, alto: 80 },
        { texto: "$6.99", confianza: 95, alto: 40 },
      ]),
    ).toBe(6.99);
  });

  it("acepta un \"$\" que el OCR leyó como \"s\"", () => {
    expect(elegirPrecio([{ texto: "s2,49", confianza: 80, alto: 50 }])).toBe(2.49);
  });
});

describe("lector completo con los modelos reales", () => {
  const raiz = path.resolve(__dirname, "../..");
  const sesiones: Record<string, ort.InferenceSession> = {};
  let diccionario: ReturnType<typeof prepararDiccionario>;

  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    for (const modelo of ["deteccion", "reconocimiento"]) {
      sesiones[modelo] = await ort.InferenceSession.create(
        readFileSync(path.join(raiz, `modelos/ocr/ppocrv6-tiny-${modelo}.onnx`)),
      );
    }
    const lineas = readFileSync(path.join(raiz, "modelos/ocr/ppocrv6-tiny-diccionario.txt"), "utf8").split("\n");
    if (lineas[lineas.length - 1] === "") lineas.pop();
    diccionario = prepararDiccionario(lineas);
  }, 30_000);

  const ejecutar: Ejecutar = async (modelo, tensor, forma) => {
    const s = sesiones[modelo];
    const r = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", tensor, forma) });
    const salida = r[s.outputNames[0]];
    return { datos: salida.data as Float32Array, forma: salida.dims };
  };

  const fixtures = path.join(raiz, "lib/ocr/__fixtures__");
  const etiquetas = JSON.parse(readFileSync(path.join(fixtures, "etiquetas.json"), "utf8")) as {
    archivo: string;
    ancho: number;
    alto: number;
    precio: number;
  }[];

  for (const etiqueta of etiquetas) {
    it(`lee ${etiqueta.precio} en ${etiqueta.archivo}`, async () => {
      const imagen = {
        ancho: etiqueta.ancho,
        alto: etiqueta.alto,
        datos: new Uint8Array(gunzipSync(readFileSync(path.join(fixtures, etiqueta.archivo)))),
      };
      const renglones = await leerRenglones(imagen, ejecutar, diccionario);
      expect(elegirPrecio(renglones)).toBe(etiqueta.precio);
    }, 20_000);
  }
});
