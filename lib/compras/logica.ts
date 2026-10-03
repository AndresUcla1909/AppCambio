/**
 * El carrito de compras: lo que se va anotando en la tienda, escaneado con
 * la cámara o escrito a mano, con todo expresado en dólares y en bolívares
 * a la tasa del BCV.
 *
 * Admite descuentos por porcentaje en cada artículo y en el carrito entero.
 * Se combinan: el general se aplica sobre lo que ya quedó con los descuentos
 * de cada artículo, como un "descuento adicional" en la caja.
 *
 * Funciones puras, sin localStorage ni React, para poder testearlas. Cada
 * operación devuelve un carrito nuevo.
 */

/** En qué moneda está marcado el precio en la tienda. */
export type MonedaPrecio = "usd" | "bs";

export type Articulo = {
  id: string;
  /** Opcional: al escanear no hay tiempo de escribirlo. */
  nombre: string;
  /** Precio por unidad, en la moneda en que estaba marcado. */
  precio: number;
  moneda: MonedaPrecio;
  /** Admite decimales: medio kilo de queso es 0,5. */
  cantidad: number;
  /** Porcentaje de descuento de este artículo, de 0 a 100. */
  descuento: number;
  creadoEn: string;
};

export type Carrito = {
  /** Sale como título del PDF. */
  titulo: string;
  /** En el orden en que se agregaron. */
  articulos: Articulo[];
  /** Porcentaje de descuento a todo el carrito, de 0 a 100. */
  descuento: number;
  actualizadoEn: string;
};

/** Un monto en las dos monedas. `null` si hace falta la tasa y no la hay. */
export type EnAmbas = { usd: number | null; bs: number | null };

export const CARRITO_VACIO: Carrito = {
  titulo: "",
  articulos: [],
  descuento: 0,
  actualizadoEn: "",
};

/** Redondea a céntimos, como se cobra. */
export function redondear(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100;
}

/** Deja un porcentaje entre 0 y 100; lo que no es número cuenta como 0. */
export function acotarPorcentaje(valor: number): number {
  return Number.isFinite(valor) ? Math.min(100, Math.max(0, valor)) : 0;
}

/**
 * Pasa un monto a las dos monedas con la tasa BCV (bolívares por dólar). La
 * moneda original no cambia; la otra se calcula y se redondea a céntimos.
 */
export function enAmbas(monto: number, moneda: MonedaPrecio, tasa: number | null): EnAmbas {
  const valida = tasa != null && tasa > 0 ? tasa : null;
  if (moneda === "usd") {
    return { usd: redondear(monto), bs: valida ? redondear(monto * valida) : null };
  }
  return { usd: valida ? redondear(monto / valida) : null, bs: redondear(monto) };
}

/** Precio de una unidad tal como está marcado, en las dos monedas. */
export function precioUnitario(articulo: Articulo, tasa: number | null): EnAmbas {
  return enAmbas(articulo.precio, articulo.moneda, tasa);
}

/** Precio × cantidad, sin el descuento del artículo. */
export function subtotalSinDescuento(articulo: Articulo, tasa: number | null): EnAmbas {
  return enAmbas(articulo.precio * articulo.cantidad, articulo.moneda, tasa);
}

/**
 * Lo que suma el artículo: precio × cantidad, menos su descuento. Se calcula
 * todo antes de redondear, como hace la caja.
 */
export function subtotal(articulo: Articulo, tasa: number | null): EnAmbas {
  const factor = 1 - acotarPorcentaje(articulo.descuento) / 100;
  return enAmbas(articulo.precio * articulo.cantidad * factor, articulo.moneda, tasa);
}

export type Totales = {
  /** Lo que costaría todo sin ningún descuento. */
  sinDescuentos: EnAmbas;
  /** La suma de los artículos, ya con sus descuentos. */
  subtotal: EnAmbas;
  /** Lo que resta el descuento a todo el carrito. */
  descuentoGeneral: EnAmbas;
  /** Lo que se paga. */
  total: EnAmbas;
  /** Todo lo que se ahorra con los descuentos. */
  ahorro: EnAmbas;
  /** Cuántos renglones tiene el carrito. */
  articulos: number;
  /** Cuántas unidades en total (puede tener decimales si hay pesados). */
  unidades: number;
};

/**
 * Los totales del carrito. Cada moneda se suma por su lado con los
 * subtotales ya redondeados, para que cuadre con lo que se ve renglón por
 * renglón. Si falta la tasa y hay precios en la otra moneda, esa moneda
 * queda en `null`.
 */
export function totales(carrito: Carrito, tasa: number | null): Totales {
  const sinDescuentos = sumar(carrito.articulos.map((a) => subtotalSinDescuento(a, tasa)));
  const sub = sumar(carrito.articulos.map((a) => subtotal(a, tasa)));
  const general = acotarPorcentaje(carrito.descuento) / 100;

  const descuentoGeneral = porMoneda(sub, (m) => redondear(m * general));
  const total = porMoneda(sub, (m) => redondear(m - redondear(m * general)));
  const ahorro: EnAmbas = {
    usd: restar(sinDescuentos.usd, total.usd),
    bs: restar(sinDescuentos.bs, total.bs),
  };

  return {
    sinDescuentos,
    subtotal: sub,
    descuentoGeneral,
    total,
    ahorro,
    articulos: carrito.articulos.length,
    unidades: redondear(carrito.articulos.reduce((s, a) => s + a.cantidad, 0)),
  };
}

/** Si el carrito tiene algún descuento, general o de un artículo. */
export function tieneDescuentos(carrito: Carrito): boolean {
  return carrito.descuento > 0 || carrito.articulos.some((a) => a.descuento > 0);
}

/** El nombre a mostrar: el escrito o "Artículo N" según su posición. */
export function nombreDe(articulo: Articulo, indice: number): string {
  return articulo.nombre.trim() || `Artículo ${indice + 1}`;
}

function sumar(montos: EnAmbas[]): EnAmbas {
  let usd: number | null = 0;
  let bs: number | null = 0;
  for (const m of montos) {
    usd = usd == null || m.usd == null ? null : usd + m.usd;
    bs = bs == null || m.bs == null ? null : bs + m.bs;
  }
  return { usd: usd == null ? null : redondear(usd), bs: bs == null ? null : redondear(bs) };
}

function porMoneda(monto: EnAmbas, f: (m: number) => number): EnAmbas {
  return { usd: monto.usd == null ? null : f(monto.usd), bs: monto.bs == null ? null : f(monto.bs) };
}

function restar(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : redondear(a - b);
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                          */
/* ------------------------------------------------------------------ */

export type ArticuloNuevo = {
  nombre?: string;
  precio: number;
  moneda: MonedaPrecio;
  cantidad?: number;
  descuento?: number;
};

/** Agrega un artículo al final. Precios o cantidades no válidos se rechazan. */
export function agregar(carrito: Carrito, nuevo: ArticuloNuevo, id = crearId()): Carrito {
  const cantidad = nuevo.cantidad ?? 1;
  if (!(nuevo.precio > 0) || !(cantidad > 0)) {
    throw new Error("El precio y la cantidad tienen que ser mayores que cero.");
  }
  const ahora = new Date().toISOString();
  const articulo: Articulo = {
    id,
    nombre: (nuevo.nombre ?? "").trim(),
    precio: nuevo.precio,
    moneda: nuevo.moneda,
    cantidad,
    descuento: acotarPorcentaje(nuevo.descuento ?? 0),
    creadoEn: ahora,
  };
  return { ...carrito, articulos: [...carrito.articulos, articulo], actualizadoEn: ahora };
}

/** Cambia nombre, precio, moneda, cantidad o descuento de un artículo. */
export function actualizar(
  carrito: Carrito,
  id: string,
  cambios: Partial<Pick<Articulo, "nombre" | "precio" | "moneda" | "cantidad" | "descuento">>,
): Carrito {
  if (cambios.precio != null && !(cambios.precio > 0)) return carrito;
  if (cambios.cantidad != null && !(cambios.cantidad > 0)) return carrito;
  const limpios =
    cambios.descuento == null
      ? cambios
      : { ...cambios, descuento: acotarPorcentaje(cambios.descuento) };
  return {
    ...carrito,
    articulos: carrito.articulos.map((a) => (a.id === id ? { ...a, ...limpios } : a)),
    actualizadoEn: new Date().toISOString(),
  };
}

export function quitar(carrito: Carrito, id: string): Carrito {
  return {
    ...carrito,
    articulos: carrito.articulos.filter((a) => a.id !== id),
    actualizadoEn: new Date().toISOString(),
  };
}

export function ponerTitulo(carrito: Carrito, titulo: string): Carrito {
  return { ...carrito, titulo, actualizadoEn: new Date().toISOString() };
}

/** El descuento a todo el carrito, en porcentaje. */
export function ponerDescuentoGeneral(carrito: Carrito, porcentaje: number): Carrito {
  return {
    ...carrito,
    descuento: acotarPorcentaje(porcentaje),
    actualizadoEn: new Date().toISOString(),
  };
}

/** Carrito nuevo para otra compra: sin artículos, título ni descuento. */
export function vaciar(): Carrito {
  return { ...CARRITO_VACIO, actualizadoEn: new Date().toISOString() };
}

/**
 * Valida un carrito que viene de fuera (localStorage de otra versión, datos
 * corruptos). Descarta lo que no tenga forma de artículo en vez de romper.
 */
export function sanearCarrito(datos: unknown): Carrito {
  if (!datos || typeof datos !== "object") return { ...CARRITO_VACIO };
  const objeto = datos as Record<string, unknown>;
  const lista = Array.isArray(objeto.articulos) ? objeto.articulos : [];

  const articulos: Articulo[] = [];
  const ids = new Set<string>();
  for (const crudo of lista) {
    if (!crudo || typeof crudo !== "object") continue;
    const a = crudo as Record<string, unknown>;
    const precio = Number(a.precio);
    const cantidad = Number(a.cantidad);
    if (!(precio > 0) || !(cantidad > 0)) continue;
    if (a.moneda !== "usd" && a.moneda !== "bs") continue;
    let id = typeof a.id === "string" && a.id ? a.id : crearId();
    if (ids.has(id)) id = crearId();
    ids.add(id);
    articulos.push({
      id,
      nombre: typeof a.nombre === "string" ? a.nombre : "",
      precio,
      moneda: a.moneda,
      cantidad,
      descuento: acotarPorcentaje(Number(a.descuento ?? 0)),
      creadoEn: typeof a.creadoEn === "string" ? a.creadoEn : new Date().toISOString(),
    });
  }

  return {
    titulo: typeof objeto.titulo === "string" ? objeto.titulo : "",
    articulos,
    descuento: acotarPorcentaje(Number(objeto.descuento ?? 0)),
    actualizadoEn: typeof objeto.actualizadoEn === "string" ? objeto.actualizadoEn : "",
  };
}

function crearId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
