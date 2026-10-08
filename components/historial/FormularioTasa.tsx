"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectorFecha } from "@/components/SelectorFecha";
import { DIAS_BUFFER } from "@/lib/config";
import { enVentana, inicioVentana } from "@/lib/almacen/buffer";
import { guardarTasa } from "@/lib/almacen/navegador";
import { hoyCaracas, parsearMonto, type DiaISO } from "@/lib/formato";

/**
 * Carga o corrección manual de una tasa, para rellenar los días en que no se
 * abrió la app. Se guarda con `fuente = 'manual'`, en este mismo aparato.
 * Sólo dentro del búfer de 60 días: lo anterior se descartaría al instante.
 */
export function FormularioTasa({
  diaInicial,
  onGuardada,
}: {
  /** La fecha con la que abre (p. ej. la que se miraba en la calculadora); hoy si no. */
  diaInicial?: DiaISO;
  onGuardada: () => void;
}) {
  const [hoy] = useState<DiaISO>(hoyCaracas);
  const [dia, setDia] = useState<DiaISO>(diaInicial ?? hoy);
  const [usd, setUsd] = useState("");
  const [eur, setEur] = useState("");
  const [guardando, setGuardando] = useState(false);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    if (!enVentana(dia, hoy)) {
      toast.error(`Solo se guardan los últimos ${DIAS_BUFFER} días`);
      return;
    }

    const usdNumero = parsearMonto(usd);
    if (usdNumero == null || usdNumero <= 0) {
      toast.error("El dólar debe ser un número mayor que cero");
      return;
    }

    // El euro es opcional, pero si se escribe algo tiene que ser válido.
    const eurNumero = eur.trim() === "" ? null : parsearMonto(eur);
    if (eur.trim() !== "" && (eurNumero == null || eurNumero <= 0)) {
      toast.error("El euro no es un número válido");
      return;
    }

    setGuardando(true);
    try {
      // Se guarda en este aparato, no en un servidor.
      guardarTasa({
        fecha: dia,
        usd: usdNumero,
        eur: eurNumero,
        fuente: "manual",
      });
      toast.success("Tasa guardada");
      setUsd("");
      setEur("");
      onGuardada();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      className="border-border bg-card space-y-3 rounded-2xl border p-4"
    >
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Fecha valor</Label>
        <SelectorFecha dia={dia} onCambiar={setDia} desde={inicioVentana(hoy)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tasa-usd" className="text-muted-foreground text-xs">
            Dólar
          </Label>
          <Input
            id="tasa-usd"
            value={usd}
            onChange={(evento) => setUsd(evento.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="832,49"
            className="cifras h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tasa-eur" className="text-muted-foreground text-xs">
            Euro <span className="opacity-60">(opcional)</span>
          </Label>
          <Input
            id="tasa-eur"
            value={eur}
            onChange={(evento) => setEur(evento.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="968,07"
            className="cifras h-11 rounded-xl"
          />
        </div>
      </div>

      <Button type="submit" disabled={guardando} className="w-full rounded-xl">
        {guardando ? "Guardando…" : "Guardar tasa"}
      </Button>
      <p className="text-muted-foreground text-[11px]">
        Si ya existe una tasa para esa fecha, se reemplaza. El teléfono guarda
        los últimos {DIAS_BUFFER} días.
      </p>
    </form>
  );
}
