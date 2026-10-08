"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, ChartLine, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/", etiqueta: "Inicio", Icono: Calculator },
  { href: "/compras", etiqueta: "Compras", Icono: ShoppingCart },
  { href: "/historial", etiqueta: "Historial", Icono: ChartLine },
] as const;

export function NavegacionInferior() {
  const ruta = usePathname();

  return (
    <nav
      className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {PESTANAS.map(({ href, etiqueta, Icono }) => {
          const activa = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  activa
                    ? "text-azul"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="size-[22px]" strokeWidth={activa ? 2.4 : 1.8} />
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
