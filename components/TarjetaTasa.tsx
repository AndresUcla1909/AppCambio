"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatearPorcentaje, formatearTasa } from "@/lib/formato";

type Props = {
  titulo: string;
  /** Texto pequeño bajo el valor: "Bs por dólar", "brecha vs BCV"… */
  pie?: string;
  valor: number | null;
  /** Variación respecto a la publicación anterior, o brecha, en por ciento. */
  variacion?: number | null;
  /** Cómo nombrar esa variación en el lector de pantalla. */
  etiquetaVariacion?: string;
  seleccionada: boolean;
  onSeleccionar: () => void;
  cargando?: boolean;
  /** Si viene, la tarjeta se apaga y muestra este motivo. */
  deshabilitada?: string;
  className?: string;
};

export function TarjetaTasa({
  titulo,
  pie,
  valor,
  variacion,
  etiquetaVariacion = "variación",
  seleccionada,
  onSeleccionar,
  cargando = false,
  deshabilitada,
  className,
}: Props) {
  const inactiva = Boolean(deshabilitada) || (valor == null && !cargando);

  return (
    <button
      type="button"
      onClick={onSeleccionar}
      disabled={inactiva}
      aria-pressed={seleccionada}
      className={cn(
        "relative flex w-full flex-col gap-1 rounded-2xl border p-4 text-left transition-all",
        "focus-visible:ring-azul focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        seleccionada
          ? "border-azul bg-azul-tenue shadow-[0_0_0_1px_var(--azul)]"
          : "bg-card border-border",
        inactiva ? "opacity-45" : "active:scale-[0.98]",
        className,
      )}
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {titulo}
      </span>

      {cargando ? (
        <Skeleton className="my-1 h-7 w-28" />
      ) : (
        <span className="cifras text-2xl leading-tight font-semibold">
          {formatearTasa(valor)}
        </span>
      )}

      {deshabilitada ? (
        <span className="text-muted-foreground text-xs">{deshabilitada}</span>
      ) : (
        <div className="flex items-center gap-1.5 text-xs">
          <Variacion valor={variacion} etiqueta={etiquetaVariacion} />
          {pie ? <span className="text-muted-foreground">{pie}</span> : null}
        </div>
      )}
    </button>
  );
}

function Variacion({
  valor,
  etiqueta,
}: {
  valor: number | null | undefined;
  etiqueta: string;
}) {
  if (valor == null) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="size-3" />
        <span className="sr-only">Sin {etiqueta}</span>
      </span>
    );
  }

  // Una diferencia menor a una centésima se considera sin cambio.
  const sinCambio = Math.abs(valor) < 0.005;
  const Icono = sinCambio ? Minus : valor > 0 ? ArrowUpRight : ArrowDownRight;
  const color = sinCambio
    ? "text-muted-foreground"
    : valor > 0
      ? "text-verde"
      : "text-rojo";

  return (
    <span className={cn("cifras inline-flex items-center gap-0.5 font-medium", color)}>
      <Icono className="size-3.5" />
      <span aria-label={etiqueta}>{formatearPorcentaje(valor)}</span>
    </span>
  );
}
