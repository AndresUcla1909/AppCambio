import { cajasDeTexto, DETECCION, entradaDeteccion, type OpcionesDeteccion } from "./deteccion";
import { glifosDelRenglon, patronesDeCentimos } from "./geometria";
import type { Caja, Imagen } from "./imagen";
import type { RenglonLeido } from "./precio";
import {
  ALTO_RECONOCIMIENTO,
  decodificar,
  entradaReconocimiento,
  prepararDiccionario,
} from "./reconocimiento";

/**
 * El lector completo: detecta los renglones, lee los más grandes y mide la
 * tinta de cada uno. No sabe nada del navegador: recibe una función que
 * corre los modelos, que en la app es ONNX Runtime dentro de un worker y en
 * las pruebas es ONNX Runtime en Node.
 */

export type Modelo = "deteccion" | "reconocimiento";

export type Ejecutar = (
  modelo: Modelo,
  tensor: Float32Array,
  forma: number[],
) => Promise<{ datos: Float32Array; forma: readonly number[] }>;

export type OpcionesLector = OpcionesDeteccion & {
  /** Cuántos renglones se leen como mucho: los más grandes. */
  maxRenglones: number;
  /**
   * Los renglones más bajos que esta fracción del más alto no se leen: el
   * precio es de lo más grande de la etiqueta. Basta con que quepan los
   * céntimos pequeños, que miden la mitad del entero.
   */
  altoMinimo: number;
};

export const LECTOR: OpcionesLector = {
  ...DETECCION,
  maxRenglones: 8,
  altoMinimo: 0.3,
};

export type Diccionario = ReturnType<typeof prepararDiccionario>;

export async function leerRenglones(
  img: Imagen,
  ejecutar: Ejecutar,
  diccionario: Diccionario,
  opciones: OpcionesLector = LECTOR,
): Promise<RenglonLeido[]> {
  const entrada = entradaDeteccion(img, opciones.ladoMayor);
  const mapa = await ejecutar("deteccion", entrada.tensor, [1, 3, entrada.alto, entrada.ancho]);
  const cajas = cajasDeTexto(mapa.datos, entrada.ancho, entrada.alto, img.ancho, img.alto, opciones);

  const altoMayor = Math.max(0, ...cajas.map((c) => c.y1 - c.y0));
  const elegidas = cajas
    .filter((c) => c.y1 - c.y0 >= altoMayor * opciones.altoMinimo)
    .sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))
    .slice(0, opciones.maxRenglones);

  const leer = (caja: Caja) => leerCaja(img, caja, ejecutar, diccionario);
  const renglones: RenglonLeido[] = [];
  for (const caja of elegidas) {
    const renglon = await leer(caja);
    if (!renglon) continue;
    // Un precio con céntimos pequeños se lee mejor en dos pedazos.
    renglones.push((await separarCentimos(renglon, leer)) ?? renglon);
  }
  return renglones;
}

/** Reconoce el texto de una caja y mide su tinta. */
async function leerCaja(
  img: Imagen,
  caja: Caja,
  ejecutar: Ejecutar,
  diccionario: Diccionario,
): Promise<RenglonLeido | null> {
  const linea = entradaReconocimiento(img, caja);
  const salida = await ejecutar("reconocimiento", linea.tensor, [
    1,
    3,
    ALTO_RECONOCIMIENTO,
    linea.ancho,
  ]);
  const [, pasos, clases] = salida.forma;
  const lectura = decodificar(salida.datos, pasos, clases, diccionario, linea);
  if (!lectura.texto) return null;

  return {
    texto: lectura.texto,
    confianza: lectura.confianza,
    alto: caja.y1 - caja.y0,
    caja: { x0: caja.x0, y0: caja.y0, x1: caja.x1, y1: caja.y1 },
    simbolos: lectura.simbolos,
    glifos: glifosDelRenglon(img, caja, lectura.texto.replace(/\s/g, "").length),
  };
}

/**
 * Si en el renglón hay un entero seguido de céntimos pequeños ("5⁷⁹"),
 * vuelve a leer los céntimos solos. Junto al entero, el reconocedor los ve
 * a la mitad de tamaño y se le escapan o se le cambian dígitos ("8⁹⁹" sale
 * "89", "$2⁴⁹" sale "s2*0"); recortados y ampliados se leen bien.
 *
 * La forma se busca en las manchas de tinta, no en el texto, que puede
 * venir mal. Sólo se acepta si los céntimos releídos son dos dígitos: así
 * una "H" seguida de "ar", que tiene la misma forma, no cuela.
 *
 * Devuelve el renglón ya con la coma puesta ("5,79"), o `null` si no aplica.
 */
async function separarCentimos(
  renglon: RenglonLeido,
  leer: (caja: Caja) => Promise<RenglonLeido | null>,
): Promise<RenglonLeido | null> {
  if (!renglon.glifos || !renglon.caja) return null;

  // Como mucho dos intentos: cada uno cuesta una lectura más.
  for (const patron of patronesDeCentimos(renglon.glifos).slice(0, 2)) {
    const [c1, c2] = patron.centimos;
    const arriba = Math.min(c1.y0, c2.y0);
    const abajo = Math.max(c1.y1, c2.y1);
    const margen = 0.3 * (abajo - arriba);
    const centimos = await leer({
      x0: c1.x0 - margen,
      y0: arriba - margen,
      x1: c2.x1 + margen,
      y1: abajo + margen,
    });
    const leidos = centimos?.texto.replace(/\s/g, "");
    if (!centimos || !leidos || !/^\d{2}$/.test(leidos)) continue;

    // El entero: los dígitos de la primera lectura que caen sobre sus
    // manchas, que siendo grandes suelen salir bien. Si ahí no hay dígitos,
    // se relee ese tramo solo.
    let entero = digitosEntre(renglon, patron.inicioEntero, c1.x0);
    let prefijo = textoAntesDe(renglon, patron.inicioEntero);
    if (!entero.length) {
      const releido = await leer({ ...renglon.caja, x0: patron.inicioEntero - margen, x1: c1.x0 });
      const final = releido && /^(.*?)(\d+)\s*$/.exec(releido.texto);
      if (!final) continue;
      [, prefijo, entero] = final;
    }

    return {
      texto: `${prefijo}${entero},${leidos}`,
      confianza: Math.min(renglon.confianza, centimos.confianza),
      alto: renglon.alto,
      caja: renglon.caja,
      // Se mide con el entero, que es lo que se ve grande.
      altoTexto: Math.max(...renglon.glifos.map((g) => g.y1 - g.y0)),
    };
  }
  return null;
}

/** Los dígitos leídos cuyo centro cae entre `x0` y `x1`, en orden. */
function digitosEntre(renglon: RenglonLeido, x0: number, x1: number): string {
  return (renglon.simbolos ?? [])
    .filter((s) => /\d/.test(s.car) && (s.x0 + s.x1) / 2 >= x0 && (s.x0 + s.x1) / 2 < x1)
    .map((s) => s.car)
    .join("");
}

/**
 * Lo leído antes de `x` (un "$", "Bs", "REF"): sirve para saber que el
 * precio lleva moneda.
 */
function textoAntesDe(renglon: RenglonLeido, x: number): string {
  return (renglon.simbolos ?? [])
    .filter((s) => (s.x0 + s.x1) / 2 < x)
    .map((s) => s.car)
    .join("");
}
