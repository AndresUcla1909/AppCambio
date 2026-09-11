import { almacenLocal } from "./local";
import type { RepositorioTasas } from "./tipos";

/**
 * Punto único donde se elige el almacén. Cuando entre Supabase, aquí se
 * decidirá entre uno y otro según las variables de entorno; el resto de la
 * app no cambia.
 */
export const almacen: RepositorioTasas = almacenLocal;

export type * from "./tipos";
