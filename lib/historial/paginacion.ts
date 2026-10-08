/** Las cantidades de filas por página que ofrece la tabla del historial. */
export const OPCIONES_FILAS = [5, 10, 20, 50] as const;
export type FilasPorPagina = (typeof OPCIONES_FILAS)[number];
/** Al abrir el historial siempre se ven 5: lo reciente sin tener que bajar. */
export const FILAS_POR_DEFECTO: FilasPorPagina = 5;

export function esFilasPorPagina(valor: unknown): valor is FilasPorPagina {
  return OPCIONES_FILAS.includes(valor as FilasPorPagina);
}

export type Pagina<T> = {
  filas: T[];
  /** La página que de verdad se muestra (1 en adelante), ya acotada. */
  pagina: number;
  totalPaginas: number;
  /** Posición de la primera y la última fila visibles (1 en adelante); 0 si no hay filas. */
  desde: number;
  hasta: number;
  total: number;
};

/**
 * Corta la lista en páginas. La página pedida se acota a las que existen: si
 * el rango se achica y la página ya no existe, se muestra la última.
 */
export function paginar<T>(filas: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const tamano = Math.max(1, Math.floor(porPagina) || 1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamano));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const inicio = (actual - 1) * tamano;
  const visibles = filas.slice(inicio, inicio + tamano);
  return {
    filas: visibles,
    pagina: actual,
    totalPaginas,
    desde: visibles.length ? inicio + 1 : 0,
    hasta: inicio + visibles.length,
    total: filas.length,
  };
}
