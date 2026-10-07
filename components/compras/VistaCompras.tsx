"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, FileDown, Plus, ShoppingCart, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArticuloCarrito } from "@/components/compras/ArticuloCarrito";
import { EntradaNumero } from "@/components/compras/EntradaNumero";
import { FormularioArticulo } from "@/components/compras/FormularioArticulo";
import { ModoCamara } from "@/components/camara/ModoCamara";
import type { TasaBcv } from "@/lib/bcv/scraper";
import { useFilasBuffer } from "@/lib/almacen/hooks";
import { guardarTasa, rotarBuffer } from "@/lib/almacen/navegador";
import type { TasaVigente } from "@/lib/almacen/tipos";
import { resolverLocal } from "@/lib/tasas/resolver";
import { guardarCarrito, leerCarrito } from "@/lib/compras/almacen";
import {
  actualizar,
  agregar,
  enAmbas,
  ponerDescuentoGeneral,
  ponerTitulo,
  quitar,
  tieneDescuentos,
  totales,
  vaciar,
  type ArticuloNuevo,
  type Carrito,
  type Totales,
} from "@/lib/compras/logica";
import { bolivares, cantidad, dolares } from "@/lib/compras/mostrar";
import { formatearDia, formatearDiaCorto, formatearTasa, hoyCaracas } from "@/lib/formato";

/**
 * Compras: un carrito para ir anotando precios en la tienda, escaneándolos
 * con la cámara o escribiéndolos, con todo en dólares y en bolívares a la
 * tasa del BCV. Admite descuentos por artículo y a todo el carrito, y se
 * exporta a PDF con un título.
 *
 * Se monta sólo en el navegador (ver ComprasCliente): el carrito y la tasa
 * salen del localStorage del teléfono.
 */
export function VistaCompras() {
  const [hoy] = useState(hoyCaracas);
  const [carrito, setCarrito] = useState<Carrito>(leerCarrito);
  // La tasa de hoy según el búfer; se actualiza sola al guardar una nueva.
  const filas = useFilasBuffer();
  const vigente = useMemo(() => (filas ? resolverLocal(filas, hoy, hoy) : null), [filas, hoy]);
  const tasa = vigente?.tasa ?? null;
  const desactualizada = vigente?.desactualizada ?? false;
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const [exportando, setExportando] = useState(false);
  const cerrarCamara = useCallback(() => setCamaraAbierta(false), []);

  // Lo que pasó de los 60 días, fuera; y por si el BCV publicó algo más
  // nuevo que lo guardado. Sin conexión se sigue con la tasa del teléfono.
  useEffect(() => {
    rotarBuffer();
    (async () => {
      try {
        const respuesta = await fetch("/api/bcv", { cache: "no-store" });
        if (!respuesta.ok) return;
        const nueva = (await respuesta.json()) as TasaBcv;
        guardarTasa({ fecha: nueva.fecha, usd: nueva.usd, eur: nueva.eur, fuente: "bcv" });
      } catch {
        /* sin conexión */
      }
    })();
  }, []);

  const valorTasa = tasa?.usd ?? null;
  const suma = totales(carrito, valorTasa);

  /** Aplica un cambio y lo guarda en el teléfono al momento. */
  function cambiar(nuevo: Carrito) {
    setCarrito(nuevo);
    if (!guardarCarrito(nuevo)) toast.error("No se pudo guardar el carrito en este teléfono");
  }

  function agregarArticulo(nuevo: ArticuloNuevo, { avisar = true } = {}) {
    cambiar(agregar(carrito, nuevo));
    if (!avisar) return;
    const precio = enAmbas(nuevo.precio, nuevo.moneda, valorTasa);
    toast.success(`Agregado: ${dolares(precio.usd)} · ${bolivares(precio.bs)}`);
  }

  async function exportarPdf() {
    setExportando(true);
    try {
      // jsPDF sólo se descarga cuando hace falta.
      const { generarPdf, nombreDelArchivo, tituloDe } = await import("@/lib/compras/pdf");
      const bytes = generarPdf(carrito, tasa ? { valor: tasa.usd, fecha: tasa.fecha } : null);
      const archivo = new File([bytes], nombreDelArchivo(carrito), { type: "application/pdf" });

      // En el teléfono, la hoja de compartir (guardar en Archivos, WhatsApp…):
      // en una PWA de iOS la descarga directa es poco fiable. En la
      // computadora, descarga normal.
      const tactil = window.matchMedia("(pointer: coarse)").matches;
      if (tactil && navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: tituloDe(carrito) });
          return;
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = archivo.name;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("PDF descargado");
    } catch (error) {
      console.error("[compras] no se pudo generar el PDF:", error);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExportando(false);
    }
  }

  function vaciarCarrito() {
    cambiar(vaciar());
    setConfirmandoVaciar(false);
    toast.success("Carrito vacío");
  }

  // Lo último que se agregó, arriba: es lo que se quiere ver al escanear.
  const recientesPrimero = carrito.articulos.map((articulo, indice) => ({ articulo, indice })).reverse();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        {/* También arriba: con un carrito largo, el botón de abajo queda lejos. */}
        {carrito.articulos.length > 0 ? (
          <Button
            variant="outline"
            onClick={exportarPdf}
            disabled={exportando}
            aria-label="Exportar a PDF"
            className="rounded-full px-3"
          >
            <FileDown className="size-4" />
            PDF
          </Button>
        ) : null}
      </header>

      <div className="space-y-1.5">
        <Label htmlFor="carrito-titulo" className="text-muted-foreground text-xs">
          Título de la lista <span className="opacity-70">(sale en el PDF)</span>
        </Label>
        <Input
          id="carrito-titulo"
          value={carrito.titulo}
          onChange={(e) => cambiar(ponerTitulo(carrito, e.target.value))}
          placeholder={`Compras del ${formatearDia(hoy)}`}
          autoComplete="off"
          className="h-11 rounded-xl"
        />
      </div>

      <Resumen
        suma={suma}
        carrito={carrito}
        tasa={tasa}
        desactualizada={desactualizada}
        onDescuento={(n) => cambiar(ponerDescuentoGeneral(carrito, n))}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => setCamaraAbierta(true)}
          disabled={valorTasa == null}
          className="bg-azul hover:bg-azul/85 h-11 rounded-xl text-white"
        >
          <Camera className="size-4" />
          Escanear
        </Button>
        <Button
          variant="outline"
          onClick={() => setFormularioAbierto((abierto) => !abierto)}
          aria-expanded={formularioAbierto}
          className="h-11 rounded-xl"
        >
          {formularioAbierto ? <X className="size-4" /> : <Plus className="size-4" />}
          {formularioAbierto ? "Cerrar" : "A mano"}
        </Button>
      </div>

      {formularioAbierto ? (
        <FormularioArticulo tasa={valorTasa} onAgregar={agregarArticulo} />
      ) : null}

      {carrito.articulos.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground space-y-2 rounded-2xl border p-6 text-center text-sm">
          <ShoppingCart className="mx-auto size-8 opacity-50" />
          <p>
            El carrito está vacío. Escanea los precios en la tienda o agrégalos a
            mano: se suman en dólares y en bolívares.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {recientesPrimero.map(({ articulo, indice }) => (
            <ArticuloCarrito
              key={articulo.id}
              articulo={articulo}
              indice={indice}
              tasa={valorTasa}
              onCambiar={(cambios) => cambiar(actualizar(carrito, articulo.id, cambios))}
              onQuitar={() => cambiar(quitar(carrito, articulo.id))}
            />
          ))}
        </ul>
      )}

      {carrito.articulos.length > 0 ? (
        <div className="space-y-2">
          <Button onClick={exportarPdf} disabled={exportando} className="h-12 w-full rounded-xl text-base">
            <FileDown className="size-5" />
            {exportando ? "Generando el PDF…" : "Exportar PDF"}
          </Button>

          {confirmandoVaciar ? (
            <div className="border-border bg-card space-y-2 rounded-2xl border p-3">
              <p className="flex items-start gap-2 text-xs text-amber-200">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                Se borrarán los {suma.articulos} artículos, el título y el descuento.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setConfirmandoVaciar(false)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={vaciarCarrito} className="rounded-xl">
                  Sí, vaciar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmandoVaciar(true)}
              className="text-muted-foreground hover:text-destructive w-full rounded-xl"
            >
              Vaciar el carrito
            </Button>
          )}
        </div>
      ) : null}

      {camaraAbierta && valorTasa != null ? (
        <ModoCamara
          tasas={[{ tipo: "bcv_usd", nombre: "Dólar BCV", valor: valorTasa, moneda: "$" }]}
          seleccion="bcv_usd"
          onSeleccionar={() => {}}
          accion={{
            etiqueta: "Agregar al carrito",
            hecho: "¡Agregado!",
            // Sin aviso: taparía la X de cerrar la cámara. Ya avisan el botón
            // ("¡Agregado!") y la línea con el total del carrito.
            alUsar: (monto, direccion) =>
              agregarArticulo(
                { precio: monto, moneda: direccion === "divisa_a_bs" ? "usd" : "bs" },
                { avisar: false },
              ),
          }}
          pie={
            suma.articulos === 0
              ? "El carrito está vacío"
              : `${suma.articulos} en el carrito · ${dolares(suma.total.usd)} · ${bolivares(suma.total.bs)}`
          }
          onCerrar={cerrarCamara}
        />
      ) : null}
    </div>
  );
}

/** Los totales en las dos monedas, el ahorro y el descuento a todo el carrito. */
function Resumen({
  suma,
  carrito,
  tasa,
  desactualizada,
  onDescuento,
}: {
  suma: Totales;
  carrito: Carrito;
  tasa: TasaVigente | null;
  /** La tasa tiene demasiados días: los bolívares pueden no cuadrar con la caja. */
  desactualizada: boolean;
  onDescuento: (porcentaje: number) => void;
}) {
  const ahorra = (suma.ahorro.usd ?? 0) > 0 || (suma.ahorro.bs ?? 0) > 0;

  return (
    <section aria-label="Total del carrito" className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground text-xs">Total en dólares</p>
          <p className="cifras text-2xl font-semibold tracking-tight">{dolares(suma.total.usd)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Total en bolívares (BCV)</p>
          <p className="cifras text-2xl font-semibold tracking-tight">{bolivares(suma.total.bs)}</p>
        </div>
      </div>

      {ahorra && tieneDescuentos(carrito) ? (
        <p className="cifras text-xs">
          <span className="text-muted-foreground">
            Sin descuentos {dolares(suma.sinDescuentos.usd)} ·{" "}
          </span>
          <span className="text-verde font-medium">
            ahorras {dolares(suma.ahorro.usd)} ({bolivares(suma.ahorro.bs)})
          </span>
        </p>
      ) : null}

      <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
        <label htmlFor="descuento-general" className="text-sm">
          Descuento a todo
          <span className="text-muted-foreground block text-[11px]">
            Sobre lo que ya tiene descuento propio
          </span>
        </label>
        <div className="border-border flex items-center gap-1 rounded-lg border pr-2.5">
          <EntradaNumero
            id="descuento-general"
            valor={carrito.descuento}
            onCambiar={onDescuento}
            formato={(n) => (n > 0 ? cantidad(n) : "")}
            valido={(n) => n >= 0 && n <= 100}
            placeholder="0"
            className="h-9 w-14 border-0 text-right dark:bg-transparent"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
      </div>

      <p className="text-muted-foreground text-[11px]">
        {tasa ? (
          <>
            {suma.articulos} {suma.articulos === 1 ? "artículo" : "artículos"} · Tasa BCV{" "}
            <span className="cifras">Bs {formatearTasa(tasa.usd)}</span> (desde el{" "}
            {formatearDia(tasa.fecha)})
          </>
        ) : (
          "Todavía no hay tasa BCV en este teléfono: abre la calculadora con conexión para obtenerla."
        )}
      </p>
      {tasa && desactualizada ? (
        <p className="flex items-start gap-2 text-xs text-amber-200">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          Tasa desactualizada (del {formatearDiaCorto(tasa.fecha)}). Conéctate para
          actualizarla: los montos en bolívares pueden no cuadrar con la caja.
        </p>
      ) : null}
    </section>
  );
}
