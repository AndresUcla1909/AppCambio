"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloudOff, Info, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CampoMonto } from "@/components/CampoMonto";
import { SelectorFecha } from "@/components/SelectorFecha";
import { TarjetaTasa } from "@/components/TarjetaTasa";
import type { PrecioP2P } from "@/lib/binance/p2p";
import type { TasaVigente } from "@/lib/almacen/tipos";
import {
  calcularBrecha,
  calcularVariacion,
  formatearDia,
  formatearHora,
  formatearMonto,
  formatearTasa,
  parsearMonto,
  type DiaISO,
} from "@/lib/formato";
import {
  guardarCache,
  guardarTasaPreferida,
  leerCache,
  leerTasaPreferida,
  type TipoTasa,
} from "@/lib/offline";
import { cn } from "@/lib/utils";

type Props = {
  /** Tasa de hoy, resuelta en el servidor para que la primera pintada ya traiga datos. */
  tasaInicial: TasaVigente | null;
  hoy: DiaISO;
};

export function Calculadora({ tasaInicial, hoy }: Props) {
  const [dia, setDia] = useState<DiaISO>(hoy);
  const [bcv, setBcv] = useState<TasaVigente | null>(tasaInicial);
  const [cargandoBcv, setCargandoBcv] = useState(false);

  const [p2p, setP2p] = useState<PrecioP2P | null>(null);
  const [cargandoP2p, setCargandoP2p] = useState(true);
  const [errorP2p, setErrorP2p] = useState<string | null>(null);

  const [seleccion, setSeleccion] = useState<TipoTasa>("bcv_usd");
  const [sinConexion, setSinConexion] = useState(false);
  const [cacheUsada, setCacheUsada] = useState<string | null>(null);

  const [usd, setUsd] = useState("");
  const [bs, setBs] = useState("");
  // Qué campo tocó el usuario de último: al cambiar la tasa se recalcula el otro.
  const ultimoEditado = useRef<"usd" | "bs">("usd");

  const esHoy = dia === hoy;

  /* ---------------------------------------------------------------- */
  /* Carga de datos                                                    */
  /* ---------------------------------------------------------------- */

  const cargarP2p = useCallback(async () => {
    setCargandoP2p(true);
    try {
      const respuesta = await fetch("/api/p2p", { cache: "no-store" });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}));
        throw new Error(cuerpo.error ?? "USDT no disponible");
      }
      const datos = (await respuesta.json()) as PrecioP2P;
      setP2p(datos);
      setErrorP2p(null);
      return datos;
    } catch (error) {
      setErrorP2p((error as Error).message);
      return null;
    } finally {
      setCargandoP2p(false);
    }
  }, []);

  const cargarBcv = useCallback(async (fecha: DiaISO) => {
    setCargandoBcv(true);
    try {
      const respuesta = await fetch(
        `/api/tasas/vigente?fecha=${encodeURIComponent(fecha)}`,
        { cache: "no-store" },
      );
      if (!respuesta.ok) throw new Error("No se pudo leer la tasa");
      const { tasa } = (await respuesta.json()) as { tasa: TasaVigente | null };
      setBcv(tasa);
      setSinConexion(false);
      return tasa;
    } catch {
      // Sin red: se tira de lo último guardado, si sirve para esa fecha.
      const cache = leerCache();
      if (cache?.bcv && cache.dia === fecha) {
        setBcv(cache.bcv);
        setP2p((previo) => previo ?? cache.p2p);
        setCacheUsada(cache.guardadoEn);
      }
      setSinConexion(true);
      return null;
    } finally {
      setCargandoBcv(false);
    }
  }, []);

  // Preferencia guardada y primer intento de traer el precio P2P.
  useEffect(() => {
    const preferida = leerTasaPreferida();
    if (preferida) setSeleccion(preferida);
    void cargarP2p();
  }, [cargarP2p]);

  // Cambiar de fecha recarga la tasa vigente de ese día. La de hoy ya vino
  // del servidor, así que la primera pasada no vuelve a pedirla.
  const primeraCarga = useRef(true);
  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      if (dia === hoy) return;
    }
    void cargarBcv(dia);
  }, [dia, hoy, cargarBcv]);

  // Guardar lo último visto de hoy, para el modo offline.
  useEffect(() => {
    if (!esHoy || (!bcv && !p2p)) return;
    guardarCache({ dia, bcv, p2p, guardadoEn: new Date().toISOString() });
  }, [dia, esHoy, bcv, p2p]);

  // Avisar cuando el navegador pierde o recupera la conexión.
  useEffect(() => {
    const alConectar = () => {
      setSinConexion(false);
      setCacheUsada(null);
      void cargarBcv(dia);
      if (esHoy) void cargarP2p();
    };
    const alDesconectar = () => setSinConexion(true);

    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSinConexion(true);
    }
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, [dia, esHoy, cargarBcv, cargarP2p]);

  /* ---------------------------------------------------------------- */
  /* Tasa activa y cálculo                                             */
  /* ---------------------------------------------------------------- */

  // El USDT sólo existe para hoy: su precio no se guarda en historial.
  const usdtDisponible = esHoy && p2p != null;
  const seleccionEfectiva: TipoTasa =
    seleccion === "usdt" && !usdtDisponible ? "bcv_usd" : seleccion;

  const tasaActiva =
    seleccionEfectiva === "usdt"
      ? (p2p?.precio ?? null)
      : seleccionEfectiva === "bcv_eur"
        ? (bcv?.eur ?? null)
        : (bcv?.usd ?? null);

  const monedaActiva = seleccionEfectiva === "bcv_eur" ? "€" : "$";
  const nombreTasa =
    seleccionEfectiva === "usdt"
      ? "USDT"
      : seleccionEfectiva === "bcv_eur"
        ? "Euro BCV"
        : "Dólar BCV";

  // Al cambiar la tasa se rehace el campo derivado a partir del que se editó.
  useEffect(() => {
    if (tasaActiva == null) return;
    if (ultimoEditado.current === "usd") {
      const monto = parsearMonto(usd);
      setBs(monto == null ? "" : formatearMonto(monto * tasaActiva));
    } else {
      const monto = parsearMonto(bs);
      setUsd(monto == null ? "" : formatearMonto(monto / tasaActiva));
    }
    // Debe dispararse al cambiar la tasa, no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaActiva]);

  function escribirUsd(valor: string) {
    ultimoEditado.current = "usd";
    setUsd(valor);
    const monto = parsearMonto(valor);
    if (valor.trim() === "") {
      setBs("");
      return;
    }
    // Mientras la entrada no sea un número válido se deja el otro campo quieto.
    if (monto == null || tasaActiva == null) return;
    setBs(formatearMonto(monto * tasaActiva));
  }

  function escribirBs(valor: string) {
    ultimoEditado.current = "bs";
    setBs(valor);
    const monto = parsearMonto(valor);
    if (valor.trim() === "") {
      setUsd("");
      return;
    }
    if (monto == null || tasaActiva == null) return;
    setUsd(formatearMonto(monto / tasaActiva));
  }

  async function copiar(texto: string): Promise<boolean> {
    const limpio = texto.trim();
    if (!limpio) return false;
    try {
      await navigator.clipboard.writeText(limpio);
      return true;
    } catch {
      toast.error("No se pudo copiar");
      return false;
    }
  }

  function elegir(tipo: TipoTasa) {
    setSeleccion(tipo);
    guardarTasaPreferida(tipo);
  }

  async function compartir() {
    const lineas = [
      `Tasas del ${formatearDia(bcv?.fecha ?? dia)}`,
      bcv ? `Dólar BCV: Bs ${formatearTasa(bcv.usd)}` : null,
      bcv?.eur ? `Euro BCV: Bs ${formatearTasa(bcv.eur)}` : null,
      p2p && esHoy ? `USDT P2P: Bs ${formatearTasa(p2p.precio)}` : null,
      usd && bs ? `\n${monedaActiva} ${usd} = Bs ${bs} (${nombreTasa})` : null,
    ].filter(Boolean);
    const texto = lineas.join("\n");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: texto });
        return;
      } catch (error) {
        // Cerrar el diálogo de compartir no es un fallo.
        if ((error as Error).name === "AbortError") return;
      }
    }
    if (await copiar(texto)) toast.success("Tasas copiadas");
  }

  async function refrescar() {
    const tareas: Promise<unknown>[] = [cargarBcv(dia)];
    if (esHoy) tareas.push(cargarP2p());
    await Promise.all(tareas);
    setCacheUsada(null);
    toast.success("Actualizado");
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const variacionUsd = calcularVariacion(bcv?.usd, bcv?.usd_anterior);
  const variacionEur = calcularVariacion(bcv?.eur, bcv?.eur_anterior);
  const brecha = calcularBrecha(p2p?.precio, bcv?.usd);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Calculadora</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={compartir}
          aria-label="Compartir tasas"
          className="rounded-full"
        >
          <Share2 className="size-5" />
        </Button>
      </header>

      <SelectorFecha dia={dia} onCambiar={setDia} />

      {sinConexion ? (
        <Aviso icono={CloudOff} tono="ambar">
          Sin conexión
          {cacheUsada ? ` — tasas del ${formatearHora(cacheUsada)}` : ""}.
        </Aviso>
      ) : null}

      {/* Fin de semana o feriado: el BCV no publicó ese día. */}
      {bcv && !bcv.es_exacta ? (
        <Aviso icono={Info} tono="neutro">
          Sin publicación ese día — usando la tasa del {formatearDia(bcv.fecha)}.
        </Aviso>
      ) : null}

      {!bcv && !cargandoBcv ? (
        <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
          <p className="text-sm">No hay tasa registrada para esta fecha.</p>
          <Button
            render={<Link href="/historial#cargar" />}
            size="sm"
            className="rounded-lg"
          >
            Cargarla manualmente
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <TarjetaTasa
          titulo="USDT · Binance P2P"
          valor={esHoy ? (p2p?.precio ?? null) : null}
          variacion={esHoy ? brecha : null}
          etiquetaVariacion="brecha frente al BCV"
          pie={esHoy && p2p ? "brecha vs BCV" : undefined}
          seleccionada={seleccionEfectiva === "usdt"}
          onSeleccionar={() => elegir("usdt")}
          cargando={esHoy && cargandoP2p}
          deshabilitada={
            !esHoy
              ? "Solo tasa actual"
              : errorP2p
                ? "USDT no disponible"
                : undefined
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <TarjetaTasa
            titulo="Dólar BCV"
            valor={bcv?.usd ?? null}
            variacion={variacionUsd}
            seleccionada={seleccionEfectiva === "bcv_usd"}
            onSeleccionar={() => elegir("bcv_usd")}
            cargando={cargandoBcv}
          />
          <TarjetaTasa
            titulo="Euro BCV"
            valor={bcv?.eur ?? null}
            variacion={variacionEur}
            seleccionada={seleccionEfectiva === "bcv_eur"}
            onSeleccionar={() => elegir("bcv_eur")}
            cargando={cargandoBcv}
          />
        </div>
      </div>

      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <CampoMonto
          id="campo-divisa"
          etiqueta={seleccionEfectiva === "bcv_eur" ? "Euros" : "Dólares"}
          simbolo={monedaActiva}
          valor={usd}
          onCambiar={escribirUsd}
          onCopiar={() => copiar(usd)}
          deshabilitado={tasaActiva == null}
        />
        <CampoMonto
          id="campo-bolivares"
          etiqueta="Bolívares"
          simbolo="Bs"
          valor={bs}
          onCambiar={escribirBs}
          onCopiar={() => copiar(bs)}
          deshabilitado={tasaActiva == null}
        />
        <p className="text-muted-foreground text-center text-xs">
          {tasaActiva != null ? (
            <>
              Calculando con {nombreTasa}:{" "}
              <span className="cifras text-foreground font-medium">
                Bs {formatearTasa(tasaActiva)}
              </span>
            </>
          ) : (
            "Elige una tasa disponible para calcular"
          )}
        </p>
      </div>

      <footer className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
        <div className="space-y-0.5">
          <p>Act. BCV: {formatearDia(bcv?.fecha)}</p>
          <p>
            Act. USDT:{" "}
            {p2p
              ? formatearHora(p2p.obtenidoEn)
              : errorP2p
                ? "no disponible"
                : "…"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refrescar}
          disabled={cargandoBcv || cargandoP2p}
          className="rounded-lg"
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              (cargandoBcv || cargandoP2p) && "animate-spin",
            )}
          />
          Refrescar
        </Button>
      </footer>
    </div>
  );
}

function Aviso({
  icono: Icono,
  tono,
  children,
}: {
  icono: typeof Info;
  tono: "neutro" | "ambar";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
        tono === "ambar"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      <Icono className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
