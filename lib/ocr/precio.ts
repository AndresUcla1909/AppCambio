import { parsearMonto } from "../formato";
import { enteroYCentimos, PROPORCION_CENTIMOS } from "./geometria";
import type { Caja } from "./imagen";
import type { SimboloLeido } from "./reconocimiento";

/**
 * De lo que lee el OCR al precio que se muestra en el modo cámara.
 *
 * Son funciones puras, sin modelos ni cámara, para poder testearlas: el
 * lector entrega renglones de texto y aquí se decide cuál es el precio y
 * cuándo la lectura es lo bastante estable como para enseñarla.
 */

/** Un renglón de texto que el OCR encontró dentro del visor. */
export type RenglonLeido = {
  texto: string;
  /** De 0 a 100. */
  confianza: number;
  /** Alto del renglón en píxeles: en una etiqueta, el precio es lo más grande. */
  alto: number;
  /** Dónde está. Sin ella no se pueden unir céntimos que quedaron aparte. */
  caja?: Caja;
  /** Dónde cae, más o menos, cada carácter de `texto` (mismo orden). */
  simbolos?: SimboloLeido[];
  /**
   * Las manchas de tinta del renglón, con su tamaño exacto. Con ellas se
   * reconocen los céntimos pequeños pegados al entero.
   */
  glifos?: Caja[];
  /** Alto de la tinta, si ya se midió al armar el renglón (ver `separarCentimos`). */
  altoTexto?: number;
};

/** En qué moneda está el precio al que se apunta. */
export type Direccion = "divisa_a_bs" | "bs_a_divisa";

/** Por debajo de esta confianza el renglón se descarta: suele ser ruido. */
export const CONFIANZA_MINIMA = 55;

/** Cuántas lecturas recientes se miran para decidir qué mostrar. */
export const VENTANA_LECTURAS = 4;

/** Cuántas veces tiene que repetirse un monto en esa ventana para mostrarlo. */
export const REPETICIONES_MINIMAS = 2;

/** Un número encontrado en el texto, con el tramo de caracteres que ocupa. */
type Numero = { monto: number; desde: number; hasta: number; conSeparador: boolean };

/**
 * Dígitos, con separadores en medio aunque el OCR los rodee de espacios
 * ("1 .250 ,00"). El apóstrofo cuenta como coma: así se escriben a mano
 * muchos precios ("7'90").
 */
const NUMERO = /\d(?:\d|\s*[.,'’]\s*\d)*/g;

/**
 * Los números de un renglón que pueden ser precios. Los que son medidas o
 * descuentos ("1kg", "500 g", "2L", "20%") no cuentan: si el precio sale
 * borroso, el "1" de "Harina PAN 1kg" no debe tomar su lugar.
 */
function numerosEnTexto(texto: string): Numero[] {
  const numeros: Numero[] = [];
  for (const coincidencia of texto.matchAll(NUMERO)) {
    const desde = coincidencia.index;
    const hasta = desde + coincidencia[0].length;
    if (!pareceUnPrecio(texto.slice(0, desde), texto.slice(hasta))) continue;

    const limpio = coincidencia[0].replace(/\s+/g, "").replace(/['’]/g, ",");
    const conSeparador = /[.,]/.test(limpio);
    // Códigos de barras y de producto: ningún precio lleva tantos dígitos
    // seguidos (ni en bolívares: un millón sin separadores son siete).
    const digitos = limpio.replace(/\D/g, "").length;
    if (digitos > (conSeparador ? 10 : 7)) continue;

    const monto = parsearMonto(limpio);
    if (monto != null && monto > 0) {
      numeros.push({ monto, desde, hasta, conSeparador });
    }
  }
  return numeros;
}

/** Los montos de un renglón que pueden ser precios. */
export function montosEnTexto(texto: string): number[] {
  return numerosEnTexto(texto).map((n) => n.monto);
}

/**
 * Monedas que pueden ir pegadas al número: "3,50Bs" o "REF12.99" sí son
 * precios. Una "s" suelta delante es casi siempre un "$" mal leído.
 */
const MONEDA_DELANTE = /(?:bs|ref|usd|(?:^|[^a-z])s)$/i;
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

/** Un precio posible: su valor, el tamaño con que está escrito y sus señas. */
type Candidato = {
  monto: number;
  alto: number;
  confianza: number;
  /** Lleva "$", "€", "Bs" o "REF" al lado. */
  conMoneda: boolean;
  /** Tiene céntimos. */
  conDecimales: boolean;
};

/** Tamaños a menos de esta distancia del mayor cuentan como "igual de grandes". */
const TOLERANCIA_TAMANO = 0.12;

/**
 * Elige el precio entre lo leído: el número escrito más grande (de tamaño de
 * letra, no de valor), porque en una etiqueta el precio es lo que más
 * resalta. Entre los de tamaño parecido gana el que lleva moneda, luego el
 * que tiene céntimos, luego el más grande y luego el de más confianza.
 *
 * Antes junta los céntimos escritos pequeños junto al entero ("5⁷⁹"), que
 * el OCR entrega pegados ("579") o en una caja aparte ("5" y "79").
 */
export function elegirPrecio(renglones: RenglonLeido[]): number | null {
  const validos = renglones.filter((r) => r.confianza >= CONFIANZA_MINIMA);
  const candidatos = validos.flatMap((r) => candidatosDelRenglon(r));
  candidatos.push(...centimosEnOtraCaja(validos));
  if (!candidatos.length) return null;

  const altoMayor = Math.max(...candidatos.map((c) => c.alto));
  const grandes = candidatos.filter((c) => c.alto >= altoMayor * (1 - TOLERANCIA_TAMANO));
  grandes.sort(
    (a, b) =>
      Number(b.conMoneda) - Number(a.conMoneda) ||
      Number(b.conDecimales) - Number(a.conDecimales) ||
      b.alto - a.alto ||
      b.confianza - a.confianza,
  );
  return grandes[0].monto;
}

/** Los precios posibles de un renglón, con céntimos pequeños ya unidos. */
function candidatosDelRenglon(renglon: RenglonLeido): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const numero of numerosEnTexto(renglon.texto)) {
    const pegados = numero.conSeparador ? null : centimosPegados(renglon, numero);
    // Las manchas dicen que hay céntimos, pero los dígitos leídos no cuadran:
    // el OCR se comió alguno. Mejor no proponer nada que un precio falso.
    if (pegados === "dudoso") continue;
    candidatos.push({
      monto: pegados ?? numero.monto,
      alto: altoDeTinta(renglon, numero.desde, numero.hasta),
      confianza: renglon.confianza,
      conMoneda: monedaAlLado(renglon.texto, numero.desde, numero.hasta),
      conDecimales: pegados != null || numero.conSeparador,
    });
  }
  return candidatos;
}

/**
 * "579" leído de un "5⁷⁹": si las dos últimas manchas de tinta del número
 * son mucho más pequeñas que las primeras, los dos últimos dígitos son
 * céntimos. Da igual que vayan arriba (lo usual) o abajo (algunas etiquetas
 * electrónicas).
 */
function centimosPegados(
  renglon: RenglonLeido,
  numero: Numero,
): number | "dudoso" | null {
  const glifos = glifosDelTramo(renglon, numero.desde, numero.hasta);
  if (!glifos || glifos.length < 3) return null;
  const patron = enteroYCentimos(glifos);
  if (!patron) return null;

  const digitos = renglon.texto.slice(numero.desde, numero.hasta).replace(/\D/g, "");
  // Un "$" del tamaño de los dígitos cuenta como mancha del entero.
  const conDolar = /\$\s*$/.test(renglon.texto.slice(0, numero.desde));
  const posibles = conDolar ? [patron.enteros, patron.enteros - 1] : [patron.enteros];

  for (const n of posibles) {
    if (n >= 1 && digitos.length === n + 2) {
      return Number(digitos.slice(0, n)) + Number(digitos.slice(n)) / 100;
    }
    // Una mancha más que dígitos leídos: el OCR junta dos iguales seguidos
    // cuando son muy pequeños ("8⁹⁹" sale "89"). Sólo se da por buena si el
    // último dígito leído cubre las dos manchas; si no, el OCR se comió
    // otro dígito ("10⁹⁸" leído "108") y no hay forma de saber cuál.
    if (n >= 1 && digitos.length === n + 1 && ultimoCubre(renglon, numero, patron.centimos)) {
      return Number(digitos.slice(0, n)) + Number(digitos[n] + digitos[n]) / 100;
    }
  }
  return "dudoso";
}

/** Si el último dígito leído del número cae sobre las dos manchas de céntimos. */
function ultimoCubre(renglon: RenglonLeido, numero: Numero, centimos: Caja[]): boolean {
  const simbolo = renglon.simbolos?.[numero.hasta - 1];
  if (!simbolo) return false;
  return centimos.every((g) => {
    const centro = (g.x0 + g.x1) / 2;
    return centro >= simbolo.x0 && centro <= simbolo.x1;
  });
}

/**
 * "41" y "99" en cajas separadas, con la segunda mucho más pequeña y pegada
 * a la derecha: es 41,99.
 */
function centimosEnOtraCaja(renglones: RenglonLeido[]): Candidato[] {
  const candidatos: Candidato[] = [];

  for (const a of renglones) {
    const entero = /(\d+)\s*$/.exec(a.texto);
    // El entero no puede tener ya decimales ("3,50" seguido de algo).
    if (!a.caja || !entero || /[.,'’]\s*\d*$/.test(a.texto.slice(0, entero.index))) {
      continue;
    }
    const altoA = altoDeTinta(a, entero.index, a.texto.length);

    for (const b of renglones) {
      if (b === a || !b.caja) continue;
      const cents = /^\s*[.,'’]?\s*(\d{2})\s*$/.exec(b.texto);
      if (!cents) continue;

      const altoB = altoDeTinta(b, 0, b.texto.length);
      const pegadaALaDerecha =
        b.caja.x0 >= a.caja.x1 - 0.3 * altoA && b.caja.x0 - a.caja.x1 <= 0.8 * altoA;
      // En la franja del entero: ni un renglón de arriba ni uno de abajo.
      const centroB = (b.caja.y0 + b.caja.y1) / 2;
      const enLaFranja = centroB > a.caja.y0 && centroB < a.caja.y1;
      if (!pegadaALaDerecha || !enLaFranja || altoB > PROPORCION_CENTIMOS * altoA) continue;

      candidatos.push({
        monto: Number(entero[1]) + Number(cents[1]) / 100,
        // Un poco más que el entero solo, para que gane frente a él.
        alto: altoA + 0.5,
        confianza: Math.min(a.confianza, b.confianza),
        conMoneda: monedaAlLado(a.texto, entero.index, a.texto.length),
        conDecimales: true,
      });
    }
  }
  return candidatos;
}

/** Si el número lleva al lado un "$", "€", "Bs" o "REF". */
function monedaAlLado(texto: string, desde: number, hasta: number): boolean {
  const antes = texto.slice(Math.max(0, desde - 5), desde);
  const despues = texto.slice(hasta, hasta + 5);
  return (
    /(?:\$|€|bs\.?|ref|usd|(?:^|[^a-z])s)\s*$/i.test(antes) ||
    /^\s*(?:\$|€|bs|ref|usd)/i.test(despues)
  );
}

/**
 * Las manchas de tinta que caen en un tramo del texto, de izquierda a
 * derecha. La posición de cada carácter es aproximada, así que se toma la
 * mancha si su centro cae en el tramo.
 */
export function glifosDelTramo(
  renglon: RenglonLeido,
  desde: number,
  hasta: number,
): Caja[] | null {
  const { simbolos, glifos } = renglon;
  if (!simbolos || !glifos || simbolos.length !== renglon.texto.length) return null;
  const x0 = simbolos[desde].x0;
  const x1 = simbolos[hasta - 1].x1;
  return glifos.filter((g) => {
    const centro = (g.x0 + g.x1) / 2;
    return centro >= x0 && centro <= x1;
  });
}

/**
 * Qué tan grande está escrito un tramo del renglón: la mancha de tinta más
 * alta que cae en él. Si no se midieron, se estima con el alto del renglón,
 * descontando el margen que el detector deja alrededor del texto.
 */
function altoDeTinta(renglon: RenglonLeido, desde: number, hasta: number): number {
  if (renglon.altoTexto) return renglon.altoTexto;
  if (!renglon.glifos) return renglon.alto;
  const estimado = renglon.alto * 0.75;
  const glifos = glifosDelTramo(renglon, desde, hasta);
  const medido = glifos?.length ? Math.max(...glifos.map((g) => g.y1 - g.y0)) : 0;
  // Con reflejos o mucho desenfoque un dígito sale en pedazos: si lo medido
  // no llega ni a la mitad del renglón, vale más la estimación.
  return medido >= 0.45 * renglon.alto ? medido : estimado;
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
