import { aGrises, recortar, umbralOtsu, type Caja, type Imagen } from "./imagen";

/**
 * Las manchas de tinta de un renglón, cada una con su caja exacta.
 *
 * El OCR dice qué caracteres hay pero sólo aproxima dónde. Para saber si
 * unos dígitos están escritos más pequeños ("5⁷⁹", que el OCR lee "579"),
 * hace falta su tamaño real: aquí se separa la tinta del fondo y se mide
 * cada mancha conexa, que en un precio impreso suele ser un carácter.
 *
 * `caracteres` es cuántos leyó el OCR: sirve para decidir qué es tinta.
 */
export function glifosDelRenglon(img: Imagen, caja: Caja, caracteres: number): Caja[] {
  const recorte = recortar(img, caja);
  const { ancho, alto } = recorte;
  if (ancho < 3 || alto < 3) return [];

  // El umbral se calcula en el centro de la caja, que es casi todo texto y
  // fondo de la etiqueta: en los márgenes asoma lo que hay alrededor (un
  // pastel oscuro, otra etiqueta) y lo descuadraría.
  const grises = aGrises(recorte);
  const centro: number[] = [];
  for (let y = Math.floor(alto * 0.2); y < Math.ceil(alto * 0.8); y++) {
    for (let x = Math.floor(ancho * 0.05); x < Math.ceil(ancho * 0.95); x++) {
      centro.push(grises[y * ancho + x]);
    }
  }
  const umbral = umbralOtsu(Float32Array.from(centro.length ? centro : grises));

  // El texto puede ser oscuro sobre claro o claro sobre oscuro (blanco sobre
  // rojo), y con números muy gruesos la tinta ni siquiera es minoría. Se
  // prueban las dos y gana la que da tantas manchas como caracteres leídos.
  const desdeX = Math.max(0, Math.floor(caja.x0));
  const desdeY = Math.max(0, Math.floor(caja.y0));
  const oscura = manchas(grises, ancho, alto, (v) => v <= umbral, desdeX, desdeY);
  const clara = manchas(grises, ancho, alto, (v) => v > umbral, desdeX, desdeY);
  return Math.abs(oscura.length - caracteres) <= Math.abs(clara.length - caracteres)
    ? oscura
    : clara;
}

/** Las manchas conexas de tinta, ya filtradas y ordenadas de izquierda a derecha. */
function manchas(
  grises: Float32Array,
  ancho: number,
  alto: number,
  esTinta: (v: number) => boolean,
  desdeX: number,
  desdeY: number,
): Caja[] {
  const tinta = new Uint8Array(grises.length);
  for (let i = 0; i < grises.length; i++) tinta[i] = esTinta(grises[i]) ? 1 : 0;

  const etiquetas = new Int32Array(ancho * alto);
  const pila = new Int32Array(ancho * alto);
  const glifos: Caja[] = [];
  let siguiente = 0;

  for (let inicio = 0; inicio < tinta.length; inicio++) {
    if (!tinta[inicio] || etiquetas[inicio]) continue;

    const etiqueta = ++siguiente;
    let tope = 0;
    pila[tope++] = inicio;
    etiquetas[inicio] = etiqueta;
    let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;

    while (tope > 0) {
      const i = pila[--tope];
      const x = i % ancho;
      const y = (i - x) / ancho;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      // Vecindad de 4: con 8, dígitos borrosos que apenas se rozan se unen.
      if (x > 0 && tinta[i - 1] && !etiquetas[i - 1]) { etiquetas[i - 1] = etiqueta; pila[tope++] = i - 1; }
      if (x < ancho - 1 && tinta[i + 1] && !etiquetas[i + 1]) { etiquetas[i + 1] = etiqueta; pila[tope++] = i + 1; }
      if (y > 0 && tinta[i - ancho] && !etiquetas[i - ancho]) { etiquetas[i - ancho] = etiqueta; pila[tope++] = i - ancho; }
      if (y < alto - 1 && tinta[i + ancho] && !etiquetas[i + ancho]) { etiquetas[i + ancho] = etiqueta; pila[tope++] = i + ancho; }
    }

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    // Lo que toca el borde y es enorme es fondo: el canto de la etiqueta, la
    // mercancía de al lado. Un carácter puede rozar el borde (si la caja
    // quedó justa) sin ocupar tanto.
    const tocaBorde = x0 === 0 || y0 === 0 || x1 === ancho - 1 || y1 === alto - 1;
    const fondo = tocaBorde && (w > 0.5 * ancho || h > 0.95 * alto);
    // Motas demasiado bajas para ser un dígito, y rayas finas (bordes de
    // carteles, reflejos) que ningún dígito es: un "1" es bastante más ancho.
    const mota = h < alto * 0.15;
    const raya = w < 0.15 * h;
    if (fondo || mota || raya) continue;

    glifos.push({ x0: desdeX + x0, y0: desdeY + y0, x1: desdeX + x1 + 1, y1: desdeY + y1 + 1 });
  }
  return separarPares(unirPartes(glifos.sort((a, b) => a.x0 - b.x0)));
}

/**
 * Los céntimos escritos aparte miden como mucho esto del entero. Lo que se
 * achica por la perspectiva queda muy por encima (85 % o más).
 */
export const PROPORCION_CENTIMOS = 0.72;

/**
 * Si además están claramente subidos, se aceptan céntimos menos pequeños:
 * la perspectiva achica los dígitos pero no los sube.
 */
const PROPORCION_CENTIMOS_ELEVADOS = 0.85;

/** Un entero de manchas grandes seguido de dos manchas pequeñas: "5⁷⁹". */
export type PatronCentimos = {
  /** Cuántas manchas grandes forman el entero. */
  enteros: number;
  /** Desde dónde empieza el entero, en horizontal. */
  inicioEntero: number;
  centimos: [Caja, Caja];
};

/**
 * Busca, de izquierda a derecha, un entero de manchas grandes seguido de
 * dos manchas mucho más pequeñas pegadas a él: los céntimos de "5⁷⁹". Lo
 * que venga detrás ("LB", el canto del cartel) no importa.
 */
export function enteroYCentimos(glifos: Caja[]): PatronCentimos | null {
  return patronesDeCentimos(glifos)[0] ?? null;
}

/**
 * Todos los lugares del renglón con forma de entero y céntimos. Las letras
 * también pueden tenerla (una "H" mayúscula seguida de "ar"): quien los use
 * tiene que confirmar que lo pequeño son dos dígitos.
 */
export function patronesDeCentimos(glifos: Caja[]): PatronCentimos[] {
  const alto = (g: Caja) => g.y1 - g.y0;
  const patrones: PatronCentimos[] = [];

  for (let k = 1; k + 1 < glifos.length; k++) {
    // El entero: las manchas grandes seguidas que terminan justo antes de k.
    // Lo de más atrás (el nombre del producto, un "$" chico) no cuenta.
    const entero = [glifos[k - 1]];
    const altoUltima = alto(glifos[k - 1]);
    for (let j = k - 2; j >= 0; j--) {
      const g = glifos[j];
      const parecido = alto(g) >= 0.75 * altoUltima && alto(g) <= altoUltima / 0.75;
      const pegado = entero[0].x0 - g.x1 <= 0.6 * altoUltima;
      if (!parecido || !pegado) break;
      entero.unshift(g);
    }
    const altoMayor = Math.max(...entero.map(alto));
    const arriba = Math.min(...entero.map((g) => g.y0));
    const abajo = Math.max(...entero.map((g) => g.y1));
    const fin = Math.max(...entero.map((g) => g.x1));
    const centimos: [Caja, Caja] = [glifos[k], glifos[k + 1]];

    const centroEntero = (arriba + abajo) / 2;
    const esCentimo = (g: Caja) => {
      const centro = (g.y0 + g.y1) / 2;
      const elevado = centro <= centroEntero - 0.15 * altoMayor;
      const pequeno =
        alto(g) <= PROPORCION_CENTIMOS * altoMayor ||
        (elevado && alto(g) <= PROPORCION_CENTIMOS_ELEVADOS * altoMayor);
      // Pequeños de verdad (no una coma ni una mota) y dentro de la franja
      // del entero: arriba (lo usual) o abajo (algunas etiquetas electrónicas).
      return pequeno && alto(g) >= 0.3 * altoMayor && centro >= arriba && centro <= abajo;
    };
    const [c1, c2] = centimos;
    // El primero pegado a la derecha del entero; el segundo, al primero.
    const juntos =
      c1.x0 >= fin - 0.15 * altoMayor &&
      c1.x0 - fin <= 0.8 * altoMayor &&
      c2.x0 >= c1.x1 - 0.15 * altoMayor &&
      c2.x0 - c1.x1 <= 0.5 * altoMayor;
    if (juntos && esCentimo(c1) && esCentimo(c2)) {
      patrones.push({
        enteros: entero.length,
        inicioEntero: Math.min(...entero.map((g) => g.x0)),
        centimos,
      });
    }
  }
  return patrones;
}

/**
 * Junta las piezas de un mismo carácter (un "5" con el trazo cortado, el
 * punto de una "i"): manchas que se solapan casi del todo en horizontal.
 */
function unirPartes(glifos: Caja[]): Caja[] {
  const unidos: Caja[] = [];
  for (const g of glifos) {
    const previo = unidos[unidos.length - 1];
    if (previo) {
      const solape = Math.min(previo.x1, g.x1) - Math.max(previo.x0, g.x0);
      const angosto = Math.min(previo.x1 - previo.x0, g.x1 - g.x0);
      if (solape > 0.6 * angosto) {
        previo.x0 = Math.min(previo.x0, g.x0);
        previo.y0 = Math.min(previo.y0, g.y0);
        previo.x1 = Math.max(previo.x1, g.x1);
        previo.y1 = Math.max(previo.y1, g.y1);
        continue;
      }
    }
    unidos.push({ ...g });
  }
  return unidos;
}

/**
 * Dos dígitos pequeños borrosos ("⁷⁹") pueden salir como una sola mancha
 * el doble de ancha que alta: se parte por la mitad. Sólo se hace con las
 * pequeñas, que es donde pasa; un "00" grande pegado no estorba.
 */
function separarPares(glifos: Caja[]): Caja[] {
  const altoMayor = Math.max(0, ...glifos.map((g) => g.y1 - g.y0));
  return glifos.flatMap((g) => {
    const w = g.x1 - g.x0;
    const h = g.y1 - g.y0;
    if (h > 0.75 * altoMayor || w < 1.25 * h) return [g];
    const medio = g.x0 + w / 2;
    return [
      { ...g, x1: medio },
      { ...g, x0: medio },
    ];
  });
}
