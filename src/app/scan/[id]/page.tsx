import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ScanMount } from "@/components/scan/ScanMount"
import { SCANS } from "@/config/scans"

/** A point cloud, streamed.
 *
 *  A Server Component, like the home route: it claims the URL and owns the
 *  metadata, and the viewer itself is a client component because every
 *  canvas on this site is.
 *
 *  `[id]` with a static table behind it is the real shape from day one.
 *  When scans are uploaded and processed, SCANS becomes a database query
 *  and neither this file nor the viewer moves.
 */

export async function generateStaticParams() {
  return Object.keys(SCANS).map((id) => ({ id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const scan = SCANS[id]
  if (!scan) return { title: "Scan not found" }
  return {
    title: `${scan.label} | Point cloud`,
    description: `${scan.approxPoints.toLocaleString()} lidar points, streamed by HTTP range from a cloud-optimized point cloud.`,
  }
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = SCANS[id]
  if (!scan) notFound()
  return <ScanMount scan={scan} />
}
