"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, ScanLine, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatearMonto, formatearTasa } from "@/lib/formato";
import type { TipoTasa } from "@/lib/offline";
import { leerRenglones, obtenerLector } from "@/lib/ocr/lector";
import {
  convertirPrecio,
  elegirPrecio,
  montoAMostrar,
  registrarLectura,
  type Direccion,
} from "@/lib/ocr/precio";
import { recorteEnVideo } from "@/lib/ocr/recorte";
import { cn } from "@/lib/utils";

/** Una tasa que se puede usar desde la cámara. */
export type OpcionTasa = {
  tipo: TipoTasa;
  nombre: string;
  valor: number;
  moneda: "$" | "€";
};

type Props = {
  tasas: OpcionTasa[];
  seleccion: TipoTasa;
  onSeleccionar: (tipo: TipoTasa) => void;
  /** Lleva el precio leído a la calculadora. */
  onUsar: (monto: number, direccion: Direccion) => void;
  onCerrar: () => void;
};

/** Ancho máximo de la imagen que se pasa al OCR: más grande no lee mejor y tarda más. */
const ANCHO_MAX_OCR = 1000;

/** Respiro entre lecturas, para no recalentar el teléfono ni gastar batería. */
const PAUSA_ENTRE_LECTURAS_MS = 150;

/**
 * Modo cámara: se apunta a un precio y se ve al instante convertido con la
 * tasa elegida. Todo ocurre en el teléfono; la imagen no se envía a ningún
 * lado.
 */
export function ModoCamara({
  tasas,
  seleccion,
  onSeleccionar,
  onUsar,
  onCerrar,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const lecturasRef = useRef<(number | null)[]>([]);

  const [error, setError] = useState<string | null>(() =>
    camaraDisponible()
      ? null
      : "La cámara sólo funciona con conexión segura (HTTPS) o en localhost.",
  );
  const [camaraLista, setCamaraLista] = useState(false);
  const [lectorListo, setLectorListo] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [monto, setMonto] = useState<number | null>(null);
  const [direccion, setDireccion] = useState<Direccion>("divisa_a_bs");

  const tasa = tasas.find((t) => t.tipo === seleccion) ?? tasas[0];

  // Mientras la cámara está abierta, la página de atrás no se desplaza y
  // Escape la cierra (útil en la computadora).
  useEffect(() => {
    const desbordePrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = desbordePrevio;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [onCerrar]);

  // Abre la cámara trasera y la apaga al salir.
  useEffect(() => {
    if (!camaraDisponible()) return;
    let flujo: MediaStream | null = null;
    let cancelado = false;

    async function abrir() {
      try {
        const nuevo = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            // Buena resolución: los precios suelen ser letra pequeña.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        // Si se cerró mientras el usuario daba el permiso, se apaga ya.
        if (cancelado) {
          apagar(nuevo);
          return;
        }
        flujo = nuevo;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = nuevo;
        await video.play();
        if (!cancelado) setCamaraLista(true);
      } catch (causa) {
        if (!cancelado) setError(mensajeDeError(causa));
      }
    }

    void abrir();
    return () => {
      cancelado = true;
      if (flujo) apagar(flujo);
    };
  }, []);

  // El lector se prepara a la vez que la cámara. La primera vez descarga
  // unos 7 MB; después sale de la caché del teléfono.
  useEffect(() => {
    let cancelado = false;
    obtenerLector()
      .then(() => {
        if (!cancelado) setLectorListo(true);
      })
      .catch(() => {
        if (!cancelado) {
          setError(
            "No se pudo cargar el lector de precios. La primera vez hace falta conexión a internet.",
          );
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // El ciclo de lectura: recorta lo que hay dentro del recuadro, lo lee y
  // vuelve a empezar. Una lectura a la vez, para no encolar trabajo.
  useEffect(() => {
    if (!camaraLista || !lectorListo || pausado) return;
    const video = videoRef.current;
    const marco = marcoRef.current;
    if (!video || !marco) return;

    let activo = true;
    const lienzo = document.createElement("canvas");

    const leerSinParar = async () => {
      while (activo) {
        const inicio = performance.now();
        const imagen = capturarMarco(video, marco, lienzo);
        if (imagen) {
          try {
            const lectura = elegirPrecio(await leerRenglones(imagen));
            if (!activo) break;
            const lecturas = registrarLectura(lecturasRef.current, lectura);
            lecturasRef.current = lecturas;
            setMonto((anterior) => montoAMostrar(lecturas, anterior));
          } catch {
            // Un cuadro que falla no detiene la lectura: se sigue con el próximo.
          }
        }
        const transcurrido = performance.now() - inicio;
        await esperar(Math.max(0, PAUSA_ENTRE_LECTURAS_MS - transcurrido));
      }
    };

    void leerSinParar();
    return () => {
      activo = false;
    };
  }, [camaraLista, lectorListo, pausado]);

  function alternarPausa() {
    const video = videoRef.current;
    if (!video) return;
    // En pausa se congela la imagen, para leer el resultado con calma.
    if (pausado) void video.play();
    else video.pause();
    setPausado(!pausado);
  }

  const convertido =
    monto != null && tasa ? convertirPrecio(monto, tasa.valor, direccion) : null;
  const simboloOrigen = direccion === "divisa_a_bs" ? (tasa?.moneda ?? "$") : "Bs";
  const simboloDestino = direccion === "divisa_a_bs" ? "Bs" : (tasa?.moneda ?? "$");

  const estado = error
    ? null
    : !camaraLista
      ? "Abriendo la cámara…"
      : !lectorListo
        ? "Preparando el lector…"
        : pausado
          ? "En pausa"
          : "Leyendo precios";

  // Directo en <body>: así ningún contenedor de la página puede quedar por
  // encima (la barra de navegación asomaba bajo los controles).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modo cámara"
      className="fixed inset-0 z-50 bg-black text-white"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 size-full object-cover"
      />

      <div className="absolute inset-0 flex flex-col pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {/* Encima de la sombra del recuadro, que oscurece todo lo demás. */}
        <header className="relative z-10 flex items-center justify-between gap-2 px-4">
          <BotonRedondo onClick={onCerrar} etiqueta="Cerrar la cámara">
            <X className="size-5" />
          </BotonRedondo>
          {estado ? (
            <p className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs backdrop-blur">
              <ScanLine
                className={cn(
                  "size-3.5",
                  estado === "Leyendo precios" && "animate-pulse text-azul",
                )}
              />
              {estado}
            </p>
          ) : null}
          <BotonRedondo
            onClick={alternarPausa}
            etiqueta={pausado ? "Seguir leyendo" : "Pausar"}
            deshabilitado={!camaraLista || Boolean(error)}
          >
            {pausado ? <Play className="size-5" /> : <Pause className="size-5" />}
          </BotonRedondo>
        </header>

        <div
          role="radiogroup"
          aria-label="Tasa para convertir"
          className="relative z-10 mt-3 flex justify-center gap-1.5 px-4"
        >
          {tasas.map((opcion) => (
            <button
              key={opcion.tipo}
              type="button"
              role="radio"
              aria-checked={opcion.tipo === tasa?.tipo}
              onClick={() => onSeleccionar(opcion.tipo)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors",
                opcion.tipo === tasa?.tipo
                  ? "bg-azul text-white"
                  : "bg-black/55 text-white/80 hover:text-white",
              )}
            >
              {opcion.nombre}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {error ? (
            <div className="relative z-10 max-w-xs space-y-3 rounded-2xl bg-black/75 p-5 text-center backdrop-blur">
              <TriangleAlert className="mx-auto size-6 text-amber-300" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" onClick={onCerrar} className="rounded-xl text-foreground">
                Volver a la calculadora
              </Button>
            </div>
          ) : (
            <>
              {/* La sombra enorme oscurece todo menos el recuadro. */}
              <div
                ref={marcoRef}
                className="h-44 w-full max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              />

              <div
                aria-live="polite"
                className="relative z-10 mt-4 min-w-56 rounded-2xl bg-black/70 px-5 py-3 text-center backdrop-blur"
              >
                {convertido != null && monto != null ? (
                  <>
                    <p className="cifras text-3xl font-semibold tracking-tight">
                      {simboloDestino} {formatearMonto(convertido)}
                    </p>
                    <p className="cifras mt-0.5 text-sm text-white/70">
                      {simboloOrigen} {formatearMonto(monto)} · {tasa?.nombre}{" "}
                      {tasa ? formatearTasa(tasa.valor) : ""}
                    </p>
                  </>
                ) : (
                  <p className="py-1 text-sm text-white/75">
                    Encuadra el precio dentro del recuadro
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="relative z-10 space-y-3 px-4">
          <div
            role="radiogroup"
            aria-label="Moneda del precio"
            className="mx-auto grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-black/55 p-1 backdrop-blur"
          >
            {(
              [
                ["divisa_a_bs", `Precio en ${tasa?.moneda ?? "$"}`],
                ["bs_a_divisa", "Precio en Bs"],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={direccion === valor}
                onClick={() => setDireccion(valor)}
                className={cn(
                  "rounded-lg py-2 text-xs font-medium transition-colors",
                  direccion === valor ? "bg-white text-black" : "text-white/80",
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <Button
            onClick={() => monto != null && onUsar(monto, direccion)}
            disabled={monto == null}
            className="mx-auto flex h-12 w-full max-w-sm rounded-xl bg-azul text-base text-white hover:bg-azul/85"
          >
            Usar en la calculadora
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BotonRedondo({
  onClick,
  etiqueta,
  deshabilitado,
  children,
}: {
  onClick: () => void;
  etiqueta: string;
  deshabilitado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="rounded-full bg-black/55 p-2.5 backdrop-blur transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function camaraDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function apagar(flujo: MediaStream) {
  for (const pista of flujo.getTracks()) pista.stop();
}

function mensajeDeError(causa: unknown): string {
  const nombre = (causa as { name?: string } | null)?.name;
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "No hay permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "Este aparato no tiene una cámara disponible.";
  }
  if (nombre === "NotReadableError") {
    return "La cámara está ocupada por otra app. Ciérrala y vuelve a intentarlo.";
  }
  return "No se pudo abrir la cámara.";
}

/**
 * Copia al lienzo lo que se ve dentro del recuadro, en píxeles reales del
 * video. Devuelve `null` si el video todavía no tiene imagen.
 */
function capturarMarco(
  video: HTMLVideoElement,
  marco: HTMLElement,
  lienzo: HTMLCanvasElement,
): HTMLCanvasElement | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

  const cajaVideo = video.getBoundingClientRect();
  const cajaMarco = marco.getBoundingClientRect();
  const recorte = recorteEnVideo(
    { ancho: video.videoWidth, alto: video.videoHeight },
    { ancho: cajaVideo.width, alto: cajaVideo.height },
    {
      x: cajaMarco.left - cajaVideo.left,
      y: cajaMarco.top - cajaVideo.top,
      ancho: cajaMarco.width,
      alto: cajaMarco.height,
    },
  );
  if (!recorte) return null;

  const escala = Math.min(1, ANCHO_MAX_OCR / recorte.ancho);
  lienzo.width = Math.round(recorte.ancho * escala);
  lienzo.height = Math.round(recorte.alto * escala);
  const contexto = lienzo.getContext("2d");
  if (!contexto) return null;

  contexto.drawImage(
    video,
    recorte.x,
    recorte.y,
    recorte.ancho,
    recorte.alto,
    0,
    0,
    lienzo.width,
    lienzo.height,
  );
  return lienzo;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => window.setTimeout(resolver, ms));
}
