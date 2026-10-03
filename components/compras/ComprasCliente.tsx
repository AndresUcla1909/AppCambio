"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * El carrito y la tasa salen del localStorage del teléfono, que en el
 * servidor no existe: la vista se monta sólo en el navegador. Así lee sus
 * datos desde el primer render, sin parpadeos. La página sigue siendo
 * estática, y el service worker la guarda para abrirla sin conexión.
 */
const VistaCompras = dynamic(
  () => import("@/components/compras/VistaCompras").then((m) => m.VistaCompras),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    ),
  },
);

export function ComprasCliente() {
  return <VistaCompras />;
}
