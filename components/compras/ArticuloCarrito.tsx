"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntradaNumero } from "@/components/compras/EntradaNumero";
import {
  nombreDe,
  precioUnitario,
  subtotal,
  subtotalSinDescuento,
  type Articulo,
  type EnAmbas,
} from "@/lib/compras/logica";
import { bolivares, cantidad, dolares, porcentaje } from "@/lib/compras/mostrar";
import { cn } from "@/lib/utils";

type Cambios = Partial<Pick<Articulo, "nombre" | "cantidad" | "descuento">>;

/**
 * Un renglón del carrito. El monto en la moneda en que estaba marcado va
 * primero y destacado; el convertido a la tasa BCV, debajo y en gris.
 */
export function ArticuloCarrito({
  articulo,
  indice,
  tasa,
  onCambiar,
  onQuitar,
}: {
  articulo: Articulo;
  /** Posición en el carrito, para el nombre por defecto ("Artículo 3"). */
  indice: number;
  tasa: number | null;
  onCambiar: (cambios: Cambios) => void;
  onQuitar: () => void;
}) {
  const nombre = nombreDe(articulo, indice);
  const enDolares = articulo.moneda === "usd";
  const original = (m: EnAmbas) => (enDolares ? dolares(m.usd) : bolivares(m.bs));
  const convertido = (m: EnAmbas) => (enDolares ? bolivares(m.bs) : dolares(m.usd));

  const unitario = precioUnitario(articulo, tasa);
  const parcial = subtotal(articulo, tasa);
  const conDescuento = articulo.descuento > 0;

  return (
    <li className="border-border bg-card space-y-2 rounded-2xl border p-3">
      <div className="flex items-center gap-1">
        <Input
          value={articulo.nombre}
          onChange={(e) => onCambiar({ nombre: e.target.value })}
          placeholder={nombre}
          aria-label={`Nombre de ${nombre}`}
          autoComplete="off"
          className="h-9 flex-1 rounded-lg border-transparent bg-transparent px-1.5 text-sm font-medium dark:bg-transparent"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onQuitar}
          aria-label={`Quitar ${nombre}`}
          className="text-muted-foreground hover:text-destructive rounded-full"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <p className="text-muted-foreground cifras px-1.5 text-xs">
        <span className="text-foreground font-medium">{original(unitario)}</span> c/u ·{" "}
        {convertido(unitario)}
      </p>

      <div className="flex items-end justify-between gap-2 px-1.5">
        <div className="flex items-center gap-2">
          <div className="border-border flex items-center rounded-lg border">
            <button
              type="button"
              onClick={() => onCambiar({ cantidad: articulo.cantidad - 1 })}
              disabled={articulo.cantidad <= 1}
              aria-label="Uno menos"
              className="text-muted-foreground hover:text-foreground p-2 disabled:opacity-30"
            >
              <Minus className="size-3.5" />
            </button>
            <EntradaNumero
              valor={articulo.cantidad}
              onCambiar={(n) => onCambiar({ cantidad: n })}
              formato={cantidad}
              valido={(n) => n > 0}
              aria-label={`Cantidad de ${nombre}`}
              className="h-8 w-12 rounded-none border-0 px-0 text-center text-sm dark:bg-transparent"
            />
            <button
              type="button"
              onClick={() => onCambiar({ cantidad: articulo.cantidad + 1 })}
              aria-label="Uno más"
              className="text-muted-foreground hover:text-foreground p-2"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          <label className="border-border flex items-center gap-1 rounded-lg border pr-2 pl-1">
            <span className="sr-only">Descuento de {nombre} en porcentaje</span>
            <EntradaNumero
              valor={articulo.descuento}
              onCambiar={(n) => onCambiar({ descuento: n })}
              formato={(n) => (n > 0 ? cantidad(n) : "")}
              valido={(n) => n >= 0 && n <= 100}
              placeholder="0"
              className={cn(
                "h-8 w-10 border-0 px-1 text-right text-sm dark:bg-transparent",
                conDescuento && "text-verde font-medium",
              )}
            />
            <span className="text-muted-foreground text-xs">% desc.</span>
          </label>
        </div>

        <div className="text-right">
          {conDescuento ? (
            <p className="text-muted-foreground cifras text-[11px]">
              <span className="line-through">{original(subtotalSinDescuento(articulo, tasa))}</span>{" "}
              <span className="text-verde font-medium">−{porcentaje(articulo.descuento)}</span>
            </p>
          ) : null}
          <p className="cifras text-sm font-semibold">{original(parcial)}</p>
          <p className="text-muted-foreground cifras text-xs">{convertido(parcial)}</p>
        </div>
      </div>
    </li>
  );
}
