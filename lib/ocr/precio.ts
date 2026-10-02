import { parsearMonto } from "../formato";

/**
 * De lo que lee el OCR al precio que se muestra en el modo cámara.
 *
 * Son funciones puras, sin Tesseract ni cámara, para poder testearlas: el
 * lector entrega renglones de texto y aquí se decide cuál es el precio y
 * cuándo la lectura es lo bastante estable como para enseñarla.
 */

/** Un renglón de texto que el OCR encontró dentro del visor. */
export type RenglonLeido = {
  texto: string;
  /** De 0 a 100, según Tesseract. */
  confianza: number;
  /** Alto del renglón en píxeles: en una etiqueta, el precio es lo más grande. */
  alto: number;
};

/** En qué moneda está el precio al que se apunta. */
export type Direccion = "divisa_a_bs" | "bs_a_divisa";

/** Por debajo de esta confianza el renglón se descarta: suele ser ruido. */
export const CONFIANZA_MINIMA = 55;

/** Cuántas lecturas recientes se miran para decidir qué mostrar. */
export const VENTANA_LECTURAS = 4;

/** Cuántas veces tiene que repetirse un monto en esa ventana para mostrarlo. */
export const REPETICIONES_MINIMAS = 2;

/**
 * Saca los montos de un renglón. El OCR a veces separa los dígitos de sus
 * separadores con espacios ("1 .250 ,00") o deja signos sueltos en los
 * extremos; eso se limpia antes de interpretar cada número.
 *
 * Los números que son medidas o descuentos ("1kg", "500 g", "2L", "20%") no
 * cuentan: si el precio sale borroso, el "1" de "Harina PAN 1kg" no debe
 * tomar su lugar.
 */
export function montosEnTexto(texto: string): number[] {
  const unido = texto.replace(/\s*([.,])\s*/g, "$1");

  const montos: number[] = [];
  for (const coincidencia of unido.matchAll(/\d[\d.,]*\d|\d/g)) {
    const antes = unido.slice(0, coincidencia.index);
    const despues = unido.slice(coincidencia.index + coincidencia[0].length);
    if (!pareceUnPrecio(antes, despues)) continue;

    const monto = parsearMonto(coincidencia[0]);
    if (monto != null && monto > 0) montos.push(monto);
  }
  return montos;
}

/** Monedas que pueden ir pegadas al número: "3,50Bs" o "REF12.99" sí son precios. */
const MONEDA_DELANTE = /(?:bs|ref|usd)$/i;
const MONEDA_DETRAS = /^\s*(?:bs|ref|usd)\b/i;
/** Una letra pegada delante: "x6" (paquete de seis), el "1" de "2x1". */
const LETRA_DELANTE = /[a-záéíóúñ]$/i;
/** Una letra pegada detrás: "1kg", "500g", "2L", el "2" de "2x1". */
const LETRA_DETRAS = /^[a-záéíóúñ]/i;
/** Una unidad separada por espacio: "1 kg", "500 g", "250 ml". */
const UNIDAD_SEPARADA =
  /^\s+(?:kgs?|grs?|g|mg|lts?|l|ml|cc|cm|mm|m|oz|lbs?|und|unid|uds|un|pzas?)\b/i;

/**
 * Mira lo que rodea a un número para decidir si puede ser un precio o si es
 * una medida, una cantidad o un porcentaje.
 */
function pareceUnPrecio(antes: string, despues: string): boolean {
  if (/^\s*%/.test(despues)) return false;
  if (LETRA_DELANTE.test(antes) && !MONEDA_DELANTE.test(antes)) return false;
  if (MONEDA_DETRAS.test(despues)) return true;
  return !LETRA_DETRAS.test(despues) && !UNIDAD_SEPARADA.test(despues);
}

/**
 * Elige el precio entre lo leído: el número escrito más grande (de tamaño de
 * letra, no de valor), porque en una etiqueta el precio es lo que más
 * resalta. A igual tamaño gana el renglón con más confianza.
 */
export function elegirPrecio(renglones: RenglonLeido[]): number | null {
  let mejor: { monto: number; alto: number; confianza: number } | null = null;

  for (const renglon of renglones) {
    if (renglon.confianza < CONFIANZA_MINIMA) continue;

    for (const monto of montosEnTexto(renglon.texto)) {
      const esMejor =
        mejor == null ||
        renglon.alto > mejor.alto ||
        (renglon.alto === mejor.alto && renglon.confianza > mejor.confianza);
      if (esMejor) {
        mejor = { monto, alto: renglon.alto, confianza: renglon.confianza };
      }
    }
  }

  return mejor?.monto ?? null;
}

/** Añade una lectura (o `null` si no vio ningún precio) y conserva las últimas. */
export function registrarLectura(
  lecturas: (number | null)[],
  nueva: number | null,
): (number | null)[] {
  return [...lecturas, nueva].slice(-VENTANA_LECTURAS);
}

/**
 * Decide qué monto mostrar. El OCR en vivo titubea de un cuadro a otro, así
 * que el resultado sólo cambia cuando un monto se repite; mientras tanto se
 * deja el anterior para que no parpadee. Si el visor pasa toda la ventana
 * sin ver números, se limpia.
 */
export function montoAMostrar(
  lecturas: (number | null)[],
  anterior: number | null,
): number | null {
  const repeticiones = new Map<number, number>();
  let elegido: number | null = null;
  let maximo = 0;

  // De la más reciente a la más vieja: a igual número de repeticiones gana
  // la que se vio último.
  for (let i = lecturas.length - 1; i >= 0; i--) {
    const lectura = lecturas[i];
    if (lectura == null) continue;
    const veces = (repeticiones.get(lectura) ?? 0) + 1;
    repeticiones.set(lectura, veces);
    if (veces > maximo) {
      maximo = veces;
      elegido = lectura;
    }
  }

  if (elegido != null && maximo >= REPETICIONES_MINIMAS) return elegido;

  const sinNumeros =
    lecturas.length >= VENTANA_LECTURAS && lecturas.every((l) => l == null);
  return sinNumeros ? null : anterior;
}

/** Pasa el precio leído a la otra moneda con la tasa elegida. */
export function convertirPrecio(
  monto: number,
  tasa: number,
  direccion: Direccion,
): number {
  return direccion === "divisa_a_bs" ? monto * tasa : monto / tasa;
}
