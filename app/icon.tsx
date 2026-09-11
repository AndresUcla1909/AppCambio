import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Ícono de la app. El relleno generoso es a propósito: así el mismo PNG
 * sirve como ícono `maskable`, donde Android recorta un círculo.
 */
export default function Icono() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #1d4ed8 0%, #0e1b3d 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 210,
            fontWeight: 700,
            color: "white",
            letterSpacing: -8,
          }}
        >
          Bs
        </div>
      </div>
    ),
    size,
  );
}
