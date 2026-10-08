import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AplicarTema } from "@/components/AplicarTema";
import { COLOR_BARRA, scriptTema } from "@/lib/tema";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tasas",
  description: "Dólar BCV, Euro BCV y USDT P2P, con calculadora de bolívares.",
  applicationName: "Tasas",
  manifest: "/manifest.webmanifest",
  // Sin esto, iOS abre la app en Safari en vez de a pantalla completa.
  appleWebApp: {
    capable: true,
    // Sólida y no "black-translucent": con la translúcida, iOS 26 (WebKit bug
    // 301108) mide la pantalla sin la barra de estado y deja una franja muerta
    // abajo que ningún CSS alcanza; además la app quedaba bajo el difuminado
    // del reloj y, en tema claro, la hora blanca no se leía. Con ésta la app
    // empieza debajo del reloj. iOS la lee al abrir la app instalada; si no
    // cambia, hay que quitarla de la pantalla de inicio y volver a agregarla.
    statusBarStyle: "black",
    title: "Tasas",
  },
  // iOS detecta números largos como teléfonos y los pinta de azul.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // El script de tema lo cambia al claro si hace falta.
  themeColor: COLOR_BARRA.oscuro,
  width: "device-width",
  initialScale: 1,
  // Evita el zoom al enfocar un campo, que en iOS descoloca la pantalla.
  maximumScale: 1,
  userScalable: false,
  // Permite pintar bajo el notch; el relleno lo pone `safe-area-inset`.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `dark` es el tema por defecto; el script lo quita antes de pintar si se
    // eligió el claro. Por eso <html> puede no coincidir con el HTML estático.
    <html lang="es-VE" className={`${geist.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema() }} />
      </head>
      <body className="bg-background text-foreground min-h-full">
        <AplicarTema />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
