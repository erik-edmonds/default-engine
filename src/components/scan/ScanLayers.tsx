"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import {
  ASPRS_CLASSES,
  COLOR_MODES,
  COLOR_MODE_LABELS,
  HAG_RAMP,
  HAG_RAMP_MAX_M,
  UNKNOWN_CLASS_COLOR,
  type ColorModeName,
} from "@/config/asprs"
import { colorModeServerSnapshot, colorModeSnapshot, setColorMode, subscribeColorMode } from "@/helpers/colorMode"
import { scanStats } from "@/helpers/scanStats"

/** The annotation, made visible on a desktop.
 *
 *  THE GAP THIS CLOSES IS A NAMED ONE. STATUS.md, under Viewer: "There is no
 *  way to switch colour mode on desktop. `setColorMode` is reachable only from
 *  the VR menu, or with the development flag `?menu=1`." Everything behind the
 *  switch already existed -- the class palette and height ramp in
 *  config/asprs.ts, the band table in config/hagBands.json that both sides of
 *  the pipeline read, the shader in lib/scan/pointMaterial.ts -- and none of
 *  it could be seen without a headset. A pipeline whose output is only legible
 *  to someone wearing a Quest is a pipeline with no audience.
 *
 *  AND A LEGEND, WHICH THE HEADSET NEVER HAD EITHER. Colour without a key is
 *  decoration: "the green points" is not a finding, "class 5, high vegetation,
 *  29% of the resident set" is. The legend lists only the classes actually
 *  present, because the full ASPRS table is 23 rows of which a given file uses
 *  four, and a legend mostly made of absent categories teaches nothing.
 *
 *  NOT uikit. ScanMenu.tsx is the in-headset panel and it is loaded lazily
 *  through ScanMenuHost precisely so uikit never reaches the desktop bundle;
 *  this is plain DOM, which is also focusable, screen-readable and
 *  right-clickable in a way a uikit panel inside the canvas is not.
 *
 *  SWITCHING COSTS ONE ASSIGNMENT. `setColorMode` writes the shared uniform
 *  object that every resident node's material holds by reference, so no
 *  traversal of the resident set, no attribute re-upload, and no React commit
 *  inside the canvas. This component re-renders; the scene does not.
 */
export function ScanLayers() {
  const mode = useSyncExternalStore(subscribeColorMode, colorModeSnapshot, colorModeServerSnapshot)

  /** POLLED, NOT SUBSCRIBED, and the file it comes from says why.
   *
   *  `scanStats` is a module object that writers mutate -- PointCloud sums the
   *  per-node class histograms about six times a second. helpers/scanStats.ts
   *  is explicit that this must not become React state: six renders a second
   *  of a tree that also contains the point cloud is the one thing the readout
   *  must not do. So this reads it on its own slower schedule, and only the
   *  legend re-renders.
   *
   *  Twice a second: fast enough that the legend fills in as nodes stream, far
   *  below the rate the histogram actually changes. */
  const [present, setPresent] = useState<{ code: number; count: number }[]>([])
  /** Whether this file carries HeightAboveGround at all.
   *
   *  NOT A DETAIL -- IT IS THE DIFFERENCE BETWEEN A MODE AND A LIE. The raw
   *  Autzen survey has Classification (so the class view is real) and no
   *  HeightAboveGround, because that dimension is written by the annotation
   *  pipeline, not by the scanner. Selecting Height on such a file left the
   *  shader with no `hag` attribute -- `HAS_HAG` is undefined, the branch that
   *  samples the ramp is compiled out -- and the whole scan rendered a flat
   *  uniform grey. No error, no warning, just a mode that appears to work and
   *  shows nothing. Exactly the silent failure pipeline/annotate.py's guards
   *  exist to prevent, reproduced in the viewer.
   *
   *  `scanStats.hasHag` was already being published by PointCloud and simply
   *  had no reader. */
  const [hasHag, setHasHag] = useState(true)
  useEffect(() => {
    const read = () => {
      setHasHag(scanStats.hasHag)
      if (mode !== "class") return
      const h = scanStats.classHistogram
      if (!h) return
      const rows: { code: number; count: number }[] = []
      for (let code = 0; code < h.length; code++) if (h[code] > 0) rows.push({ code, count: h[code] })
      // Biggest first: on an aerial survey that is ground, then canopy, which
      // is the order someone reads them in anyway.
      rows.sort((a, b) => b.count - a.count)
      setPresent(rows)
    }
    read()
    const timer = setInterval(read, 500)
    return () => clearInterval(timer)
  }, [mode])

  // Never leave the viewer in a mode the file cannot answer. If a scan without
  // heights loads while Height is selected -- switching scans, or a derivative
  // that turns out not to carry the dimension -- fall back rather than show a
  // flat grey field.
  useEffect(() => {
    if (!hasHag && mode === "height") setColorMode("rgb")
  }, [hasHag, mode])

  const total = present.reduce((a, r) => a + r.count, 0)

  /** Rows worth a line, and a count of the ones that are not.
   *
   *  THE FULL LIST IS NOISE AND IT COLLIDED WITH THE BACK LINK. The stadium
   *  sample resolves to fifteen classes, of which eight are user-definable
   *  codes in the 64-255 range sitting at 0.0% -- the legend ran the height of
   *  the viewport to tell you about 400 points. A reader needs the classes
   *  that describe the scan; the tail only needs to be acknowledged, so it is
   *  one line instead of eight.
   *
   *  A share, not a fixed row count: "the classes that make up this scan" does
   *  not have a constant length, and an agricultural file with four classes
   *  should not be padded to ten. */
  const FLOOR = 0.001
  const shown = total ? present.filter((r) => r.count / total >= FLOOR) : present
  const hidden = present.length - shown.length

  return (
    <div className="scan-layers">
      <h2 className="scan-layers-h">Layers</h2>
      <div className="scan-modes" role="group" aria-label="Point colour">
        {COLOR_MODES.map((name: ColorModeName) => {
          const unavailable = name === "height" && !hasHag
          return (
            <button
              key={name}
              type="button"
              className="scan-mode"
              aria-pressed={mode === name}
              disabled={unavailable}
              title={
                unavailable
                  ? "This file carries no HeightAboveGround — it is written by the annotation pipeline, not by the scanner."
                  : undefined
              }
              onClick={() => setColorMode(name)}
            >
              {COLOR_MODE_LABELS[name]}
            </button>
          )
        })}
      </div>

      {mode === "class" && (
        <ul className="scan-legend">
          {present.length === 0 && <li className="scan-legend-empty">waiting for points…</li>}
          {shown.map(({ code, count }) => {
            const known = ASPRS_CLASSES.find((c) => c.code === code)
            return (
              <li key={code}>
                <span className="scan-swatch" style={{ background: known?.color ?? UNKNOWN_CLASS_COLOR }} />
                <span className="scan-legend-label">{known?.label ?? `class ${code}`}</span>
                <span className="scan-legend-count">
                  {total ? `${((count / total) * 100).toFixed(1)}%` : ""}
                </span>
              </li>
            )
          })}
          {hidden > 0 && (
            <li className="scan-legend-more">
              {`+${hidden} more below ${(FLOOR * 100).toFixed(1)}%`}
            </li>
          )}
        </ul>
      )}

      {mode === "height" && (
        <div className="scan-ramp-wrap">
          {/* The ramp as it is actually applied: HAG_RAMP is sampled into a
              256x1 DataTexture by buildHagRamp and indexed by height/max, so a
              linear gradient through the same stops is the honest picture of
              it rather than an approximation. */}
          <div
            className="scan-ramp"
            style={{ backgroundImage: `linear-gradient(to right, ${HAG_RAMP.join(", ")})` }}
          />
          <div className="scan-ramp-scale">
            <span>0 m</span>
            <span>above ground</span>
            <span>{HAG_RAMP_MAX_M} m+</span>
          </div>
        </div>
      )}

      {mode === "rgb" && <p className="scan-legend-empty">the file&rsquo;s own colour, unannotated</p>}

      {!hasHag && (
        <p className="scan-legend-empty">
          No heights in this file — run the annotation pipeline to get them.
        </p>
      )}
    </div>
  )
}
