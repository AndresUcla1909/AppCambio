import { aTensorBGR, redimensionar, type Caja, type Imagen } from "./imagen";

/**
 * Detección de texto (PP-OCRv6, red DB): el modelo devuelve, para cada
 * píxel, la probabilidad de que sea texto. Aquí se prepara su entrada y se
 * convierte ese mapa en cajas, una por renglón.
 *
 * Reproduce el posprocesado de PaddleOCR/RapidOCR con una simplificación:
 * las cajas son rectas (sin girar). En una etiqueta que se encuadra de
 * frente el texto va casi horizontal, y así el código queda mucho más simple.
 */

export type CajaDetectada = Caja & { puntaje: number };

export type OpcionesDeteccion = {
  /** Lado mayor de la imagen que entra al modelo, en píxeles. */
  ladoMayor: number;
  /** Probabilidad a partir de la cual un píxel cuenta como texto. */
  umbral: number;
  /** Probabilidad media mínima de una caja para conservarla. */
  umbralCaja: number;
  /** Cuánto se agranda cada caja: el modelo marca sólo el núcleo del texto. */
  expansion: number;
};

export const DETECCION: OpcionesDeteccion = {
  ladoMayor: 640,
  umbral: 0.3,
  umbralCaja: 0.5,
  expansion: 1.6,
};

export type EntradaDeteccion = {
  tensor: Float32Array;
  ancho: number;
  alto: number;
};

/** Escala la imagen a múltiplos de 32 (lo exige la red) y la normaliza. */
export function entradaDeteccion(
  img: Imagen,
  ladoMayor = DETECCION.ladoMayor,
): EntradaDeteccion {
  const escala = ladoMayor / Math.max(img.ancho, img.alto);
  const ancho = Math.max(32, Math.round((img.ancho * escala) / 32) * 32);
  const alto = Math.max(32, Math.round((img.alto * escala) / 32) * 32);
  const escalada = redimensionar(img, ancho, alto);
  return { tensor: aTensorBGR(escalada), ancho, alto };
}

/**
 * Del mapa de probabilidad a cajas en coordenadas de la imagen original.
 * Cada mancha conexa de píxeles "texto" es un renglón.
 */
export function cajasDeTexto(
  mapa: Float32Array,
  ancho: number,
  alto: number,
  imgAncho: number,
  imgAlto: number,
  opciones: OpcionesDeteccion = DETECCION,
): CajaDetectada[] {
  const marcado = binarizar(mapa, ancho, alto, opciones.umbral);
  const etiquetas = new Int32Array(ancho * alto);
  const pila = new Int32Array(ancho * alto);
  const cajas: CajaDetectada[] = [];
  let siguiente = 0;

  for (let inicio = 0; inicio < marcado.length; inicio++) {
    if (!marcado[inicio] || etiquetas[inicio]) continue;

    // Recorre la mancha completa (vecindad de 8) acumulando su contorno y
    // la probabilidad media.
    const etiqueta = ++siguiente;
    let tope = 0;
    pila[tope++] = inicio;
    etiquetas[inicio] = etiqueta;
    let x0 = ancho, y0 = alto, x1 = 0, y1 = 0;
    let suma = 0;
    let cantidad = 0;

    while (tope > 0) {
      const i = pila[--tope];
      const x = i % ancho;
      const y = (i - x) / ancho;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      suma += mapa[i];
      cantidad++;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= alto) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= ancho) continue;
          const j = ny * ancho + nx;
          if (marcado[j] && !etiquetas[j]) {
            etiquetas[j] = etiqueta;
            pila[tope++] = j;
          }
        }
      }
    }

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (Math.min(w, h) < 3) continue;
    const puntaje = suma / cantidad;
    if (puntaje < opciones.umbralCaja) continue;

    // El modelo marca un núcleo más delgado que el texto: se agranda la caja
    // como hace PaddleOCR (distancia = área × razón / perímetro).
    const d = (w * h * opciones.expansion) / (2 * (w + h));
    const escalaX = imgAncho / ancho;
    const escalaY = imgAlto / alto;
    const caja = {
      x0: Math.max(0, (x0 - d) * escalaX),
      y0: Math.max(0, (y0 - d) * escalaY),
      x1: Math.min(imgAncho, (x1 + 1 + d) * escalaX),
      y1: Math.min(imgAlto, (y1 + 1 + d) * escalaY),
      puntaje,
    };
    if (Math.min(caja.x1 - caja.x0, caja.y1 - caja.y0) < 5) continue;
    cajas.push(caja);
  }

  // De arriba abajo y de izquierda a derecha, como se lee.
  return cajas.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/**
 * Píxeles por encima del umbral, dilatados 2×2 como hace RapidOCR: une
 * trazos que el modelo dejó apenas separados.
 */
function binarizar(
  mapa: Float32Array,
  ancho: number,
  alto: number,
  umbral: number,
): Uint8Array {
  const base = new Uint8Array(mapa.length);
  for (let i = 0; i < mapa.length; i++) base[i] = mapa[i] > umbral ? 1 : 0;

  const dilatado = new Uint8Array(mapa.length);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      dilatado[i] =
        base[i] ||
        (x > 0 && base[i - 1]) ||
        (y > 0 && base[i - ancho]) ||
        (x > 0 && y > 0 && base[i - ancho - 1])
          ? 1
          : 0;
    }
  }
  return dilatado;
}
