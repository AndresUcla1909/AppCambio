import { Calculadora } from "@/components/Calculadora";

/**
 * Sin datos del servidor: el historial vive en el navegador. Así la página es
 * estática y el service worker puede cachearla para abrirla sin conexión.
 */
export default function PaginaInicio() {
  return <Calculadora />;
}
