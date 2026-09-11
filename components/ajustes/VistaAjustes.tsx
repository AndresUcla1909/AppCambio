"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  RefreshCw,
  Share2,
  Smartphone,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TasaBcv } from "@/lib/bcv/scraper";
import {
  borrarTodo,
  contarFilas,
  exportar,
  guardarTasa,
  importar,
  obtenerTasaVigente,
} from "@/lib/almacen/navegador";
import { formatearDia, formatearTasa, hoyCaracas } from "@/lib/formato";
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

export function VistaAjustes() {
  const [preferida, setPreferida] = useState<TipoTasa>("bcv_usd");
  const [total, setTotal] = useState(0);
  const [ultima, setUltima] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  function refrescarEstado() {
    setTotal(contarFilas());
    setUltima(obtenerTasaVigente(hoyCaracas())?.fecha ?? null);
  }

  useEffect(() => {
    const guardada = leerTasaPreferida();
    if (guardada) setPreferida(guardada);
    refrescarEstado();
  }, []);

  function elegirPreferida(tipo: TipoTasa) {
    setPreferida(tipo);
    guardarTasaPreferida(tipo);
    toast.success("Preferencia guardada");
  }

  async function capturarAhora() {
    setCapturando(true);
    try {
      const respuesta = await fetch("/api/bcv", { cache: "no-store" });
      if (!respuesta.ok) throw new Error("El BCV no respondió");
      const tasa = (await respuesta.json()) as TasaBcv;
      guardarTasa({
        fecha: tasa.fecha,
        usd: tasa.usd,
        eur: tasa.eur,
        fuente: "bcv",
      });
      refrescarEstado();
      toast.success(
        `Guardada la del ${formatearDia(tasa.fecha)}: Bs ${formatearTasa(tasa.usd)}`,
      );
    } catch (error) {
      toast.error((error as Error).message ?? "No se pudo actualizar");
    } finally {
      setCapturando(false);
    }
  }

  /** Descarga el respaldo; en iOS instalado se ofrece compartir, que sí funciona. */
  async function exportarRespaldo() {
    if (total === 0) {
      toast.error("No hay nada que respaldar");
      return;
    }

    const contenido = exportar();
    const nombre = `respaldo-tasas-${hoyCaracas()}.json`;
    const archivo = new File([contenido], nombre, { type: "application/json" });

    // En una PWA de iOS la descarga directa es poco fiable; compartir no.
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombre });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
    toast.success("Respaldo descargado");
  }

  async function importarRespaldo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    // Permite volver a elegir el mismo archivo si hace falta reintentar.
    evento.target.value = "";
    if (!archivo) return;

    try {
      const texto = await archivo.text();
      const { leidas, totalTrasImportar } = importar(texto);
      refrescarEstado();
      toast.success(
        `Importadas ${leidas} tasas. Ahora hay ${totalTrasImportar} en total.`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function borrarHistorial() {
    borrarTodo();
    refrescarEstado();
    setConfirmandoBorrado(false);
    toast.success("Historial borrado");
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
        <p className="text-muted-foreground text-xs">
          {ultima ? (
            <>
              <CircleCheck className="text-verde mr-1 inline size-3.5 align-text-bottom" />
              Última guardada: {formatearDia(ultima)} · {total}{" "}
              {total === 1 ? "publicación" : "publicaciones"} en total.
            </>
          ) : (
            "Todavía no hay ninguna tasa guardada en este teléfono."
          )}
        </p>
        <Button
          onClick={capturarAhora}
          disabled={capturando}
          className="w-full rounded-xl"
        >
          <RefreshCw className={cn("size-4", capturando && "animate-spin")} />
          {capturando ? "Consultando al BCV…" : "Capturar la tasa de hoy"}
        </Button>
      </Seccion>

      <Seccion titulo="Respaldo">
        <div className="flex items-start gap-2 text-xs">
          <Smartphone className="text-muted-foreground mt-px size-3.5 shrink-0" />
          <p className="text-muted-foreground">
            El historial está guardado <strong>solo en este teléfono</strong>. Si
            borras la app o cambias de equipo, se pierde. Exporta de vez en
            cuando y guarda el archivo donde quieras.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={exportarRespaldo}
            className="rounded-xl"
          >
            <Share2 className="size-4" />
            Exportar
          </Button>
          <Button
            variant="outline"
            onClick={() => archivoRef.current?.click()}
            className="rounded-xl"
          >
            <Upload className="size-4" />
            Importar
          </Button>
        </div>
        <input
          ref={archivoRef}
          type="file"
          accept="application/json,.json"
          onChange={importarRespaldo}
          className="hidden"
        />
        <p className="text-muted-foreground text-[11px]">
          Importar no borra nada: funde el archivo con lo que ya tengas.
        </p>
      </Seccion>

      <Seccion titulo="Zona peligrosa">
        {confirmandoBorrado ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-xs text-amber-200">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              Se borrarán las {total} publicaciones de este teléfono. Esto no se
              puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmandoBorrado(false)}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={borrarHistorial}
                className="rounded-xl"
              >
                Sí, borrar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={() => setConfirmandoBorrado(true)}
            disabled={total === 0}
            className="w-full rounded-xl"
          >
            Borrar el historial
          </Button>
        )}
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
