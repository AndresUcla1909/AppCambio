"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GraficoHistorial } from "@/components/historial/GraficoHistorial";
import { FormularioTasa } from "@/components/historial/FormularioTasa";
import { obtenerHistorial } from "@/lib/almacen/navegador";
import type { FilaTasaConVariacion } from "@/lib/almacen/tipos";
import {
  calcularVariacion,
  formatearDia,
  formatearPorcentaje,
  formatearTasa,
  hoyCaracas,
  restarDias,
} from "@/lib/formato";
import { cn } from "@/lib/utils";

/** Los rangos que ofrece el filtro del gráfico. */
const RANGOS = [
  { clave: "7", etiqueta: "7 días", dias: 7 },
  { clave: "30", etiqueta: "30 días", dias: 30 },
  { clave: "90", etiqueta: "90 días", dias: 90 },
  { clave: "todo", etiqueta: "Todo", dias: null },
] as const;

type ClaveRango = (typeof RANGOS)[number]["clave"];

const NOMBRE_FUENTE: Record<string, string> = {
  bcv: "BCV",
  api_respaldo: "Respaldo",
  manual: "Manual",
};

export function VistaHistorial() {
  const [filas, setFilas] = useState<FilaTasaConVariacion[]>([]);
  const [listo, setListo] = useState(false);
  const [rango, setRango] = useState<ClaveRango>("30");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const recargar = useCallback(() => {
    setFilas(obtenerHistorial());
  }, []);

  // El historial está en localStorage, así que sólo se puede leer tras montar.
  useEffect(() => {
    recargar();
    setListo(true);
  }, [recargar]);

  // Las filas llegan de la más reciente a la más antigua.
  const filasDelRango = useMemo(() => {
    const dias = RANGOS.find((r) => r.clave === rango)?.dias;
    if (!dias) return filas;
    const desde = restarDias(hoyCaracas(), dias);
    return filas.filter((f) => f.fecha >= desde);
  }, [filas, rango]);

  function exportarCsv() {
    if (filas.length === 0) {
      toast.error("No hay nada que exportar");
      return;
    }

    const cabecera = ["fecha", "usd", "eur", "variacion_usd_pct", "fuente"];
    const lineas = filas.map((fila) => {
      const variacion = calcularVariacion(fila.usd, fila.usd_anterior);
      return [
        fila.fecha,
        fila.usd,
        fila.eur ?? "",
        variacion == null ? "" : variacion.toFixed(4),
        fila.fuente,
      ].join(",");
    });

    // BOM para que Excel en Windows respete los acentos.
    const contenido = `﻿${[cabecera.join(","), ...lineas].join("\n")}`;
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `tasas-bcv-${hoyCaracas()}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={exportarCsv}
            aria-label="Exportar CSV"
            className="rounded-full"
          >
            <Download className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMostrarFormulario((abierto) => !abierto)}
            aria-label="Agregar o editar tasa"
            aria-expanded={mostrarFormulario}
            className="rounded-full"
          >
            <Plus
              className={cn(
                "size-5 transition-transform",
                mostrarFormulario && "rotate-45",
              )}
            />
          </Button>
        </div>
      </header>

      <div id="cargar" className="scroll-mt-4">
        {mostrarFormulario ? (
          <FormularioTasa
            onGuardada={() => {
              recargar();
              setMostrarFormulario(false);
            }}
          />
        ) : null}
      </div>

      {!listo ? null : filas.length === 0 ? (
        <p className="text-muted-foreground border-border bg-card rounded-2xl border p-6 text-center text-sm">
          Todavía no hay tasas guardadas en este teléfono. Usa el botón + para
          cargar una, o abre la calculadora para que capture la del día.
        </p>
      ) : (
        <>
          <div className="flex gap-1.5">
            {RANGOS.map(({ clave, etiqueta }) => (
              <button
                key={clave}
                type="button"
                onClick={() => setRango(clave)}
                aria-pressed={rango === clave}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  rango === clave
                    ? "bg-azul-tenue text-azul"
                    : "bg-card text-muted-foreground hover:text-foreground border-border border",
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <GraficoHistorial filas={filasDelRango} />

          <div className="border-border bg-card overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-right text-xs">USD</TableHead>
                  <TableHead className="text-right text-xs">EUR</TableHead>
                  <TableHead className="text-right text-xs">Var.</TableHead>
                  <TableHead className="text-right text-xs">Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasDelRango.map((fila) => {
                  const variacion = calcularVariacion(fila.usd, fila.usd_anterior);
                  return (
                    <TableRow key={fila.fecha}>
                      <TableCell className="cifras text-xs whitespace-nowrap">
                        {formatearDia(fila.fecha)}
                      </TableCell>
                      <TableCell className="cifras text-right text-xs">
                        {formatearTasa(fila.usd)}
                      </TableCell>
                      <TableCell className="cifras text-muted-foreground text-right text-xs">
                        {formatearTasa(fila.eur)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "cifras text-right text-xs font-medium",
                          variacion == null
                            ? "text-muted-foreground"
                            : variacion > 0.005
                              ? "text-verde"
                              : variacion < -0.005
                                ? "text-rojo"
                                : "text-muted-foreground",
                        )}
                      >
                        {formatearPorcentaje(variacion)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-[11px]">
                        {NOMBRE_FUENTE[fila.fuente] ?? fila.fuente}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-muted-foreground text-center text-[11px]">
            {filasDelRango.length} de {filas.length} publicaciones · guardadas en
            este teléfono
          </p>
        </>
      )}
    </div>
  );
}
