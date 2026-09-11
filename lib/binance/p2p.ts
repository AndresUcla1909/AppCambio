import {
  METODOS_PAGO,
  MONTO_USDT,
  POSICION_ANUNCIO,
  URL_P2P,
  USER_AGENT,
} from "../config";

/* ------------------------------------------------------------------ */
/* Forma real de la respuesta de Binance (verificada el 11/09/2026)    */
/* ------------------------------------------------------------------ */

export type AnuncioP2P = {
  adv: {
    price: string;
    tradableQuantity: string;
    minSingleTransAmount: string;
    maxSingleTransAmount: string;
    tradeMethods?: Array<{
      identifier?: string;
      tradeMethodName?: string;
      tradeMethodShortName?: string;
    }>;
  };
  advertiser: {
    nickName: string;
    monthOrderCount?: number;
    monthFinishRate?: number;
  };
};

type RespuestaBinance = {
  success?: boolean;
  code?: string;
  message?: string | null;
  data?: AnuncioP2P[] | null;
};

/** Lo que la app consume. */
export type PrecioP2P = {
  precio: number;
  anunciante: string;
  limites: { min: number; max: number };
  metodosPago: string[];
  obtenidoEn: string;
  /** Posición del anuncio elegido, 1-indexada. */
  posicion: number;
  /** `true` si no había suficientes anuncios y hubo que conformarse. */
  usoRespaldo: boolean;
};

export class ErrorP2P extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorP2P";
  }
}

/* ------------------------------------------------------------------ */
/* Selección del anuncio — pura, para poder testearla                  */
/* ------------------------------------------------------------------ */

/**
 * Filtra los anuncios que de verdad sirven para la operación y devuelve el
 * que ocupa `posicion` (1-indexada). Si no hay tantos, devuelve el último
 * disponible y lo marca como respaldo.
 *
 * Un anuncio sirve si alcanza para vender `montoUsdt` y si el monto en
 * bolívares cae dentro de los límites que el anunciante acepta.
 */
export function elegirAnuncio(
  anuncios: AnuncioP2P[],
  opciones: { montoUsdt: number; montoBs: number; posicion: number },
): { anuncio: AnuncioP2P; posicion: number; usoRespaldo: boolean } | null {
  const { montoUsdt, montoBs, posicion } = opciones;

  const utiles = anuncios.filter((item) => {
    const disponible = Number(item.adv.tradableQuantity);
    const min = Number(item.adv.minSingleTransAmount);
    const max = Number(item.adv.maxSingleTransAmount);
    if (!Number.isFinite(disponible) || disponible < montoUsdt) return false;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
    return montoBs >= min && montoBs <= max;
  });

  if (utiles.length === 0) return null;

  const indiceDeseado = Math.max(0, posicion - 1);
  if (indiceDeseado < utiles.length) {
    return { anuncio: utiles[indiceDeseado], posicion, usoRespaldo: false };
  }
  // Menos anuncios de los esperados: se usa el último y se avisa.
  return {
    anuncio: utiles[utiles.length - 1],
    posicion: utiles.length,
    usoRespaldo: true,
  };
}

export function nombresMetodosPago(anuncio: AnuncioP2P): string[] {
  return (anuncio.adv.tradeMethods ?? [])
    .map((m) => m.tradeMethodShortName || m.tradeMethodName || m.identifier)
    .filter((n): n is string => Boolean(n));
}

/* ------------------------------------------------------------------ */
/* Llamada a Binance                                                   */
/* ------------------------------------------------------------------ */

async function buscarAnuncios(transAmount: string): Promise<AnuncioP2P[]> {
  let respuesta: Response;
  try {
    respuesta = await fetch(URL_P2P, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        asset: "USDT",
        fiat: "VES",
        // "SELL" = el usuario vende USDT (pestaña "Vender" de Binance).
        tradeType: "SELL",
        page: 1,
        rows: 20,
        payTypes: METODOS_PAGO,
        publisherType: null,
        transAmount,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new ErrorP2P(
      `No se pudo contactar a Binance: ${(error as Error).message}`,
    );
  }

  if (!respuesta.ok) {
    throw new ErrorP2P(`Binance respondió ${respuesta.status}`);
  }

  let json: RespuestaBinance;
  try {
    json = (await respuesta.json()) as RespuestaBinance;
  } catch {
    // Un bloqueo geográfico suele llegar como HTML, no como JSON.
    throw new ErrorP2P("Binance devolvió una respuesta ilegible (¿bloqueo por IP?).");
  }

  if (json.success === false) {
    throw new ErrorP2P(json.message || `Binance rechazó la consulta (${json.code}).`);
  }

  return json.data ?? [];
}

/**
 * Precio aproximado de vender `MONTO_USDT` USDT en Binance P2P.
 *
 * Se consulta en dos pasos porque `transAmount` va expresado en bolívares,
 * no en USDT (comprobado: enviar "100" devuelve cero resultados):
 *   1. Una consulta sin monto, para saber a cuánto anda el mercado.
 *   2. Otra filtrando por los bolívares que equivalen a esos 100 USDT.
 */
export async function obtenerPrecioP2P(): Promise<PrecioP2P> {
  const referencia = await buscarAnuncios("");
  if (referencia.length === 0) {
    throw new ErrorP2P("Binance no devolvió anuncios de USDT/VES.");
  }

  const precioReferencia = Number(referencia[0].adv.price);
  if (!Number.isFinite(precioReferencia) || precioReferencia <= 0) {
    throw new ErrorP2P("El precio de referencia de Binance no es un número válido.");
  }

  const montoBs = Math.round(MONTO_USDT * precioReferencia);
  const filtrados = await buscarAnuncios(String(montoBs));

  // Si el filtro por monto deja la lista vacía, se recurre a la primera
  // consulta y se filtra en local.
  const candidatos = filtrados.length > 0 ? filtrados : referencia;

  const elegido = elegirAnuncio(candidatos, {
    montoUsdt: MONTO_USDT,
    montoBs,
    posicion: POSICION_ANUNCIO,
  });

  if (!elegido) {
    throw new ErrorP2P(
      `Ningún anuncio admite vender ${MONTO_USDT} USDT en este momento.`,
    );
  }

  const precio = Number(elegido.anuncio.adv.price);
  if (!Number.isFinite(precio) || precio <= 0) {
    throw new ErrorP2P("El precio del anuncio elegido no es válido.");
  }

  return {
    precio,
    anunciante: elegido.anuncio.advertiser.nickName,
    limites: {
      min: Number(elegido.anuncio.adv.minSingleTransAmount),
      max: Number(elegido.anuncio.adv.maxSingleTransAmount),
    },
    metodosPago: nombresMetodosPago(elegido.anuncio),
    obtenidoEn: new Date().toISOString(),
    posicion: elegido.posicion,
    usoRespaldo: elegido.usoRespaldo,
  };
}
