import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    intensity: 0.72,
    blur: 7,
    tint: "#10232c",
  });
}
