import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tasas — BCV y USDT",
    short_name: "Tasas",
    description:
      "Dólar BCV, Euro BCV y USDT P2P, con calculadora de bolívares.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111114",
    theme_color: "#111114",
    lang: "es-VE",
    dir: "ltr",
    categories: ["finance", "utilities"],
    icons: [
      {
        // Next genera este PNG desde `app/icon.tsx`.
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
