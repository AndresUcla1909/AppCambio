"use client";

import { useState } from "react";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  diaAFecha,
  fechaADia,
  formatearDiaLargo,
  hoyCaracas,
  type DiaISO,
} from "@/lib/formato";

type Props = {
  dia: DiaISO;
  onCambiar: (dia: DiaISO) => void;
  /** Primer día que se puede elegir (p. ej. el inicio del búfer de 60 días). */
  desde?: DiaISO;
};

export function SelectorFecha({ dia, onCambiar, desde }: Props) {
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyCaracas();
  const esHoy = dia === hoy;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-11 w-full justify-start gap-2 rounded-xl text-sm font-normal bajo:h-10"
          />
        }
      >
          <CalendarDays className="text-muted-foreground size-4" />
          <span className="first-letter:uppercase">{formatearDiaLargo(dia)}</span>
          {esHoy ? (
            <span className="bg-azul-tenue text-azul ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium">
              Hoy
            </span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              className="text-muted-foreground hover:text-foreground ml-auto text-[11px] underline underline-offset-2"
              onClick={(evento) => {
                // No debe abrir el calendario, sólo volver a hoy.
                evento.stopPropagation();
                onCambiar(hoy);
              }}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.stopPropagation();
                  evento.preventDefault();
                  onCambiar(hoy);
                }
              }}
            >
              Volver a hoy
            </span>
          )}
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          weekStartsOn={1}
          selected={diaAFecha(dia)}
          defaultMonth={diaAFecha(dia)}
          // No hay tasas del futuro: el BCV publica como mucho el día hábil siguiente.
          disabled={
            desde
              ? [{ after: diaAFecha(hoy) }, { before: diaAFecha(desde) }]
              : { after: diaAFecha(hoy) }
          }
          onSelect={(fecha) => {
            if (!fecha) return;
            onCambiar(fechaADia(fecha));
            setAbierto(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
