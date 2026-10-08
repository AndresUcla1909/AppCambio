"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CloudOff,
  Download,
  Plus,
} from "lucide-react";
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
import { DIAS_BUFFER } from "@/lib/config";
import { leerEnlaceCargar } from "@/lib/historial/enlaceCarga";
import { useEnLinea, useFilasBuffer } from "@/lib/almacen/hooks";
import { fundir, historial } from "@/lib/almacen/logica";
import type { FilaTasa } from "@/lib/almacen/tipos";
import { configSupabase, consultarRango } from "@/lib/supabase/tasas";
import {
  FILAS_POR_DEFECTO,
  OPCIONES_FILAS,
  esFilasPorPagina,
  paginar,
  type FilasPorPagina,
  type Pagina,
} from "@/lib/historial/paginacion";
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

function suscribirHash(alCambiar: () => void): () => void {
  window.addEventListener("hashchange", alCambiar);
  return () => window.removeEventListener("hashchange", alCambiar);
}

function leerHash(): string {
  return location.hash;
}

/** Lo que respondió Supabase para un rango. */
type Remotas = { rango: ClaveRango; filas: FilaTasa[] } | { rango: ClaveRango; error: true };

export function VistaHistorial() {
  // El búfer de 60 días del teléfono; `null` hasta montar (vive en localStorage).
  const locales = useFilasBuffer();
  const enLinea = useEnLinea();
  const conSupabase = configSupabase() != null;
  const [rango, setRango] = useState<ClaveRango>("30");
  const [remotas, setRemotas] = useState<Remotas | null>(null);
  // El formulario abre solo si se llegó desde "Cargarla manualmente" de la
  // calculadora (#cargar=fecha); después manda lo que toque la persona.
  const pedidoCarga = leerEnlaceCargar(useSyncExternalStore(suscribirHash, leerHash, () => ""));
  const [formularioElegido, setFormularioElegido] = useState<boolean | null>(null);
  const mostrarFormulario = formularioElegido ?? pedidoCarga != null;

  function cambiarFormulario(abierto: boolean) {
    setFormularioElegido(abierto);
    // Que recargar la página no lo vuelva a abrir.
    if (pedidoCarga) history.replaceState(null, "", location.pathname);
  }
  // La tabla va por páginas: con 60 filas o más se hacía eterna. Siempre abre
  // con 5 filas; lo que se elija dura mientras se está en la pantalla.
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<FilasPorPagina>(FILAS_POR_DEFECTO);

  const dias = RANGOS.find((r) => r.clave === rango)?.dias ?? null;
  const desde = dias == null ? null : restarDias(hoyCaracas(), dias);
  // Más allá del búfer hace falta Supabase.
  const excedeBuffer = dias == null || dias > DIAS_BUFFER;
  const debeConsultar = excedeBuffer && enLinea && conSupabase;

  useEffect(() => {
    const config = configSupabase();
    if (!debeConsultar || !config) return;
    let cancelado = false;
    consultarRango(desde, { config })
      .then((filas) => {
        // La variación se recalcula junto con las locales: sólo la tasa.
        const base = filas.map(({ fecha, usd, eur, fuente, creado_en, actualizado_en }) => ({
          fecha,
          usd,
          eur,
          fuente,
          creado_en,
          actualizado_en,
        }));
        if (!cancelado) setRemotas({ rango, filas: base });
      })
      .catch(() => {
        if (!cancelado) setRemotas({ rango, error: true });
      });
    return () => {
      cancelado = true;
    };
  }, [debeConsultar, desde, rango]);

  const remotasDelRango =
    debeConsultar && remotas?.rango === rango && "filas" in remotas ? remotas.filas : null;
  const errorRemoto = debeConsultar && remotas?.rango === rango && "error" in remotas;
  const cargandoRemoto = debeConsultar && remotas?.rango !== rango;

  // De la más reciente a la más antigua. Ante la misma fecha, la versión
  // actualizada más recientemente (local o de Supabase).
  const filas = useMemo(() => {
    if (!locales) return [];
    return historial(remotasDelRango ? fundir(remotasDelRango, locales) : locales);
  }, [locales, remotasDelRango]);
  const listo = locales != null;

  const filasDelRango = useMemo(
    () => (desde ? filas.filter((f) => f.fecha >= desde) : filas),
    [filas, desde],
  );

  const vista = paginar(filasDelRango, pagina, porPagina);

  // Por qué no se ve más allá de los 60 días, si es el caso.
  const avisoRango = !excedeBuffer || remotasDelRango
    ? null
    : cargandoRemoto
      ? "Buscando en el historial en línea…"
      : !conSupabase
        ? `El teléfono guarda solo los últimos ${DIAS_BUFFER} días y el historial en línea no está configurado.`
        : !enLinea
          ? `Sin conexión: el teléfono guarda solo los últimos ${DIAS_BUFFER} días.`
          : errorRemoto
            ? `No se pudo consultar el historial en línea; se muestran los últimos ${DIAS_BUFFER} días.`
            : null;

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
            onClick={() => cambiarFormulario(!mostrarFormulario)}
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

      {mostrarFormulario ? (
        // La tabla se actualiza sola al guardar: lee el búfer como estado.
        <FormularioTasa
          diaInicial={pedidoCarga?.dia ?? undefined}
          onGuardada={() => cambiarFormulario(false)}
        />
      ) : null}

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
                onClick={() => {
                  setRango(clave);
                  setPagina(1);
                }}
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

          {avisoRango ? (
            <p className="text-muted-foreground flex items-start gap-2 text-[11px]">
              <CloudOff className="mt-px size-3.5 shrink-0" />
              {avisoRango}
            </p>
          ) : null}

          <GraficoHistorial filas={filasDelRango} />

          <div className="border-border bg-card overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-right text-xs">USD</TableHead>
                  <TableHead className="text-right text-xs">EUR</TableHead>
                  <TableHead className="text-right text-xs">Var.</TableHead>
                  {/* Bajo 375 px no cabe: es el dato menos útil (casi siempre "BCV"). */}
                  <TableHead className="text-right text-xs max-[374px]:hidden">Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vista.filas.map((fila) => {
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
                      <TableCell className="text-muted-foreground text-right text-[11px] max-[374px]:hidden">
                        {NOMBRE_FUENTE[fila.fuente] ?? fila.fuente}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Paginacion
            vista={vista}
            porPagina={porPagina}
            onPagina={setPagina}
            onPorPagina={(n) => {
              setPorPagina(n);
              setPagina(1);
            }}
          />

          <p className="text-muted-foreground text-center text-[11px]">
            {filasDelRango.length} de {filas.length} publicaciones ·{" "}
            {remotasDelRango
              ? "teléfono + historial en línea"
              : `últimos ${DIAS_BUFFER} días guardados en este teléfono`}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Debajo de la tabla: cuántas filas mostrar y los botones de página. En
 * pantallas angostas los dos grupos bajan a renglones distintos.
 */
function Paginacion<T>({
  vista,
  porPagina,
  onPagina,
  onPorPagina,
}: {
  vista: Pagina<T>;
  porPagina: number;
  onPagina: (pagina: number) => void;
  onPorPagina: (filas: FilasPorPagina) => void;
}) {
  // Con menos filas que la opción más chica, no hay nada que elegir.
  if (vista.total <= OPCIONES_FILAS[0]) return null;

  return (
    <nav aria-label="Páginas del historial" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      {/* Select nativo: en el teléfono abre el selector del sistema. */}
      <label className="text-muted-foreground flex items-center gap-2 text-[11px]">
        Filas
        <span className="relative">
          <select
            value={porPagina}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (esFilasPorPagina(n)) onPorPagina(n);
            }}
            className={cn(
              "cifras border-border bg-card text-foreground h-9 appearance-none rounded-lg border py-0 pr-7 pl-3 text-xs font-medium",
              "focus-visible:ring-azul focus-visible:ring-2 focus-visible:outline-none",
            )}
          >
            {OPCIONES_FILAS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
        </span>
      </label>

      {/* « » saltan al principio y al final: con "Todo" son más de cien páginas. */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPagina(1)}
          disabled={vista.pagina <= 1}
          aria-label="Primera página"
          className="rounded-full"
        >
          <ChevronsLeft className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPagina(vista.pagina - 1)}
          disabled={vista.pagina <= 1}
          aria-label="Página anterior"
          className="rounded-full"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <span className="cifras text-muted-foreground min-w-20 text-center text-xs" aria-live="polite">
          <span className="text-foreground font-medium">
            {vista.desde}–{vista.hasta}
          </span>{" "}
          de {vista.total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPagina(vista.pagina + 1)}
          disabled={vista.pagina >= vista.totalPaginas}
          aria-label="Página siguiente"
          className="rounded-full"
        >
          <ChevronRight className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPagina(vista.totalPaginas)}
          disabled={vista.pagina >= vista.totalPaginas}
          aria-label="Última página"
          className="rounded-full"
        >
          <ChevronsRight className="size-5" />
        </Button>
      </div>
    </nav>
  );
}
