import { Calculadora } from "@/components/Calculadora";
import { almacen } from "@/lib/almacen";
import { hoyCaracas } from "@/lib/formato";

// El almacén cambia con cada captura del BCV: nada que prerenderizar.
export const dynamic = "force-dynamic";

export default async function PaginaInicio() {
  const hoy = hoyCaracas();
  const tasaInicial = await almacen.tasaEn(hoy);

  return <Calculadora tasaInicial={tasaInicial} hoy={hoy} />;
}
