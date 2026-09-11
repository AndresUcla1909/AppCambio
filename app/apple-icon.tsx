import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS recorta el ícono con sus propias esquinas redondeadas y no admite
 * transparencia, así que el fondo va sólido y a sangre.
 */
export default function IconoApple() {
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
            fontSize: 84,
            fontWeight: 700,
            color: "white",
            letterSpacing: -3,
          }}
        >
          Bs
        </div>
      </div>
    ),
    size,
  );
}
