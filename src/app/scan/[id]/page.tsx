import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ScanMount } from "@/components/scan/ScanMount"
import { getScan, listScans } from "@/lib/scans"

/** A point cloud, streamed.
 *
 *  A Server Component, like the home route: it claims the URL and owns the
 *  metadata, and the viewer itself is a client component because every
 *  canvas on this site is.
 *
 *  `[id]` WITH A DATABASE BEHIND IT NOW. The note that used to be here said
 *  "when scans are uploaded and processed, SCANS becomes a database query and
 *  neither this file nor the viewer moves" -- and the viewer did not move. The
 *  only change to this file is where the lookup goes; `lib/scans.ts` keeps the
 *  static table as a fallback, so the route still renders with no database at
 *  all.
 *
 *  `generateStaticParams` IS KEPT, sourced from the registry rather than from
 *  a hard-coded object. Next's default `dynamicParams: true` means a scan
 *  added after the build is server-rendered on demand instead of 404ing, so
 *  this prerenders what exists at build time without closing the door on
 *  anything added later. Dropping it would have made every scan dynamic for
 *  no gain.
 */

export async function generateStaticParams() {
  const scans = await listScans()
  return scans.map((scan) => ({ id: scan.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const scan = await getScan(id)
  if (!scan) return { title: "Scan not found" }
  return {
    title: `${scan.label} | Point cloud`,
    description: `${scan.approxPoints.toLocaleString()} lidar points, streamed by HTTP range from a cloud-optimized point cloud.`,
  }
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = await getScan(id)
  if (!scan) notFound()
  return <ScanMount scan={scan} />
}
