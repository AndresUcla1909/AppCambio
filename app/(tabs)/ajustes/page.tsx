import { VistaAjustes } from "@/components/ajustes/VistaAjustes";
import { almacen } from "@/lib/almacen";
import { hoyCaracas } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaAjustes() {
  const [ultima] = await almacen.listar(1);
  const tasaDeHoy = await almacen.tasaEn(hoyCaracas());

  return (
    <VistaAjustes
      ultimaFecha={ultima?.fecha ?? null}
      hayTasaDeHoy={Boolean(tasaDeHoy?.es_exacta)}
    />
  );
}
