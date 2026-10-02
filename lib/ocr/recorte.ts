/** Geometría del visor del modo cámara. Pura, para poder testearla. */

export type Tamano = { ancho: number; alto: number };
export type Rectangulo = { x: number; y: number; ancho: number; alto: number };

/**
 * Traduce el recuadro del visor (en píxeles de pantalla, relativo al video)
 * a píxeles reales del video, que es lo que hay que recortar para el OCR.
 *
 * El video se pinta con `object-fit: cover`: se escala hasta llenar la
 * pantalla y lo que sobra se corta por los lados. Por eso no basta una regla
 * de tres; hay que deshacer esa escala y ese desplazamiento.
 *
 * Devuelve `null` si el video todavía no tiene tamaño o si el recuadro cae
 * fuera de la imagen.
 */
export function recorteEnVideo(
  video: Tamano,
  elemento: Tamano,
  marco: Rectangulo,
): Rectangulo | null {
  if (video.ancho <= 0 || video.alto <= 0) return null;
  if (elemento.ancho <= 0 || elemento.alto <= 0) return null;

  const escala = Math.max(
    elemento.ancho / video.ancho,
    elemento.alto / video.alto,
  );
  // Cuánto del video escalado queda fuera de la pantalla por cada lado.
  const desfaseX = (elemento.ancho - video.ancho * escala) / 2;
  const desfaseY = (elemento.alto - video.alto * escala) / 2;

  const x0 = acotar((marco.x - desfaseX) / escala, video.ancho);
  const y0 = acotar((marco.y - desfaseY) / escala, video.alto);
  const x1 = acotar((marco.x + marco.ancho - desfaseX) / escala, video.ancho);
  const y1 = acotar((marco.y + marco.alto - desfaseY) / escala, video.alto);

  const x = Math.round(x0);
  const y = Math.round(y0);
  const ancho = Math.round(x1) - x;
  const alto = Math.round(y1) - y;
  if (ancho < 1 || alto < 1) return null;

  return { x, y, ancho, alto };
}

function acotar(valor: number, maximo: number): number {
  return Math.min(Math.max(valor, 0), maximo);
}
