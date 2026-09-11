/**
 * Guarda en el historial la tasa contenida en el fixture del BCV.
 * Se usó una vez para no perder la publicación del 11/09/2026, que el sitio
 * reemplazó por la del 15/09 mientras se construía la app.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsearHtmlBcv } from "../lib/bcv/scraper";
import { almacen } from "../lib/almacen";
import { formatearDia, formatearTasa } from "../lib/formato";

async function main() {
  const html = readFileSync(
    path.join(process.cwd(), "lib/bcv/__fixtures__/bcv.html"),
    "utf8",
  );
  const tasa = parsearHtmlBcv(html);
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
