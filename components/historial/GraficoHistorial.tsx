"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FilaTasaConVariacion } from "@/lib/almacen/tipos";
import { formatearDia, formatearTasa } from "@/lib/formato";

export function GraficoHistorial({ filas }: { filas: FilaTasaConVariacion[] }) {
  // Las filas llegan de la más reciente a la más antigua; el gráfico va al revés.
  const datos = useMemo(
    () =>
      [...filas]
        .reverse()
        .map((fila) => ({ fecha: fila.fecha, usd: fila.usd })),
    [filas],
  );

  if (datos.length < 2) {
    return (
      <div className="border-border bg-card text-muted-foreground flex h-48 items-center justify-center rounded-2xl border text-xs">
        Hacen falta al menos dos publicaciones para dibujar el gráfico.
      </div>
    );
  }

  // Un margen del 2 % evita que la línea quede pegada a los bordes.
  const valores = datos.map((d) => d.usd);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const margen = (maximo - minimo || maximo * 0.01) * 0.2;

  return (
    <div className="border-border bg-card rounded-2xl border p-3 pr-4">
      <ResponsiveContainer width="100%" height={190}>
        <LineChart
          data={datos}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="fecha"
            tickFormatter={(valor: string) => valor.slice(8) + "/" + valor.slice(5, 7)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[minimo - margen, maximo + margen]}
            tickFormatter={(valor: number) =>
              new Intl.NumberFormat("es-VE", {
                maximumFractionDigits: 0,
              }).format(valor)
            }
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
            labelFormatter={(valor) => formatearDia(String(valor))}
            formatter={(valor) => [
              `Bs ${formatearTasa(Number(valor))}`,
              "Dólar BCV",
            ]}
          />
          <Line
            type="monotone"
            dataKey="usd"
            stroke="var(--azul)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--azul)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
