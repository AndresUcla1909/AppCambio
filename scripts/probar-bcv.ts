/**
 * Prueba manual del scraping del BCV.
 *   npm run probar:bcv
 *   npm run probar:bcv -- --guardar   (guarda el HTML como fixture de tests)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { URL_BCV } from "../lib/config";
import { descargarHtmlBcv, parsearHtmlBcv } from "../lib/bcv/scraper";

async function main() {
  console.log(`Descargando ${URL_BCV} …`);
  // La misma descarga que la app: con tiempo límite y el reintento para el
  // certificado incompleto del BCV.
  const html = await descargarHtmlBcv();
  console.log(`HTML recibido: ${html.length} caracteres\n`);

  if (process.argv.includes("--guardar")) {
    const destino = path.join(process.cwd(), "lib/bcv/__fixtures__/bcv.html");
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, html, "utf8");
    console.log(`Fixture guardado en ${destino}\n`);
  }

  const tasa = parsearHtmlBcv(html);
  console.log("Tasa interpretada:");
  console.log(`  fecha valor : ${tasa.fecha}`);
  console.log(`  USD         : ${tasa.usd}`);
  console.log(`  EUR         : ${tasa.eur ?? "(no publicado)"}`);
}

main().catch((error) => {
  console.error("FALLÓ:", error);
  process.exit(1);
});
