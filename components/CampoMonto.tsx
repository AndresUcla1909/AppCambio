"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  etiqueta: string;
  /** Símbolo a la izquierda: "$", "Bs", "€". */
  simbolo: string;
  valor: string;
  onCambiar: (valor: string) => void;
  onCopiar: () => Promise<boolean>;
  deshabilitado?: boolean;
  destacado?: boolean;
};

export function CampoMonto({
  id,
  etiqueta,
  simbolo,
  valor,
  onCambiar,
  onCopiar,
  deshabilitado,
  destacado,
}: Props) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const ok = await onCopiar();
    if (!ok) return;
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1400);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {etiqueta}
      </Label>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-medium"
        >
          {simbolo}
        </span>
        <Input
          id={id}
          value={valor}
          onChange={(evento) => onCambiar(evento.target.value)}
          disabled={deshabilitado}
          // Teclado decimal en iPhone, sin autocorrección ni mayúsculas.
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="0,00"
          className={cn(
            "cifras h-14 rounded-xl pr-12 pl-11 text-lg font-semibold md:text-lg",
            destacado && "border-azul",
          )}
        />
        <button
          type="button"
          onClick={copiar}
          disabled={deshabilitado || valor.trim() === ""}
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          className={cn(
            "text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 transition-colors",
            "focus-visible:ring-azul focus-visible:ring-2 focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {copiado ? (
            <Check className="text-verde size-4" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
