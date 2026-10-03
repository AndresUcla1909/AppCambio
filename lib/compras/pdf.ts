import { jsPDF } from "jspdf";
import autoTable, { type CellInput } from "jspdf-autotable";
import { formatearDia, formatearInstante, formatearTasa, hoyCaracas, type DiaISO } from "../formato";
import {
  nombreDe,
  precioUnitario,
  subtotal,
  totales,
  type Carrito,
  type EnAmbas,
} from "./logica";
import { bolivares as bs, cantidad, dolares as usd, porcentaje } from "./mostrar";

/**
 * El carrito en PDF, para guardarlo o mandarlo. Se arma en el teléfono con
 * jsPDF: no hace falta servidor ni conexión. La página lo importa sólo al
 * exportar, así no pesa en el arranque.
 */

/** La tasa BCV usada para convertir y desde cuándo rige. */
export type TasaDelPdf = { valor: number; fecha: DiaISO } | null;

/** Azul de la app, para la cabecera de la tabla. */
const AZUL: [number, number, number] = [47, 111, 237];
const GRIS: [number, number, number] = [120, 120, 120];
const VERDE: [number, number, number] = [22, 128, 61];

/** Una celda de la tabla y si es un monto convertido (va en gris). */
type Celda = { texto: string; convertido: boolean };

/** Las columnas: la de descuento sólo si algún artículo lo tiene. */
export function columnasDelPdf(carrito: Carrito): string[] {
  const conDescuento = carrito.articulos.some((a) => a.descuento > 0);
  return [
    "#",
    "Artículo",
    "Cant.",
    "Precio $",
    "Precio Bs",
    ...(conDescuento ? ["Desc."] : []),
    "Subtotal $",
    "Subtotal Bs",
  ];
}

/**
 * Las filas de la tabla, ya formateadas. Aparte del PDF para poder
 * probarlas sin generar el archivo.
 */
export function filasDelPdf(carrito: Carrito, tasa: TasaDelPdf): Celda[][] {
  const valor = tasa?.valor ?? null;
  const conDescuento = carrito.articulos.some((a) => a.descuento > 0);
  return carrito.articulos.map((articulo, i) => {
    const unitario = precioUnitario(articulo, valor);
    const parcial = subtotal(articulo, valor);
    const enDolares = articulo.moneda === "usd";
    return [
      { texto: String(i + 1), convertido: false },
      { texto: limpiar(nombreDe(articulo, i)), convertido: false },
      { texto: cantidad(articulo.cantidad), convertido: false },
      { texto: dolares(unitario), convertido: !enDolares },
      { texto: bolivares(unitario), convertido: enDolares },
      ...(conDescuento
        ? [
            {
              texto: articulo.descuento > 0 ? `${porcentaje(articulo.descuento)}` : "—",
              convertido: false,
            },
          ]
        : []),
      { texto: dolares(parcial), convertido: !enDolares },
      { texto: bolivares(parcial), convertido: enDolares },
    ];
  });
}

/** Genera el PDF. Devuelve sus bytes. */
export function generarPdf(
  carrito: Carrito,
  tasa: TasaDelPdf,
  ahora: Date = new Date(),
): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margen = 14;
  const ancho = doc.internal.pageSize.getWidth() - 2 * margen;
  const suma = totales(carrito, tasa?.valor ?? null);

  // Cabecera: título, fecha y la tasa con que se convirtió.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const lineasTitulo = doc.splitTextToSize(limpiar(tituloDe(carrito)), ancho);
  doc.text(lineasTitulo, margen, 20);
  let y = 20 + lineasTitulo.length * 7.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  const cuenta = `${suma.articulos} ${suma.articulos === 1 ? "artículo" : "artículos"}`;
  doc.text(limpiar(`${formatearInstante(ahora.toISOString())} · ${cuenta}`), margen, y);
  y += 5;
  doc.text(
    limpiar(
      tasa
        ? `Tasa BCV: Bs ${formatearTasa(tasa.valor)} por dólar (vigente desde el ${formatearDia(tasa.fecha)})`
        : "Sin tasa BCV: los montos en la otra moneda no se pudieron calcular.",
    ),
    margen,
    y,
  );
  doc.setTextColor(0, 0, 0);

  const columnas = columnasDelPdf(carrito);
  const filas = filasDelPdf(carrito, tasa);
  // Las dos últimas columnas son los subtotales; el pie se alinea con ellas.
  const antesDeSubtotales = columnas.length - 2;
  const filaDelPie = (etiqueta: string, monto: EnAmbas, signo = ""): CellInput[] => [
    { content: etiqueta, colSpan: antesDeSubtotales, styles: { halign: "right" } },
    { content: `${signo}${dolares(monto)}`, styles: { halign: "right" } },
    { content: `${signo}${bolivares(monto)}`, styles: { halign: "right" } },
  ];
  const pie: CellInput[][] = [];
  if (carrito.descuento > 0) {
    pie.push(filaDelPie("Subtotal", suma.subtotal));
    pie.push(
      filaDelPie(`Descuento a todo (${porcentaje(carrito.descuento)})`, suma.descuentoGeneral, "- "),
    );
  }
  pie.push(filaDelPie("Total", suma.total));

  autoTable(doc, {
    startY: y + 5,
    margin: { left: margen, right: margen },
    head: [columnas],
    body: filas.map((fila) => fila.map((c) => c.texto)),
    foot: pie,
    showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [235, 240, 252], textColor: 20, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { halign: "right", cellWidth: 8 },
      2: { halign: "right", cellWidth: 14 },
    },
    didParseCell: (dato) => {
      // Todo lo numérico a la derecha, con su cabecera.
      if (dato.column.index >= 2 && dato.section !== "foot") {
        dato.cell.styles.halign = "right";
      }
      // Lo convertido con la tasa, en gris: en negro queda el precio tal
      // como estaba marcado en la tienda.
      if (dato.section === "body" && filas[dato.row.index]?.[dato.column.index]?.convertido) {
        dato.cell.styles.textColor = GRIS;
      }
    },
  });

  let finTabla = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if ((suma.ahorro.usd ?? 0) > 0 || (suma.ahorro.bs ?? 0) > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...VERDE);
    doc.text(
      limpiar(`Ahorro con los descuentos: ${dolares(suma.ahorro)} · ${bolivares(suma.ahorro)}`),
      margen,
      finTabla + 7,
    );
    doc.setFont("helvetica", "normal");
    finTabla += 6;
  }
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(
    limpiar(
      "En negro, el precio como estaba marcado en la tienda; en gris, convertido con la tasa del BCV.",
    ),
    margen,
    finTabla + 6,
  );

  // Pie de cada página.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    const alto = doc.internal.pageSize.getHeight();
    doc.text("Tasas · lista de compras", margen, alto - 8);
    doc.text(`Página ${p} de ${paginas}`, margen + ancho, alto - 8, { align: "right" });
  }

  return doc.output("arraybuffer");
}

/** El título del carrito, o uno con la fecha si no tiene. */
export function tituloDe(carrito: Carrito): string {
  return carrito.titulo.trim() || `Compras del ${formatearDia(hoyCaracas())}`;
}

/** Nombre del archivo: el título sin acentos ni símbolos, y la fecha. */
export function nombreDelArchivo(carrito: Carrito): string {
  const base =
    carrito.titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "compras";
  return `${base}-${hoyCaracas()}.pdf`;
}

function dolares(monto: EnAmbas): string {
  return usd(monto.usd);
}

function bolivares(monto: EnAmbas): string {
  return bs(monto.bs);
}

/**
 * Las fuentes estándar del PDF sólo conocen los caracteres de Europa
 * occidental: un emoji o un espacio especial saldría como basura. Los
 * espacios raros (los que mete `Intl` en las horas) pasan a normales y lo
 * demás se quita.
 */
function limpiar(texto: string): string {
  return texto
    .replace(/[   ]/g, " ")
    .replace(/[−]/g, "-")
    .replace(/[^\x20-\x7E¡-ÿ€–—‘’“”•…·]/g, "");
}
