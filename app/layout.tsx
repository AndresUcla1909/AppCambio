import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
    statusBarStyle: "black-translucent",
    title: "Tasas",
  },
  // iOS detecta números largos como teléfonos y los pinta de azul.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#111114",
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
    <html lang="es-VE" className={`${geist.variable} dark h-full antialiased`}>
      <body className="bg-background text-foreground min-h-full">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
