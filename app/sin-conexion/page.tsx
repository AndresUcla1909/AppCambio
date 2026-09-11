import { CloudOff } from "lucide-react";
import Link from "next/link";

/**
 * Página de respaldo del service worker: sólo se ve al navegar a una ruta
 * que no estaba cacheada mientras no hay conexión.
 */
export default function PaginaSinConexion() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <CloudOff className="text-muted-foreground size-10" />
      <h1 className="text-lg font-semibold">Sin conexión</h1>
      <p className="text-muted-foreground text-sm">
        Esta pantalla no está guardada para uso sin conexión. La calculadora sí
        funciona con las últimas tasas que viste.
      </p>
      <Link href="/" className="text-azul text-sm underline underline-offset-4">
        Ir a la calculadora
      </Link>
    </main>
  );
}
