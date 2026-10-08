"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Menu, Moon, SunMedium, SunMoon, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tema } from "@/lib/tema";
import { guardarTema, useTema } from "@/lib/useTema";
import { cn } from "@/lib/utils";

const TEMAS: { valor: Tema; etiqueta: string; detalle: string; Icono: LucideIcon }[] = [
  { valor: "oscuro", etiqueta: "Oscuro", detalle: "Fondo negro, cómodo de noche", Icono: Moon },
  { valor: "claro", etiqueta: "Claro", detalle: "Fondo blanco, se lee mejor al sol", Icono: SunMedium },
  { valor: "sistema", etiqueta: "Automático", detalle: "Sigue el ajuste del teléfono", Icono: SunMoon },
];

/**
 * Menú lateral de la calculadora: por ahora, el tema claro u oscuro.
 *
 * Es un diálogo de Base UI: atrapa el foco, se cierra con Escape o tocando
 * fuera, y bloquea el desplazamiento de la página de atrás.
 */
export function MenuLateral() {
  const [abierto, setAbierto] = useState(false);
  const { tema } = useTema();

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
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] instalada:bottom-auto instalada:h-[100lvh]",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "bg-card text-card-foreground fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-2xl outline-none",
            // Hasta el borde real en la app instalada (ver `instalada` en globals.css).
            "instalada:bottom-auto instalada:h-[100lvh]",
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
            <h2 className="text-sm font-medium">Tema</h2>
            <Dialog.Description className="text-muted-foreground text-xs">
              Cómo se ve la app en este teléfono.
            </Dialog.Description>

            <div role="radiogroup" aria-label="Tema" className="space-y-1.5 pt-1">
              {TEMAS.map(({ valor, etiqueta, detalle, Icono }) => {
                const elegido = tema === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    // El menú queda abierto: así se ve el cambio al instante.
                    onClick={() => guardarTema(valor)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:ring-azul focus-visible:ring-2 focus-visible:outline-none",
                      elegido ? "border-azul bg-azul-tenue" : "border-border hover:bg-foreground/5",
                    )}
                  >
                    <Icono className={cn("size-4 shrink-0", elegido ? "text-azul" : "text-muted-foreground")} />
                    <span className="flex-1">
                      <span className={cn("block text-sm font-medium", elegido && "text-azul")}>
                        {etiqueta}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">{detalle}</span>
                    </span>
                    {elegido ? <Check className="text-azul size-4 shrink-0" /> : null}
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
