"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enAmbas, type ArticuloNuevo, type MonedaPrecio } from "@/lib/compras/logica";
import { bolivares, dolares } from "@/lib/compras/mostrar";
import { parsearMonto } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Carga a mano de un artículo: para lo que no se puede escanear o cuando el
 * precio está escrito en una pizarra ilegible.
 */
export function FormularioArticulo({
  tasa,
  onAgregar,
}: {
  tasa: number | null;
  onAgregar: (nuevo: ArticuloNuevo) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  // La moneda se recuerda entre artículos: en una misma tienda suele repetirse.
  const [moneda, setMoneda] = useState<MonedaPrecio>("usd");
  const [cantidad, setCantidad] = useState("1");
  const [descuento, setDescuento] = useState("");

  const precioNumero = parsearMonto(precio);
  const vistaPrevia =
    precioNumero != null && precioNumero > 0 ? enAmbas(precioNumero, moneda, tasa) : null;

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const cantidadNumero = parsearMonto(cantidad);
    const descuentoNumero = descuento.trim() === "" ? 0 : parsearMonto(descuento);

    if (precioNumero == null || precioNumero <= 0) {
      toast.error("Escribe un precio mayor que cero");
      return;
    }
    if (cantidadNumero == null || cantidadNumero <= 0) {
      toast.error("La cantidad tiene que ser mayor que cero");
      return;
    }
    if (descuentoNumero == null || descuentoNumero < 0 || descuentoNumero > 100) {
      toast.error("El descuento va de 0 a 100 %");
      return;
    }

    onAgregar({
      nombre,
      precio: precioNumero,
      moneda,
      cantidad: cantidadNumero,
      descuento: descuentoNumero,
    });
    setNombre("");
    setPrecio("");
    setCantidad("1");
    setDescuento("");
  }

  return (
    <form onSubmit={enviar} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="articulo-nombre" className="text-muted-foreground text-xs">
          Producto <span className="opacity-70">(opcional)</span>
        </Label>
        <Input
          id="articulo-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del producto"
          autoComplete="off"
          enterKeyHint="next"
          className="h-11 rounded-xl"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="articulo-precio" className="text-muted-foreground text-xs">
          Precio por unidad
        </Label>
        <div className="flex gap-2">
          <Input
            id="articulo-precio"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            enterKeyHint="next"
            className="cifras h-11 flex-1 rounded-xl text-base"
          />
          <div
            role="radiogroup"
            aria-label="Moneda del precio"
            className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1"
          >
            {(
              [
                ["usd", "$"],
                ["bs", "Bs"],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={moneda === valor}
                onClick={() => setMoneda(valor)}
                className={cn(
                  "min-w-11 rounded-lg px-2 text-sm font-medium transition-colors",
                  moneda === valor ? "bg-azul text-white" : "text-muted-foreground",
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground cifras min-h-4 text-xs">
          {vistaPrevia
            ? moneda === "usd"
              ? `= ${bolivares(vistaPrevia.bs)} a tasa BCV`
              : `= ${dolares(vistaPrevia.usd)} a tasa BCV`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="articulo-cantidad" className="text-muted-foreground text-xs">
            Cantidad
          </Label>
          <Input
            id="articulo-cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="cifras h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="articulo-descuento" className="text-muted-foreground text-xs">
            Descuento %
          </Label>
          <Input
            id="articulo-descuento"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className="cifras h-11 rounded-xl"
          />
        </div>
      </div>

      <Button type="submit" className="h-11 w-full rounded-xl">
        Agregar al carrito
      </Button>
    </form>
  );
}
