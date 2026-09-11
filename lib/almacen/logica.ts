import type { DiaISO } from "../formato";
import type {
  FilaTasa,
  FilaTasaConVariacion,
  TasaNueva,
  TasaVigente,
} from "./tipos";

/**
 * Lógica del historial, sin depender de dónde estén guardadas las filas.
 *
 * Son funciones puras: reciben el arreglo de filas y devuelven uno nuevo.
 * Reproducen lo que en el SPEC original hacía Postgres (la vista con `lag()`
 * y la función `tasa_bcv_en`), para que el resultado sea el mismo ahora que
 * los datos viven en el navegador.
 */

/** Ordena de la fecha más antigua a la más reciente. */
export function ordenarAscendente(filas: FilaTasa[]): FilaTasa[] {
  return [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Añade `usd_anterior` / `eur_anterior` mirando la publicación previa.
 * Equivale al `lag(usd) over (order by fecha)` de la vista SQL.
 */
export function conVariacion(filas: FilaTasa[]): FilaTasaConVariacion[] {
  let usdPrevio: number | null = null;
  let eurPrevio: number | null = null;

  return ordenarAscendente(filas).map((fila) => {
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

/** Historial listo para mostrar: de la más reciente a la más antigua. */
export function historial(
  filas: FilaTasa[],
  limite?: number,
): FilaTasaConVariacion[] {
  const descendentes = conVariacion(filas).reverse();
  return limite ? descendentes.slice(0, limite) : descendentes;
}

/**
 * La tasa vigente en una fecha: la última publicada con fecha valor <= la
 * pedida. Los fines de semana y feriados no tienen publicación propia, así
 * que devuelven la del último día hábil con `es_exacta: false`.
 */
export function tasaVigenteEn(
  filas: FilaTasa[],
  fecha: DiaISO,
): TasaVigente | null {
  const enriquecidas = conVariacion(filas);
  const vigentes = enriquecidas.filter((f) => f.fecha <= fecha);
  const fila = vigentes[vigentes.length - 1];
  if (!fila) return null;

  return {
    fecha: fila.fecha,
    usd: fila.usd,
    eur: fila.eur,
    usd_anterior: fila.usd_anterior,
    eur_anterior: fila.eur_anterior,
    fuente: fila.fuente,
    fecha_solicitada: fecha,
    es_exacta: fila.fecha === fecha,
  };
}

/**
 * Inserta o reemplaza por fecha, sin mutar el arreglo original.
 * Idempotente: guardar dos veces el mismo día no duplica ni pierde el
 * `creado_en` de la primera vez.
 */
export function upsert(filas: FilaTasa[], nueva: TasaNueva): FilaTasa[] {
  const ahora = new Date().toISOString();
  const indice = filas.findIndex((f) => f.fecha === nueva.fecha);

  if (indice >= 0) {
    const copia = [...filas];
    copia[indice] = {
      ...copia[indice],
      usd: nueva.usd,
      eur: nueva.eur,
      fuente: nueva.fuente,
      actualizado_en: ahora,
    };
    return ordenarAscendente(copia);
  }

  return ordenarAscendente([
    ...filas,
    {
      fecha: nueva.fecha,
      usd: nueva.usd,
      eur: nueva.eur,
      fuente: nueva.fuente,
      creado_en: ahora,
      actualizado_en: ahora,
    },
  ]);
}

/**
 * Valida filas que vienen de fuera (un respaldo importado, o el localStorage
 * de una versión anterior). Descarta en silencio lo que no tenga forma de
 * tasa en vez de romper la app.
 */
export function sanear(datos: unknown): FilaTasa[] {
  if (!Array.isArray(datos)) return [];

  const vistas = new Set<string>();
  const limpias: FilaTasa[] = [];

  for (const cruda of datos) {
    const fila = saneaUna(cruda);
    if (!fila) continue;
    // Ante fechas repetidas gana la primera; el archivo no debería traerlas.
    if (vistas.has(fila.fecha)) continue;
    vistas.add(fila.fecha);
    limpias.push(fila);
  }

  return ordenarAscendente(limpias);
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const FUENTES = new Set(["bcv", "api_respaldo", "manual"]);

function saneaUna(cruda: unknown): FilaTasa | null {
  if (!cruda || typeof cruda !== "object") return null;
  const objeto = cruda as Record<string, unknown>;

  const fecha = objeto.fecha;
  if (typeof fecha !== "string" || !DIA_ISO.test(fecha)) return null;
  if (Number.isNaN(new Date(`${fecha}T00:00:00Z`).getTime())) return null;

  const usd = Number(objeto.usd);
  if (!Number.isFinite(usd) || usd <= 0) return null;

  const eurCrudo = Number(objeto.eur);
  const eur = Number.isFinite(eurCrudo) && eurCrudo > 0 ? eurCrudo : null;

  const fuente =
    typeof objeto.fuente === "string" && FUENTES.has(objeto.fuente)
      ? (objeto.fuente as FilaTasa["fuente"])
      : "manual";

  const ahora = new Date().toISOString();
  const creado =
    typeof objeto.creado_en === "string" ? objeto.creado_en : ahora;
  const actualizado =
    typeof objeto.actualizado_en === "string" ? objeto.actualizado_en : creado;

  return { fecha, usd, eur, fuente, creado_en: creado, actualizado_en: actualizado };
}

/**
 * Funde un respaldo importado con lo que ya hay. Ante la misma fecha manda la
 * fila más recientemente actualizada, para que reimportar un archivo viejo no
 * pise correcciones nuevas.
 */
export function fundir(actuales: FilaTasa[], entrantes: FilaTasa[]): FilaTasa[] {
  const porFecha = new Map<string, FilaTasa>();
  for (const fila of actuales) porFecha.set(fila.fecha, fila);

  for (const entrante of entrantes) {
    const existente = porFecha.get(entrante.fecha);
    if (!existente || entrante.actualizado_en > existente.actualizado_en) {
      porFecha.set(entrante.fecha, entrante);
    }
  }

  return ordenarAscendente([...porFecha.values()]);
}
