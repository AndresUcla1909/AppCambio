import { formatearMonto } from "../formato";

/** Cómo se escriben los montos del carrito, en pantalla y en el PDF. */

export function dolares(monto: number | null): string {
  return monto == null ? "—" : `$ ${formatearMonto(monto)}`;
}

export function bolivares(monto: number | null): string {
  return monto == null ? "—" : `Bs ${formatearMonto(monto)}`;
}

const fmtCantidad = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 3 });

/** "2", "0,5": sin decimales de sobra. */
export function cantidad(valor: number): string {
  return fmtCantidad.format(valor);
}

const fmtPorcentaje = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

export function porcentaje(valor: number): string {
  return `${fmtPorcentaje.format(valor)} %`;
}
