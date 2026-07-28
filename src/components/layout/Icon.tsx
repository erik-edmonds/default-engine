"use client"
import { themes } from "@/helpers/Interfaces";
import { useAppState, inSkyJourney, goHomeRequest } from "@/helpers/StateProvider";
import { useAtomValue, useSetAtom } from "jotai";
import Link from "next/link";
export function Favicon() {
  const { theme } = useAppState()
  const journeyActive = useAtomValue(inSkyJourney)
  const requestGoHome = useSetAtom(goHomeRequest)

  return (
    <Link
      href="/"
      aria-label="Home"
      onClick={(e) => {
        if (journeyActive) {
          e.preventDefault()
          requestGoHome((n) => n + 1)
        }
      }}
    >
      <svg width={50} height={50} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
          <circle cx="70" cy="70" r="70" fill={themes[theme]["background"]}/>
          <g fill={themes[theme]["lines"]}>
              <path d="M70 10 L114 35 L70 60 Z"/>
              <path d="M117 40 L117 96 L70 67 Z"/>
              <path d="M114 102 L70 128 L70 74 Z"/>
              <path d="M22 35 L65 10 L64 60 Z"/>
              <g transform="translate(45,0) rotate(30)">
                  <rect x="8" y="58" width="42" height="6" rx="4" />
                  <rect x="21" y="73" width="35" height="6" rx="4"/>
                  <rect x="27" y="88" width="42" height="6" rx="4"/>
              </g>
          </g>
      </svg>
    </Link>
  );
}