import { NavegacionInferior } from "@/components/NavegacionInferior";

export default function LayoutPestanas({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* El relleno inferior deja sitio a la barra de navegación fija. */}
      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+76px)]">
        {children}
      </main>
      <NavegacionInferior />
    </div>
  );
}
