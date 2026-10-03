"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parsearMonto } from "@/lib/formato";
import { cn } from "@/lib/utils";

type Props = {
  valor: number;
  onCambiar: (valor: number) => void;
  /** Cómo se ve el valor cuando no se está editando. */
  formato: (valor: number) => string;
  /** Si el valor escrito sirve; los que no, no se aplican. */
  valido?: (valor: number) => boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">;

/**
 * Campo para cantidades y porcentajes. Mientras se escribe respeta el texto
 * tal cual ("0," a medio escribir) y aplica cada valor válido al momento;
 * al salir vuelve a mostrar el valor ya formateado.
 */
export function EntradaNumero({
  valor,
  onCambiar,
  formato,
  valido = () => true,
  className,
  onFocus,
  onBlur,
  ...resto
}: Props) {
  const [texto, setTexto] = useState<string | null>(null);

  return (
    <Input
      {...resto}
      value={texto ?? formato(valor)}
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      onFocus={(evento) => {
        setTexto(formato(valor));
        onFocus?.(evento);
      }}
      onChange={(evento) => {
        const escrito = evento.target.value;
        setTexto(escrito);
        // Vacío cuenta como cero: así se borra un descuento.
        const numero = escrito.trim() === "" ? 0 : parsearMonto(escrito);
        if (numero != null && valido(numero)) onCambiar(numero);
      }}
      onBlur={(evento) => {
        setTexto(null);
        onBlur?.(evento);
      }}
      className={cn("cifras", className)}
    />
  );
}
