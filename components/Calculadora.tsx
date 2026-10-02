"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CloudOff, Info, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModoCamara, type OpcionTasa } from "@/components/camara/ModoCamara";
import { CampoMonto } from "@/components/CampoMonto";
import { SelectorFecha } from "@/components/SelectorFecha";
import { TarjetaTasa } from "@/components/TarjetaTasa";
import type { PrecioP2P } from "@/lib/binance/p2p";
import type { TasaBcv } from "@/lib/bcv/scraper";
import type { TasaVigente } from "@/lib/almacen/tipos";
import {
  guardarTasa,
  obtenerTasaVigente,
  pedirPersistencia,
  sembrarSiHaceFalta,
} from "@/lib/almacen/navegador";
import {
  calcularBrecha,
  calcularVariacion,
  formatearDia,
  formatearHora,
  formatearMonto,
  formatearTasa,
  hoyCaracas,
  parsearMonto,
  type DiaISO,
} from "@/lib/formato";
import {
  guardarTasaPreferida,
  leerTasaPreferida,
  type TipoTasa,
} from "@/lib/offline";
import type { Direccion } from "@/lib/ocr/precio";
import { cn } from "@/lib/utils";

export function Calculadora() {
  // `hoy` se fija al montar para no recalcularlo en cada render.
  const [hoy] = useState<DiaISO>(() => hoyCaracas());
  const [dia, setDia] = useState<DiaISO>(hoy);
  const [bcv, setBcv] = useState<TasaVigente | null>(null);
  const [listo, setListo] = useState(false);
  const [capturando, setCapturando] = useState(false);

  const [p2p, setP2p] = useState<PrecioP2P | null>(null);
  const [cargandoP2p, setCargandoP2p] = useState(true);
  const [errorP2p, setErrorP2p] = useState<string | null>(null);

  const [seleccion, setSeleccion] = useState<TipoTasa>("bcv_usd");
  const [sinConexion, setSinConexion] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const cerrarCamara = useCallback(() => setCamaraAbierta(false), []);

  const [usd, setUsd] = useState("");
  const [bs, setBs] = useState("");
  // Qué campo tocó el usuario de último: al cambiar la tasa se recalcula el otro.
  const ultimoEditado = useRef<"usd" | "bs">("usd");

  const esHoy = dia === hoy;

  /* ---------------------------------------------------------------- */
  /* Datos                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Pide al servidor la tasa que el BCV publica ahora y la guarda en este
   * aparato. Es la única forma en que crece el historial: la app no puede
   * ejecutarse en segundo plano en iOS.
   */
  const capturarBcv = useCallback(
    async (fechaMostrada: DiaISO) => {
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
        setBcv(obtenerTasaVigente(fechaMostrada));
        setSinConexion(false);
        return tasa;
      } catch {
        // Sin red se sigue con lo guardado: para eso está el almacén local.
        setSinConexion(true);
        return null;
      } finally {
        setCapturando(false);
      }
    },
    [],
  );

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

  // Arranque: se pinta lo guardado de inmediato y luego se busca lo nuevo.
  useEffect(() => {
    sembrarSiHaceFalta();
    void pedirPersistencia();

    const preferida = leerTasaPreferida();
    if (preferida) setSeleccion(preferida);

    setBcv(obtenerTasaVigente(hoy));
    setListo(true);

    void capturarBcv(hoy);
    void cargarP2p();
  }, [hoy, capturarBcv, cargarP2p]);

  // Cambiar de fecha sólo consulta el almacén local: es instantáneo.
  useEffect(() => {
    if (!listo) return;
    setBcv(obtenerTasaVigente(dia));
  }, [dia, listo]);

  // Al recuperar la conexión se vuelve a intentar lo que falló.
  useEffect(() => {
    const alConectar = () => {
      setSinConexion(false);
      void capturarBcv(dia);
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
  }, [dia, esHoy, capturarBcv, cargarP2p]);

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

  // Las tasas que el modo cámara deja elegir: las mismas que hay en pantalla.
  const tasasCamara: OpcionTasa[] = [];
  if (usdtDisponible && p2p) {
    tasasCamara.push({ tipo: "usdt", nombre: "USDT", valor: p2p.precio, moneda: "$" });
  }
  if (bcv) {
    tasasCamara.push({ tipo: "bcv_usd", nombre: "Dólar BCV", valor: bcv.usd, moneda: "$" });
  }
  if (bcv?.eur) {
    tasasCamara.push({ tipo: "bcv_eur", nombre: "Euro BCV", valor: bcv.eur, moneda: "€" });
  }

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
    if (valor.trim() === "") {
      setBs("");
      return;
    }
    const monto = parsearMonto(valor);
    // Mientras la entrada no sea un número válido se deja el otro campo quieto.
    if (monto == null || tasaActiva == null) return;
    setBs(formatearMonto(monto * tasaActiva));
  }

  function escribirBs(valor: string) {
    ultimoEditado.current = "bs";
    setBs(valor);
    if (valor.trim() === "") {
      setUsd("");
      return;
    }
    const monto = parsearMonto(valor);
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

  /** Lleva a la calculadora el precio que se leyó con la cámara. */
  function usarDeCamara(monto: number, direccion: Direccion) {
    const texto = formatearMonto(monto);
    if (direccion === "divisa_a_bs") escribirUsd(texto);
    else escribirBs(texto);
    setCamaraAbierta(false);
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
    const tareas: Promise<unknown>[] = [capturarBcv(dia)];
    if (esHoy) tareas.push(cargarP2p());
    const [tasa] = await Promise.all(tareas);
    if (tasa) toast.success("Actualizado");
    else toast.error("No se pudo contactar al BCV");
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const variacionUsd = calcularVariacion(bcv?.usd, bcv?.usd_anterior);
  const variacionEur = calcularVariacion(bcv?.eur, bcv?.eur_anterior);
  const brecha = calcularBrecha(p2p?.precio, bcv?.usd);
  const cargandoBcv = !listo || (capturando && bcv == null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Calculadora</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            onClick={() => setCamaraAbierta(true)}
            disabled={tasasCamara.length === 0}
            className="rounded-full px-3"
          >
            <Camera className="size-4" />
            Cámara
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={compartir}
            aria-label="Compartir tasas"
            className="rounded-full"
          >
            <Share2 className="size-5" />
          </Button>
        </div>
      </header>

      {camaraAbierta ? (
        <ModoCamara
          tasas={tasasCamara}
          seleccion={seleccionEfectiva}
          onSeleccionar={elegir}
          onUsar={usarDeCamara}
          onCerrar={cerrarCamara}
        />
      ) : null}

      <SelectorFecha dia={dia} onCambiar={setDia} />

      {sinConexion ? (
        <Aviso icono={CloudOff} tono="ambar">
          Sin conexión — usando las tasas guardadas en este teléfono.
        </Aviso>
      ) : null}

      {/* Fin de semana o feriado: el BCV no publicó ese día. */}
      {bcv && !bcv.es_exacta ? (
        <Aviso icono={Info} tono="neutro">
          Sin publicación ese día — usando la tasa del {formatearDia(bcv.fecha)}.
        </Aviso>
      ) : null}

      {listo && !bcv && !capturando ? (
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
          disabled={capturando || cargandoP2p}
          className="rounded-lg"
        >
          <RefreshCw
            className={cn("size-3.5", (capturando || cargandoP2p) && "animate-spin")}
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
