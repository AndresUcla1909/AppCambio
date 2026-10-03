/**
 * Utilidades de imagen para el lector de precios. Trabajan sobre píxeles RGBA
 * en memoria (lo que entrega un canvas), sin depender del navegador, para que
 * el mismo código corra en el worker y en los tests.
 */

/** Una imagen en memoria: píxeles RGBA fila por fila, como `ImageData`. */
export type Imagen = {
  ancho: number;
  alto: number;
  datos: Uint8ClampedArray | Uint8Array;
};

/** Rectángulo en píxeles: `x0`/`y0` incluidos, `x1`/`y1` excluidos. */
export type Caja = { x0: number; y0: number; x1: number; y1: number };

/** Copia la región indicada, recortada a los bordes de la imagen. */
export function recortar(img: Imagen, caja: Caja): Imagen {
  const x0 = Math.max(0, Math.floor(caja.x0));
  const y0 = Math.max(0, Math.floor(caja.y0));
  const x1 = Math.min(img.ancho, Math.ceil(caja.x1));
  const y1 = Math.min(img.alto, Math.ceil(caja.y1));
  const ancho = Math.max(0, x1 - x0);
  const alto = Math.max(0, y1 - y0);

  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    const desde = ((y0 + y) * img.ancho + x0) * 4;
    datos.set(img.datos.subarray(desde, desde + ancho * 4), y * ancho * 4);
  }
  return { ancho, alto, datos };
}

/**
 * Redimensiona con interpolación bilineal, alineando centros de píxel igual
 * que `cv2.resize` (INTER_LINEAR), que es con lo que se entrenaron los modelos.
 */
export function redimensionar(img: Imagen, ancho: number, alto: number): Imagen {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  const escalaX = img.ancho / ancho;
  const escalaY = img.alto / alto;

  for (let y = 0; y < alto; y++) {
    const sy = Math.min(Math.max((y + 0.5) * escalaY - 0.5, 0), img.alto - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, img.alto - 1);
    const fy = sy - y0;

    for (let x = 0; x < ancho; x++) {
      const sx = Math.min(Math.max((x + 0.5) * escalaX - 0.5, 0), img.ancho - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, img.ancho - 1);
      const fx = sx - x0;

      const a = (y0 * img.ancho + x0) * 4;
      const b = (y0 * img.ancho + x1) * 4;
      const c = (y1 * img.ancho + x0) * 4;
      const d = (y1 * img.ancho + x1) * 4;
      const destino = (y * ancho + x) * 4;
      for (let k = 0; k < 4; k++) {
        const arriba = img.datos[a + k] * (1 - fx) + img.datos[b + k] * fx;
        const abajo = img.datos[c + k] * (1 - fx) + img.datos[d + k] * fx;
        datos[destino + k] = arriba * (1 - fy) + abajo * fy;
      }
    }
  }
  return { ancho, alto, datos };
}

/** Luminancia de cada píxel, de 0 a 255. */
export function aGrises(img: Imagen): Float32Array {
  const grises = new Float32Array(img.ancho * img.alto);
  for (let i = 0, p = 0; i < grises.length; i++, p += 4) {
    grises[i] =
      0.299 * img.datos[p] + 0.587 * img.datos[p + 1] + 0.114 * img.datos[p + 2];
  }
  return grises;
}

/** Umbral de Otsu: el corte que mejor separa tinta de fondo. */
export function umbralOtsu(grises: Float32Array): number {
  const histograma = new Float64Array(256);
  for (const v of grises) histograma[Math.min(255, Math.max(0, Math.round(v)))]++;

  const total = grises.length;
  let sumaTotal = 0;
  for (let i = 0; i < 256; i++) sumaTotal += i * histograma[i];

  let pesoFondo = 0;
  let sumaFondo = 0;
  let mejor = 0;
  let umbral = 127;
  for (let i = 0; i < 256; i++) {
    pesoFondo += histograma[i];
    if (pesoFondo === 0) continue;
    const pesoFrente = total - pesoFondo;
    if (pesoFrente === 0) break;
    sumaFondo += i * histograma[i];
    const mediaFondo = sumaFondo / pesoFondo;
    const mediaFrente = (sumaTotal - sumaFondo) / pesoFrente;
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;
    if (varianza > mejor) {
      mejor = varianza;
      umbral = i;
    }
  }
  return umbral;
}

/**
 * Pasa la imagen al formato que esperan los modelos de PaddleOCR: canales en
 * orden BGR (se entrenaron con OpenCV), planos separados (NCHW) y valores
 * normalizados a [-1, 1].
 */
export function aTensorBGR(img: Imagen, anchoTensor = img.ancho): Float32Array {
  const plano = img.alto * anchoTensor;
  // Lo que sobra a la derecha queda en 0, que normalizado es un gris medio:
  // el mismo relleno que usa PaddleOCR.
  const tensor = new Float32Array(3 * plano);
  for (let y = 0; y < img.alto; y++) {
    for (let x = 0; x < img.ancho; x++) {
      const p = (y * img.ancho + x) * 4;
      const i = y * anchoTensor + x;
      tensor[i] = img.datos[p + 2] / 127.5 - 1;
      tensor[plano + i] = img.datos[p + 1] / 127.5 - 1;
      tensor[2 * plano + i] = img.datos[p] / 127.5 - 1;
    }
  }
  return tensor;
}
