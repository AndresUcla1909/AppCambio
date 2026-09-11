"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Database, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { actualizarBcvAhora } from "@/app/(tabs)/ajustes/acciones";
import { formatearDia } from "@/lib/formato";
import {
  guardarTasaPreferida,
  leerTasaPreferida,
  type TipoTasa,
} from "@/lib/offline";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: TipoTasa; etiqueta: string }[] = [
  { valor: "bcv_usd", etiqueta: "Dólar BCV" },
  { valor: "bcv_eur", etiqueta: "Euro BCV" },
  { valor: "usdt", etiqueta: "USDT" },
];

type Props = {
  ultimaFecha: string | null;
  hayTasaDeHoy: boolean;
};

export function VistaAjustes({ ultimaFecha, hayTasaDeHoy }: Props) {
  const router = useRouter();
  const [preferida, setPreferida] = useState<TipoTasa>("bcv_usd");
  const [actualizando, iniciarActualizacion] = useTransition();

  useEffect(() => {
    const guardada = leerTasaPreferida();
    if (guardada) setPreferida(guardada);
  }, []);

  function elegirPreferida(tipo: TipoTasa) {
    setPreferida(tipo);
    guardarTasaPreferida(tipo);
    toast.success("Preferencia guardada");
  }

  function actualizar() {
    iniciarActualizacion(async () => {
      const resultado = await actualizarBcvAhora();
      if (resultado.ok) {
        toast.success(resultado.mensaje);
        router.refresh();
      } else {
        toast.error(resultado.mensaje);
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      <Seccion titulo="Tasa por defecto">
        <p className="text-muted-foreground text-xs">
          Cuál queda seleccionada al abrir la app.
        </p>
        <div
          role="radiogroup"
          aria-label="Tasa por defecto"
          className="grid grid-cols-3 gap-2"
        >
          {OPCIONES.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={preferida === valor}
              onClick={() => elegirPreferida(valor)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
                preferida === valor
                  ? "border-azul bg-azul-tenue text-azul"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Tasa del BCV">
        <div className="flex items-start gap-2 text-xs">
          {hayTasaDeHoy ? (
            <>
              <CircleCheck className="text-verde mt-px size-3.5 shrink-0" />
              <span className="text-muted-foreground">
                Ya está guardada la tasa de hoy.
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Aún no hay publicación con fecha de hoy. La última guardada es del{" "}
              {formatearDia(ultimaFecha)}.
            </span>
          )}
        </div>
        <Button
          onClick={actualizar}
          disabled={actualizando}
          className="w-full rounded-xl"
        >
          <RefreshCw className={cn("size-4", actualizando && "animate-spin")} />
          {actualizando ? "Consultando al BCV…" : "Ejecutar actualización ahora"}
        </Button>
        <p className="text-muted-foreground text-[11px]">
          Lee bcv.org.ve y guarda la tasa por su fecha valor. Repetirlo el mismo
          día no duplica nada.
        </p>
      </Seccion>

      <Seccion titulo="Datos">
        <div className="text-muted-foreground flex items-start gap-2 text-xs">
          <Database className="mt-px size-3.5 shrink-0" />
          <span>
            El historial se guarda en{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
              datos/tasas.json
            </code>
            , dentro del proyecto. Al conectar Supabase, esto pasa a la base de
            datos sin tocar el resto de la app.
          </span>
        </div>
        <Button
          render={<a href="/api/tasas" target="_blank" rel="noreferrer" />}
          variant="outline"
          className="w-full rounded-xl"
        >
          <Download className="size-4" />
          Ver los datos en crudo
        </Button>
      </Seccion>

      <Seccion titulo="Sesión">
        <p className="text-muted-foreground text-xs">
          El inicio de sesión llega con Supabase. Mientras tanto la app corre
          sólo en este equipo, así que no hace falta autenticarse.
        </p>
      </Seccion>
    </div>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <h2 className="text-sm font-medium">{titulo}</h2>
      {children}
    </section>
  );
}
