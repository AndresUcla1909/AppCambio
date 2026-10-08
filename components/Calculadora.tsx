"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CloudOff,
  Info,
  RefreshCw,
  Share2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModoCamara, type OpcionTasa } from "@/components/camara/ModoCamara";
import { CampoMonto } from "@/components/CampoMonto";
import { MenuLateral } from "@/components/MenuLateral";
import { SelectorFecha } from "@/components/SelectorFecha";
import { TarjetaTasa } from "@/components/TarjetaTasa";
import type { PrecioP2P } from "@/lib/binance/p2p";
import type { TasaBcv } from "@/lib/bcv/scraper";
import { DIAS_BUFFER } from "@/lib/config";
import { muestraDelDia } from "@/lib/almacen/buffer";
import { useEnLinea, useFilasBuffer, useMuestrasP2p } from "@/lib/almacen/hooks";
import {
  guardarMuestraP2p,
  guardarTasa,
  pedirPersistencia,
  rotarBuffer,
} from "@/lib/almacen/navegador";
import type { FilaTasa } from "@/lib/almacen/tipos";
import {
  calcularBrecha,
  calcularVariacion,
  diaEnCaracas,
  formatearDia,
  formatearDiaCorto,
  formatearHora,
  formatearInstante,
  formatearMonto,
  formatearTasa,
  hoyCaracas,
  parsearMonto,
  type DiaISO,
} from "@/lib/formato";
import {
  guardarTasaPreferida,
  useTasaPreferida,
  type TipoTasa,
} from "@/lib/preferencias";
import { precalentarLector } from "@/lib/ocr/lector";
import type { Direccion } from "@/lib/ocr/precio";
import {
  necesitaRemoto,
  resolverLocal,
  type ResultadoTasa,
} from "@/lib/tasas/resolver";
import {
  resolverTasaBcv,
  sincronizarBuffer,
  supabaseDisponible,
} from "@/lib/tasas/sincronizar";
import { cn } from "@/lib/utils";

/** Si la app vuelve de segundo plano tras este tiempo, se refrescan las tasas. */
const REFRESCAR_AL_VOLVER_MS = 10 * 60 * 1000;

/** Lo que respondió Supabase y para qué consulta exacta. */
type RespuestaRemota = {
  dia: DiaISO;
  hoy: DiaISO;
  filas: FilaTasa[];
  resultado: ResultadoTasa;
};

/** El USDT que se muestra: el recién pedido o el guardado en el teléfono. */
type UsdtMostrado = { precio: number; obtenidoEn: string; enVivo: boolean };

export function Calculadora() {
  // `hoy` se recalcula al volver de segundo plano: iOS deja la PWA
  // suspendida en memoria durante días.
  const [hoy, setHoy] = useState<DiaISO>(() => hoyCaracas());
  // `null` = "hoy": así, si la app pasa la medianoche abierta, sigue en hoy.
  const [diaElegido, setDiaElegido] = useState<DiaISO | null>(null);
  const dia = diaElegido ?? hoy;
  const esHoy = dia === hoy;

  // El búfer de 60 días del teléfono, como estado: se actualiza solo.
  const filas = useFilasBuffer();
  const muestras = useMuestrasP2p();
  const enLinea = useEnLinea();
  const conSupabase = supabaseDisponible();

  // Empieza en `true`: al montar ya se está pidiendo la tasa.
  const [capturando, setCapturando] = useState(true);
  // `fetch` falló aunque el navegador crea tener red (wifi sin internet).
  const [falloRed, setFalloRed] = useState(false);
  const [remoto, setRemoto] = useState<RespuestaRemota | null>(null);
  const ultimaActualizacion = useRef(0);

  const [p2p, setP2p] = useState<PrecioP2P | null>(null);
  const [cargandoP2p, setCargandoP2p] = useState(true);
  const [errorP2p, setErrorP2p] = useState<string | null>(null);

  const preferida = useTasaPreferida();
  const [seleccion, setSeleccion] = useState<TipoTasa | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const cerrarCamara = useCallback(() => setCamaraAbierta(false), []);

  const [usd, setUsd] = useState("");
  const [bs, setBs] = useState("");
  // Qué campo tocó el usuario de último: al cambiar la tasa se recalcula el otro.
  const ultimoEditado = useRef<"usd" | "bs">("usd");

  const sinConexion = !enLinea || falloRed;

  /* ---------------------------------------------------------------- */
  /* Datos                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Aplica la respuesta de `descargarBcv`: guarda la tasa en el búfer (las
   * pantallas se enteran solas, ver `useFilasBuffer`) y apaga el "cargando".
   * El "cargando" lo enciende `capturarBcv`; al arrancar ya empieza encendido,
   * así el efecto no cambia estado antes de que llegue la respuesta.
   */
  const aplicarBcv = useCallback((respuesta: Awaited<ReturnType<typeof descargarBcv>>) => {
    setCapturando(false);
    // Sin red se sigue con lo guardado: para eso está el búfer local. El BCV
    // caído no es falta de conexión: lo cubre el aviso de tasa desactualizada.
    setFalloRed(respuesta.fallo === "red");
    if (!respuesta.tasa) return null;
    const { tasa } = respuesta;
    guardarTasa({ fecha: tasa.fecha, usd: tasa.usd, eur: tasa.eur, fuente: "bcv" });
    return tasa;
  }, []);

  const capturarBcv = useCallback(() => {
    ultimaActualizacion.current = Date.now();
    setCapturando(true);
    return descargarBcv().then(aplicarBcv);
  }, [aplicarBcv]);

  const aplicarP2p = useCallback((respuesta: Awaited<ReturnType<typeof descargarP2p>>) => {
    setCargandoP2p(false);
    if ("error" in respuesta) {
      setErrorP2p(respuesta.error);
      return null;
    }
    setP2p(respuesta.datos);
    setErrorP2p(null);
    // Al búfer: sirve sin conexión y para consultar días pasados.
    guardarMuestraP2p(respuesta.datos.precio, respuesta.datos.obtenidoEn);
    return respuesta.datos;
  }, []);

  const cargarP2p = useCallback(() => {
    setCargandoP2p(true);
    return descargarP2p().then(aplicarP2p);
  }, [aplicarP2p]);

  // Arranque: se pinta lo guardado de inmediato y luego se busca lo nuevo.
  // `capturando` y `cargandoP2p` ya empiezan en `true`: aquí no se marca
  // nada antes de que llegue la respuesta.
  useEffect(() => {
    rotarBuffer();
    void pedirPersistencia();
    // Trae de Supabase los últimos 60 días, si está configurado y hay red.
    void sincronizarBuffer();
    ultimaActualizacion.current = Date.now();
    void descargarBcv().then(aplicarBcv);
    void descargarP2p().then(aplicarP2p);
    precalentarLector();
  }, [aplicarBcv, aplicarP2p]);

  // Al recuperar la conexión, o al volver de segundo plano tras un rato, se
  // vuelve a pedir todo. Al volver también se recalcula "hoy".
  useEffect(() => {
    const actualizar = () => {
      void capturarBcv();
      void cargarP2p();
    };
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      setHoy(hoyCaracas());
      if (Date.now() - ultimaActualizacion.current > REFRESCAR_AL_VOLVER_MS) {
        rotarBuffer();
        actualizar();
      }
    };
    window.addEventListener("online", actualizar);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("online", actualizar);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [capturarBcv, cargarP2p]);

  /* ---------------------------------------------------------------- */
  /* Tasa BCV de la fecha: búfer → Supabase → aviso                    */
  /* ---------------------------------------------------------------- */

  const local = useMemo(
    () => (filas ? resolverLocal(filas, dia, hoy) : null),
    [filas, dia, hoy],
  );

  // Sólo se pregunta a Supabase si lo local no basta y hay con qué.
  const debeConsultar = local != null && necesitaRemoto(local) && enLinea && conSupabase;

  useEffect(() => {
    if (!debeConsultar || !filas) return;
    let cancelado = false;
    void resolverTasaBcv(dia, hoy).then((resultado) => {
      if (!cancelado) setRemoto({ dia, hoy, filas, resultado });
    });
    return () => {
      cancelado = true;
    };
  }, [debeConsultar, dia, hoy, filas]);

  // Una respuesta que llegó tarde, para otra fecha, no se usa.
  const remotoVigente =
    remoto && remoto.dia === dia && remoto.hoy === hoy && remoto.filas === filas
      ? remoto.resultado
      : null;
  const resultado = debeConsultar ? (remotoVigente ?? local) : local;
  const buscandoRemoto = debeConsultar && remotoVigente == null;
  const bcv = resultado?.tasa ?? null;

  /* ---------------------------------------------------------------- */
  /* USDT: el de ahora o el guardado ese día                           */
  /* ---------------------------------------------------------------- */

  const muestra = useMemo(
    () => (muestras ? muestraDelDia(muestras, dia) : null),
    [muestras, dia],
  );
  const usdt: UsdtMostrado | null =
    esHoy && p2p
      ? { precio: p2p.precio, obtenidoEn: p2p.obtenidoEn, enVivo: true }
      : muestra
        ? { precio: muestra.precio, obtenidoEn: muestra.obtenidoEn, enVivo: false }
        : null;

  /* ---------------------------------------------------------------- */
  /* Tasa activa y cálculo                                             */
  /* ---------------------------------------------------------------- */

  const seleccionBase: TipoTasa = seleccion ?? preferida ?? "bcv_usd";
  const seleccionEfectiva: TipoTasa =
    seleccionBase === "usdt" && usdt == null ? "bcv_usd" : seleccionBase;

  const tasaActiva =
    seleccionEfectiva === "usdt"
      ? (usdt?.precio ?? null)
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
  if (usdt) {
    tasasCamara.push({ tipo: "usdt", nombre: "USDT", valor: usdt.precio, moneda: "$" });
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

  /** Tocar una tarjeta cambia la tasa del momento, no la de por defecto. */
  function elegir(tipo: TipoTasa) {
    setSeleccion(tipo);
  }

  /** Desde el menú: la guarda como tasa por defecto y la usa ya. */
  function elegirPorDefecto(tipo: TipoTasa) {
    guardarTasaPreferida(tipo);
    setSeleccion(tipo);
  }

  function elegirDia(nuevo: DiaISO) {
    setDiaElegido(nuevo === hoy ? null : nuevo);
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
      usdt
        ? `USDT P2P: Bs ${formatearTasa(usdt.precio)}${usdt.enVivo ? "" : ` (visto ${formatearInstante(usdt.obtenidoEn)})`}`
        : null,
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
    const tareas: Promise<unknown>[] = [capturarBcv()];
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
  const brecha = calcularBrecha(usdt?.precio, bcv?.usd);
  const cargandoBcv = filas == null || (capturando && bcv == null);

  const pieUsdt = usdt
    ? usdt.enVivo
      ? "brecha vs BCV"
      : `${esHoy ? "guardado" : "visto"} ${formatearHora(usdt.obtenidoEn)}`
    : undefined;
  const motivoSinUsdt = usdt
    ? undefined
    : esHoy
      ? errorP2p && !cargandoP2p
        ? "USDT no disponible"
        : undefined
      : "Sin registro ese día";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <MenuLateral preferida={preferida} onElegir={elegirPorDefecto} />
          <h1 className="text-2xl font-semibold tracking-tight">Calculadora</h1>
        </div>
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
          accion={{ etiqueta: "Usar en la calculadora", alUsar: usarDeCamara }}
          onCerrar={cerrarCamara}
        />
      ) : null}

      <SelectorFecha dia={dia} onCambiar={elegirDia} />

      {/* Si la fecha está fuera del búfer, ya lo dice el aviso de más abajo. */}
      {sinConexion && !(bcv == null && resultado?.fueraDeVentana) ? (
        <Aviso icono={CloudOff} tono="ambar">
          Sin conexión — usando las tasas guardadas en este teléfono.
        </Aviso>
      ) : null}

      {/* La tasa usada tiene demasiados días: no debe pasar por la de hoy. */}
      {bcv && resultado?.desactualizada ? (
        <Aviso icono={TriangleAlert} tono="ambar">
          Tasa desactualizada (del {formatearDiaCorto(bcv.fecha)}).{" "}
          {buscandoRemoto
            ? "Buscando una más reciente…"
            : sinConexion
              ? "Conéctate para actualizarla."
              : "No se encontró una más reciente."}
        </Aviso>
      ) : bcv && !bcv.es_exacta ? (
        // Fin de semana o feriado: el BCV no publicó ese día.
        <Aviso icono={Info} tono="neutro">
          Sin publicación ese día — usando la tasa del {formatearDia(bcv.fecha)}.
        </Aviso>
      ) : null}

      {filas && !bcv && !capturando ? (
        buscandoRemoto ? (
          <Aviso icono={Info} tono="neutro">
            Buscando esa fecha en el historial en línea…
          </Aviso>
        ) : resultado?.fueraDeVentana ? (
          <Aviso icono={CloudOff} tono="ambar">
            {!enLinea
              ? `Sin conexión — el teléfono solo guarda los últimos ${DIAS_BUFFER} días. Conéctate para consultar esta fecha.`
              : !conSupabase
                ? `El teléfono solo guarda los últimos ${DIAS_BUFFER} días y el historial en línea no está configurado.`
                : "No hay tasa registrada para esta fecha."}
          </Aviso>
        ) : (
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
        )
      ) : null}

      <div className="space-y-3">
        <TarjetaTasa
          titulo="USDT · Binance P2P"
          valor={usdt?.precio ?? null}
          variacion={usdt ? brecha : null}
          etiquetaVariacion="brecha frente al BCV"
          pie={pieUsdt}
          seleccionada={seleccionEfectiva === "usdt"}
          onSeleccionar={() => elegir("usdt")}
          cargando={esHoy && cargandoP2p && usdt == null}
          deshabilitada={motivoSinUsdt}
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
          <p>
            Act. BCV: {formatearDia(bcv?.fecha)}
            {resultado?.origen === "supabase" ? " · historial en línea" : ""}
          </p>
          <p>
            Act. USDT:{" "}
            {usdt
              ? // Si no es de hoy, con fecha: una hora sola engaña.
                diaEnCaracas(new Date(usdt.obtenidoEn)) === hoy
                ? formatearHora(usdt.obtenidoEn)
                : formatearInstante(usdt.obtenidoEn)
              : esHoy
                ? errorP2p
                  ? "no disponible"
                  : "…"
                : "—"}
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

/**
 * Pide la tasa del BCV al servidor. Nunca lanza: distingue la falta de red
 * (el `fetch` no llegó) de un fallo del BCV o del servidor.
 */
async function descargarBcv(): Promise<{ tasa: TasaBcv | null; fallo: "red" | "servidor" | null }> {
  let respuesta: Response;
  try {
    respuesta = await fetch("/api/bcv", { cache: "no-store" });
  } catch {
    return { tasa: null, fallo: "red" };
  }
  if (!respuesta.ok) return { tasa: null, fallo: "servidor" };
  try {
    return { tasa: (await respuesta.json()) as TasaBcv, fallo: null };
  } catch {
    return { tasa: null, fallo: "servidor" };
  }
}

/** Pide el USDT al servidor. Nunca lanza: devuelve el precio o el motivo del fallo. */
async function descargarP2p(): Promise<{ datos: PrecioP2P } | { error: string }> {
  try {
    const respuesta = await fetch("/api/p2p", { cache: "no-store" });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      return { error: cuerpo.error ?? "USDT no disponible" };
    }
    return { datos: (await respuesta.json()) as PrecioP2P };
  } catch (error) {
    return { error: (error as Error).message || "USDT no disponible" };
  }
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
