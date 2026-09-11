import { VistaHistorial } from "@/components/historial/VistaHistorial";
import { almacen } from "@/lib/almacen";

export const dynamic = "force-dynamic";

export default async function PaginaHistorial() {
  const filas = await almacen.listar();

  return <VistaHistorial filasIniciales={filas} />;
}
