/**
 * Captura la tasa del BCV y la guarda, sin levantar el servidor.
 *   npm run capturar
 */
import { obtenerTasaBcv } from "../lib/bcv/scraper";
import { almacen } from "../lib/almacen";
import { formatearDia, formatearTasa } from "../lib/formato";

async function main() {
  const tasa = await obtenerTasaBcv();
  const guardada = await almacen.guardar({
    fecha: tasa.fecha,
    usd: tasa.usd,
    eur: tasa.eur,
    fuente: "bcv",
  });
  console.log(
    `Guardada la tasa del ${formatearDia(guardada.fecha)}: ` +
      `USD ${formatearTasa(guardada.usd)} · EUR ${formatearTasa(guardada.eur)}`,
  );
}

main().catch((error) => {
  console.error("FALLÓ:", error);
  process.exit(1);
});
