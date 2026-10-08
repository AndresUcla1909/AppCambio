/**
 * Tema claro u oscuro. La elección se guarda en el teléfono; "sistema" sigue
 * el ajuste del teléfono (`prefers-color-scheme`). Sin elección, la app es
 * oscura, como siempre fue.
 *
 * Sin "use client": `scriptTema()` lo usa el layout en el servidor para
 * aplicar el tema antes de pintar, sin un destello del tema equivocado.
 */

export type Tema = "claro" | "oscuro" | "sistema";

export const CLAVE_TEMA = "tema-v1";
export const TEMA_POR_DEFECTO: Tema = "oscuro";

/** Color de la barra del navegador y de Android; el mismo que `--background`. */
export const COLOR_BARRA = { oscuro: "#111114", claro: "#f4f4f6" } as const;

export function esTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "oscuro" || valor === "sistema";
}

/** Si con esa elección la pantalla va oscura. */
export function esOscuro(tema: Tema, sistemaOscuro: boolean): boolean {
  return tema === "sistema" ? sistemaOscuro : tema === "oscuro";
}

/** Pone o quita la clase `dark` en <html> y ajusta el color de la barra. */
export function aplicarTema(oscuro: boolean): void {
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", oscuro);
  // Los controles nativos (barras de desplazamiento, selector de fecha) también.
  raiz.style.colorScheme = oscuro ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", oscuro ? COLOR_BARRA.oscuro : COLOR_BARRA.claro);
}

/**
 * El script en línea que corre en <head> antes de pintar. Repite en
 * miniatura `esOscuro` + `aplicarTema`: no puede importar nada.
 */
export function scriptTema(): string {
  return `(function(){try{
var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});
if(t!=="claro"&&t!=="oscuro"&&t!=="sistema")t=${JSON.stringify(TEMA_POR_DEFECTO)};
var o=t==="sistema"?matchMedia("(prefers-color-scheme: dark)").matches:t==="oscuro";
var r=document.documentElement;r.classList.toggle("dark",o);r.style.colorScheme=o?"dark":"light";
}catch(e){}})();`;
}
