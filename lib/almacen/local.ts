import { promises as fs } from "node:fs";
import path from "node:path";
import type { DiaISO } from "../formato";
import type {
  FilaTasa,
  FilaTasaConVariacion,
  RepositorioTasas,
  TasaNueva,
  TasaVigente,
} from "./tipos";

/**
 * Almacén de desarrollo: un archivo JSON en `datos/tasas.json`.
 *
 * Sirve para trabajar en localhost sin base de datos. En Vercel el sistema de
 * archivos es efímero, así que antes de desplegar hay que sustituir esto por
 * la implementación de Supabase — misma interfaz, distinto backend.
 */

const ARCHIVO = path.join(process.cwd(), "datos", "tasas.json");

/** Las escrituras se encadenan para que dos peticiones no se pisen el archivo. */
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

async function leerArchivo(): Promise<FilaTasa[]> {
  try {
    const crudo = await fs.readFile(ARCHIVO, "utf8");
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos as FilaTasa[];
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException)?.code;
    if (codigo === "ENOENT") return [];
    // Un JSON corrupto no debe tumbar la app: se trata como archivo vacío.
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

async function escribirArchivo(filas: FilaTasa[]): Promise<void> {
  await fs.mkdir(path.dirname(ARCHIVO), { recursive: true });
  const ordenadas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Escritura atómica: primero a un temporal, luego se renombra.
  const temporal = `${ARCHIVO}.tmp`;
  await fs.writeFile(temporal, JSON.stringify(ordenadas, null, 2), "utf8");
  await fs.rename(temporal, ARCHIVO);
}

/** Añade `usd_anterior` / `eur_anterior` mirando la fila previa por fecha. */
function conVariacion(ascendentes: FilaTasa[]): FilaTasaConVariacion[] {
  let usdPrevio: number | null = null;
  let eurPrevio: number | null = null;

  return ascendentes.map((fila) => {
    const enriquecida: FilaTasaConVariacion = {
      ...fila,
      usd_anterior: usdPrevio,
      eur_anterior: eurPrevio,
    };
    usdPrevio = fila.usd;
    // Un euro ausente no borra la referencia anterior.
    if (fila.eur != null) eurPrevio = fila.eur;
    return enriquecida;
  });
}

export const almacenLocal: RepositorioTasas = {
  async listar(limite) {
    const filas = await leerArchivo();
    const ascendentes = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const enriquecidas = conVariacion(ascendentes).reverse();
    return limite ? enriquecidas.slice(0, limite) : enriquecidas;
  },

  async tasaEn(fecha: DiaISO) {
    const filas = await leerArchivo();
    const ascendentes = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const enriquecidas = conVariacion(ascendentes);

    // La última publicación con fecha valor <= la pedida.
    const vigentes = enriquecidas.filter((f) => f.fecha <= fecha);
    const fila = vigentes[vigentes.length - 1];
    if (!fila) return null;

    const resultado: TasaVigente = {
      fecha: fila.fecha,
      usd: fila.usd,
      eur: fila.eur,
      usd_anterior: fila.usd_anterior,
      eur_anterior: fila.eur_anterior,
      fuente: fila.fuente,
      fecha_solicitada: fecha,
      es_exacta: fila.fecha === fecha,
    };
    return resultado;
  },

  async guardar(tasa: TasaNueva) {
    return enCola(async () => {
      const filas = await leerArchivo();
      const ahora = new Date().toISOString();
      const indice = filas.findIndex((f) => f.fecha === tasa.fecha);

      let guardada: FilaTasa;
      if (indice >= 0) {
        // Upsert: se conserva `creado_en` original.
        guardada = {
          ...filas[indice],
          usd: tasa.usd,
          eur: tasa.eur,
          fuente: tasa.fuente,
          actualizado_en: ahora,
        };
        filas[indice] = guardada;
      } else {
        guardada = {
          fecha: tasa.fecha,
          usd: tasa.usd,
          eur: tasa.eur,
          fuente: tasa.fuente,
          creado_en: ahora,
          actualizado_en: ahora,
        };
        filas.push(guardada);
      }

      await escribirArchivo(filas);
      return guardada;
    });
  },
};
