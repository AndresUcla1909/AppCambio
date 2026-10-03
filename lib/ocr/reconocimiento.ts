import {
  aTensorBGR,
  recortar,
  redimensionar,
  type Caja,
  type Imagen,
} from "./imagen";

/**
 * Reconocimiento de texto (PP-OCRv6, CTC): lee un renglón ya recortado.
 *
 * El modelo recorre la línea de izquierda a derecha en "pasos" y en cada uno
 * da la probabilidad de cada carácter (o de ninguno). Además del texto, aquí
 * se conserva en qué paso salió cada carácter: eso dice dónde está en la
 * imagen, y sirve para medir su tamaño (ver `medirSimbolos`).
 */

/** Alto con el que se entrenó el modelo. */
export const ALTO_RECONOCIMIENTO = 48;

/** Ancho mínimo de la entrada: las líneas cortas se rellenan hasta aquí. */
const ANCHO_MINIMO = 320;

export type EntradaReconocimiento = {
  tensor: Float32Array;
  /** Ancho del tensor, ya con relleno. */
  ancho: number;
  /** Ancho que ocupa de verdad la línea dentro del tensor. */
  anchoUtil: number;
  caja: Caja;
};

/** Un carácter leído y el tramo horizontal que ocupa en la imagen. */
export type SimboloLeido = { car: string; x0: number; x1: number };

export type Lectura = {
  texto: string;
  /** De 0 a 100: la probabilidad media de los caracteres leídos. */
  confianza: number;
  simbolos: SimboloLeido[];
};

/**
 * Recorta el renglón y lo escala a 48 px de alto sin deformarlo. No se gira
 * nunca: PaddleOCR gira las cajas más altas que anchas (piensa en texto
 * vertical), y eso hacía ilegible un "2" grande y solo.
 */
export function entradaReconocimiento(img: Imagen, caja: Caja): EntradaReconocimiento {
  const recorte = recortar(img, caja);
  const anchoUtil = Math.max(
    1,
    Math.round((recorte.ancho * ALTO_RECONOCIMIENTO) / Math.max(1, recorte.alto)),
  );
  const escalado = redimensionar(recorte, anchoUtil, ALTO_RECONOCIMIENTO);
  const ancho = Math.max(ANCHO_MINIMO, anchoUtil);
  return { tensor: aTensorBGR(escalado, ancho), ancho, anchoUtil, caja };
}

/**
 * Qué caracteres se aceptan al decodificar. El modelo conoce casi 7000
 * (incluido el chino); limitarlo a lo que puede aparecer en una etiqueta
 * evita que un "8" borroso salga como "日".
 */
const PERMITIDOS =
  "0123456789" +
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "áéíóúüñÁÉÍÓÚÜÑ" +
  ".,'’:;/-+%$€#&()*@!?\"";

/**
 * Prepara la tabla clase → carácter. La clase 0 es "ningún carácter" (el
 * blanco de CTC) y la última es el espacio, como en PaddleOCR.
 */
export function prepararDiccionario(lineas: string[]): {
  caracteres: string[];
  permitido: Uint8Array;
} {
  const caracteres = ["", ...lineas, " "];
  const aceptados = new Set([...PERMITIDOS, " "]);
  const permitido = new Uint8Array(caracteres.length);
  caracteres.forEach((c, i) => {
    if (i === 0 || aceptados.has(c)) permitido[i] = 1;
  });
  return { caracteres, permitido };
}

/**
 * Decodificación CTC voraz: en cada paso el carácter permitido más
 * probable; luego se juntan las repeticiones y se quitan los blancos.
 */
export function decodificar(
  salida: Float32Array,
  pasos: number,
  clases: number,
  diccionario: { caracteres: string[]; permitido: Uint8Array },
  entrada: EntradaReconocimiento,
): Lectura {
  type Emitido = { car: string; desde: number; hasta: number; prob: number };
  const emitidos: Emitido[] = [];
  let anterior = 0;

  for (let t = 0; t < pasos; t++) {
    const base = t * clases;
    let mejor = 0;
    let prob = -1;
    for (let c = 0; c < clases; c++) {
      if (!diccionario.permitido[c]) continue;
      const p = salida[base + c];
      if (p > prob) {
        prob = p;
        mejor = c;
      }
    }

    if (mejor !== 0 && mejor === anterior) {
      // El mismo carácter que sigue: se alarga su tramo.
      const ultimo = emitidos[emitidos.length - 1];
      ultimo.hasta = t;
      ultimo.prob = Math.max(ultimo.prob, prob);
    } else if (mejor !== 0) {
      emitidos.push({ car: diccionario.caracteres[mejor], desde: t, hasta: t, prob });
    }
    anterior = mejor;
  }

  // Sin espacios en los extremos, para que texto y símbolos vayan a la par.
  while (emitidos.length && emitidos[0].car === " ") emitidos.shift();
  while (emitidos.length && emitidos[emitidos.length - 1].car === " ") emitidos.pop();

  // Del paso del modelo a píxeles de la imagen: cada paso cubre un tramo
  // fijo del tensor, y el tensor es la caja escalada a 48 px de alto.
  const { caja, ancho, anchoUtil } = entrada;
  const pxPorPaso = ancho / pasos;
  const escala = (caja.x1 - caja.x0) / anchoUtil;
  const centros = emitidos.map(
    (e) => caja.x0 + ((e.desde + e.hasta + 1) / 2) * pxPorPaso * escala,
  );

  const simbolos = emitidos.map((e, i) => {
    // Cada carácter llega hasta la mitad del camino a sus vecinos.
    const paso = pxPorPaso * escala;
    const izquierda = i > 0 ? (centros[i - 1] + centros[i]) / 2 : centros[i] - 2 * paso;
    const derecha =
      i < centros.length - 1 ? (centros[i] + centros[i + 1]) / 2 : centros[i] + 2 * paso;
    return {
      car: e.car,
      x0: Math.max(caja.x0, izquierda),
      x1: Math.min(caja.x1, derecha),
    };
  });

  const texto = emitidos.map((e) => e.car).join("");
  const confianza = emitidos.length
    ? (100 * emitidos.reduce((s, e) => s + e.prob, 0)) / emitidos.length
    : 0;
  return { texto, confianza, simbolos };
}
