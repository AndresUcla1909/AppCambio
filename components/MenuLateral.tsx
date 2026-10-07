"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TipoTasa } from "@/lib/preferencias";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: TipoTasa; etiqueta: string; detalle: string }[] = [
  { valor: "bcv_usd", etiqueta: "Dólar BCV", detalle: "Tasa oficial del dólar" },
  { valor: "bcv_eur", etiqueta: "Euro BCV", detalle: "Tasa oficial del euro" },
  { valor: "usdt", etiqueta: "USDT", detalle: "Binance P2P, sólo con la tasa de hoy" },
];

/**
 * Menú lateral de la calculadora. Por ahora sólo trae la tasa por defecto:
 * la que queda seleccionada al abrir la app.
 *
 * Es un diálogo de Base UI: atrapa el foco, se cierra con Escape o tocando
 * fuera, y bloquea el desplazamiento de la página de atrás.
 */
export function MenuLateral({
  preferida,
  onElegir,
}: {
  /** La tasa por defecto guardada; `null` si nunca se eligió (vale el dólar). */
  preferida: TipoTasa | null;
  onElegir: (tipo: TipoTasa) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = preferida ?? "bcv_usd";

  return (
    <Dialog.Root open={abierto} onOpenChange={setAbierto}>
      <Dialog.Trigger
        render={
          <Button variant="ghost" size="icon" aria-label="Abrir el menú" className="-ml-2 rounded-full" />
        }
      >
        <Menu className="size-5" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "bg-card text-card-foreground fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-2xl outline-none",
            "pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)]",
            "data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left",
            "duration-200",
          )}
        >
          <div className="flex items-center justify-between px-4">
            <Dialog.Title className="text-lg font-semibold tracking-tight">Opciones</Dialog.Title>
            <Dialog.Close
              render={<Button variant="ghost" size="icon" aria-label="Cerrar el menú" className="-mr-2 rounded-full" />}
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <section className="mt-5 space-y-2 px-4">
            <h2 className="text-sm font-medium">Tasa por defecto</h2>
            <Dialog.Description className="text-muted-foreground text-xs">
              La que queda seleccionada al abrir la app.
            </Dialog.Description>

            <div role="radiogroup" aria-label="Tasa por defecto" className="space-y-1.5 pt-1">
              {OPCIONES.map(({ valor, etiqueta, detalle }) => {
                const elegida = actual === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={elegida}
                    onClick={() => {
                      onElegir(valor);
                      setAbierto(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:ring-azul focus-visible:ring-2 focus-visible:outline-none",
                      elegida
                        ? "border-azul bg-azul-tenue"
                        : "border-border hover:bg-foreground/5",
                    )}
                  >
                    <span className="flex-1">
                      <span className={cn("block text-sm font-medium", elegida && "text-azul")}>
                        {etiqueta}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">{detalle}</span>
                    </span>
                    {elegida ? <Check className="text-azul size-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
