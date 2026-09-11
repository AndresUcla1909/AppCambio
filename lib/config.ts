/** Constantes de negocio. Ajustables sin tocar la lógica. */

/** Zona horaria de negocio: Venezuela es UTC-4 fijo, sin horario de verano. */
export const ZONA_HORARIA = "America/Caracas";

/** Cuántos USDT se simulan vender para estimar el precio P2P. */
export const MONTO_USDT = 100;

/** Qué anuncio de la lista tomar (1 = el primero). El SPEC pide el segundo. */
export const POSICION_ANUNCIO = 2;

/** Filtro de métodos de pago de Binance. Vacío = todos. Ej: ["PagoMovil"]. */
export const METODOS_PAGO: string[] = [];

export const URL_BCV = "https://www.bcv.org.ve/";
export const URL_P2P =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

/** Binance rechaza peticiones sin un User-Agent de navegador. */
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Segundos que el CDN puede servir la respuesta P2P sin volver a pedirla. */
export const CACHE_P2P_SEGUNDOS = 3600;

/** Clave de localStorage donde se guardan las últimas tasas vistas (modo offline). */
export const CLAVE_CACHE_OFFLINE = "tasas-offline-v1";
export const CLAVE_TASA_PREFERIDA = "tasa-preferida-v1";
