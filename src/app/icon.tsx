import { ImageResponse } from "next/og";
import { MoneyIconMark } from "./icon-mark";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MoneyIconMark size={256} />
      </div>
    ),
    { ...size },
  );
}
