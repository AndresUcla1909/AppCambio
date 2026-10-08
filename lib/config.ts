/** Constantes de negocio. Ajustables sin tocar la lógica. */

/** Zona horaria de negocio: Venezuela es UTC-4 fijo, sin horario de verano. */
export const ZONA_HORARIA = "America/Caracas";

/** Cuántos USDT se simulan vender para estimar el precio P2P. */
export const MONTO_USDT = 100;

/** Qué anuncio de la lista tomar (1 = el primero). Se usa el segundo; si sólo hay uno, ése. */
export const POSICION_ANUNCIO = 2;

/** Filtro de métodos de pago de Binance. Vacío = todos. Ej: ["PagoMovil"]. */
export const METODOS_PAGO: string[] = [];

export const URL_BCV = "https://www.bcv.org.ve/";
/** El sitio del BCV a veces se cuelga: pasado este tiempo se da por caído. */
export const TIMEOUT_BCV_MS = 12_000;
export const URL_P2P =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

/** Binance rechaza peticiones sin un User-Agent de navegador. */
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Segundos que el CDN puede servir la respuesta P2P sin volver a pedirla. */
export const CACHE_P2P_SEGUNDOS = 3600;

/**
 * Cuántos días de tasas (BCV y USDT) guarda el teléfono. Lo anterior se
 * descarta solo; si hace falta, se consulta en Supabase cuando hay red.
 */
export const DIAS_BUFFER = 60;

/**
 * Si la tasa usada para una fecha tiene más días que estos, se avisa que está
 * desactualizada. Cuatro cubre un fin de semana largo (viernes → martes).
 */
export const DIAS_MAX_SIN_ACTUALIZAR = 4;

