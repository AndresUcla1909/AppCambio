import { describe, expect, it } from "vitest";
import {
  conVariacion,
  fundir,
  historial,
  sanear,
  tasaVigenteEn,
  upsert,
} from "../almacen/logica";
import type { FilaTasa } from "../almacen/tipos";

function fila(
  fecha: string,
  usd: number,
  eur: number | null = null,
  extra: Partial<FilaTasa> = {},
): FilaTasa {
  return {
    fecha,
    usd,
    eur,
    fuente: "bcv",
    creado_en: "2026-09-01T00:00:00.000Z",
    actualizado_en: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

// Tres publicaciones desordenadas a propósito.
const FILAS = [
  fila("2026-09-15", 842.2067, 977.8778),
  fila("2026-09-10", 830.0, 965.0),
  fila("2026-09-11", 832.4883, 968.0673),
];

describe("conVariacion", () => {
  it("ordena por fecha y enlaza cada fila con la anterior", () => {
    const resultado = conVariacion(FILAS);
    expect(resultado.map((f) => f.fecha)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-15",
    ]);
    expect(resultado[0].usd_anterior).toBeNull();
    expect(resultado[1].usd_anterior).toBe(830.0);
    expect(resultado[2].usd_anterior).toBe(832.4883);
  });

  it("no pierde la referencia del euro si un día no se publica", () => {
    const conHueco = [
      fila("2026-09-10", 830.0, 965.0),
      fila("2026-09-11", 832.4883, null),
      fila("2026-09-15", 842.2067, 977.8778),
    ];
    const resultado = conVariacion(conHueco);
    // El 15 debe comparar contra el 10, que fue el último euro publicado.
    expect(resultado[2].eur_anterior).toBe(965.0);
  });

  it("no muta el arreglo original", () => {
    const copia = [...FILAS];
    conVariacion(FILAS);
    expect(FILAS).toEqual(copia);
  });
});

describe("historial", () => {
  it("devuelve de la más reciente a la más antigua", () => {
    expect(historial(FILAS).map((f) => f.fecha)).toEqual([
      "2026-09-15",
      "2026-09-11",
      "2026-09-10",
    ]);
  });

  it("respeta el límite", () => {
    expect(historial(FILAS, 2)).toHaveLength(2);
    expect(historial(FILAS, 2)[0].fecha).toBe("2026-09-15");
  });
});

describe("tasaVigenteEn", () => {
  it("da la tasa exacta cuando ese día sí hubo publicación", () => {
    const tasa = tasaVigenteEn(FILAS, "2026-09-11");
    expect(tasa?.usd).toBe(832.4883);
    expect(tasa?.es_exacta).toBe(true);
    expect(tasa?.fecha_solicitada).toBe("2026-09-11");
  });

  it("cae al último día hábil en fin de semana o feriado", () => {
    // El 13 fue sábado: no hay publicación propia.
    const tasa = tasaVigenteEn(FILAS, "2026-09-13");
    expect(tasa?.fecha).toBe("2026-09-11");
    expect(tasa?.es_exacta).toBe(false);
    expect(tasa?.fecha_solicitada).toBe("2026-09-13");
  });

  it("devuelve null si no hay ninguna tasa anterior a esa fecha", () => {
    expect(tasaVigenteEn(FILAS, "2026-01-01")).toBeNull();
  });

  it("nunca usa una publicación futura", () => {
    // El 15 ya está guardada, pero el 12 no debe verla.
    expect(tasaVigenteEn(FILAS, "2026-09-12")?.fecha).toBe("2026-09-11");
  });

  it("trae también la anterior, para calcular la variación", () => {
    expect(tasaVigenteEn(FILAS, "2026-09-15")?.usd_anterior).toBe(832.4883);
  });
});

describe("upsert", () => {
  it("agrega una fecha nueva en su sitio", () => {
    const resultado = upsert(FILAS, {
      fecha: "2026-09-12",
      usd: 835,
      eur: null,
      fuente: "manual",
    });
    expect(resultado).toHaveLength(4);
    expect(resultado.map((f) => f.fecha)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-15",
    ]);
  });

  it("reemplaza sin duplicar si la fecha ya existe", () => {
    const resultado = upsert(FILAS, {
      fecha: "2026-09-11",
      usd: 999,
      eur: null,
      fuente: "manual",
    });
    expect(resultado).toHaveLength(3);
    const tocada = resultado.find((f) => f.fecha === "2026-09-11");
    expect(tocada?.usd).toBe(999);
    expect(tocada?.fuente).toBe("manual");
  });

  it("conserva el creado_en original al corregir una tasa", () => {
    const resultado = upsert(FILAS, {
      fecha: "2026-09-11",
      usd: 999,
      eur: null,
      fuente: "manual",
    });
    const tocada = resultado.find((f) => f.fecha === "2026-09-11");
    expect(tocada?.creado_en).toBe("2026-09-01T00:00:00.000Z");
    expect(tocada?.actualizado_en).not.toBe("2026-09-01T00:00:00.000Z");
  });

  it("es idempotente: guardar dos veces deja una sola fila", () => {
    const nueva = {
      fecha: "2026-09-16" as const,
      usd: 850,
      eur: null,
      fuente: "bcv" as const,
    };
    const unaVez = upsert(FILAS, nueva);
    const dosVeces = upsert(unaVez, nueva);
    expect(dosVeces).toHaveLength(4);
  });
});

describe("sanear", () => {
  it("descarta lo que no tiene forma de tasa", () => {
    const resultado = sanear([
      fila("2026-09-11", 832.4883),
      { fecha: "no-es-fecha", usd: 100 },
      { fecha: "2026-09-12" }, // sin usd
      { fecha: "2026-09-13", usd: 0 }, // usd no positivo
      { fecha: "2026-09-14", usd: "abc" },
      null,
      "texto suelto",
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].fecha).toBe("2026-09-11");
  });

  it("devuelve vacío si no es un arreglo", () => {
    expect(sanear(null)).toEqual([]);
    expect(sanear({ fecha: "2026-09-11" })).toEqual([]);
    expect(sanear("[]")).toEqual([]);
  });

  it("normaliza el euro inválido a null y la fuente desconocida a manual", () => {
    const resultado = sanear([
      { fecha: "2026-09-11", usd: 832, eur: 0, fuente: "inventada" },
    ]);
    expect(resultado[0].eur).toBeNull();
    expect(resultado[0].fuente).toBe("manual");
  });

  it("se queda con la primera ante fechas repetidas", () => {
    const resultado = sanear([
      { fecha: "2026-09-11", usd: 100 },
      { fecha: "2026-09-11", usd: 200 },
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].usd).toBe(100);
  });
});

describe("fundir", () => {
  it("suma las fechas que faltaban sin tocar las existentes", () => {
    const entrantes = [fila("2026-09-09", 828.0)];
    const resultado = fundir(FILAS, entrantes);
    expect(resultado).toHaveLength(4);
    expect(resultado[0].fecha).toBe("2026-09-09");
  });

  it("ante la misma fecha gana la actualizada más recientemente", () => {
    const masNueva = fila("2026-09-11", 111, null, {
      actualizado_en: "2026-12-31T00:00:00.000Z",
    });
    expect(
      fundir(FILAS, [masNueva]).find((f) => f.fecha === "2026-09-11")?.usd,
    ).toBe(111);
  });

  it("un respaldo viejo no pisa una corrección reciente", () => {
    const masVieja = fila("2026-09-11", 111, null, {
      actualizado_en: "2020-01-01T00:00:00.000Z",
    });
    expect(
      fundir(FILAS, [masVieja]).find((f) => f.fecha === "2026-09-11")?.usd,
    ).toBe(832.4883);
  });
});
