/**
 * Prueba manual de Binance P2P.
 *   npm run probar:p2p
 */
import { MONTO_USDT, POSICION_ANUNCIO } from "../lib/config";
import { obtenerPrecioP2P } from "../lib/binance/p2p";

async function main() {
  console.log(
    `Buscando el anuncio n.º ${POSICION_ANUNCIO} para vender ${MONTO_USDT} USDT …\n`,
  );
  const resultado = await obtenerPrecioP2P();
  console.log("Resultado:");
  console.log(`  precio      : ${resultado.precio} Bs/USDT`);
  console.log(`  anunciante  : ${resultado.anunciante}`);
  console.log(
    `  límites     : ${resultado.limites.min} – ${resultado.limites.max} Bs`,
  );
  console.log(`  pagos       : ${resultado.metodosPago.join(", ") || "(ninguno)"}`);
  console.log(`  posición    : ${resultado.posicion}${resultado.usoRespaldo ? " (respaldo)" : ""}`);
  console.log(`  obtenido en : ${resultado.obtenidoEn}`);
}

main().catch((error) => {
  console.error("FALLÓ:", error);
  process.exit(1);
});
