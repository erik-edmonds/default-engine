"use client"

import { Loader } from "@react-three/drei"

export default function Loading() {
  return (
    <Loader
      containerStyles={{ background: "#0a0a0a" }}
      innerStyles={{ width: 140, height: 4, background: "#272018" }}
      barStyles={{ background: "#ff7d1c" }}
      dataStyles={{
        fontFamily: "var(--font-geist-mono), monospace",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#f4ead8",
      }}
    />
  )
}
