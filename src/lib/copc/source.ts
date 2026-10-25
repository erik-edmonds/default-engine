import { Copc, Hierarchy } from "copc"

import { createRangeGetter, type RangeGetter } from "./getter"
import { DecodePool } from "./pool"
import type { DecodedNode, Scaling } from "./records"

/** A COPC file, opened, with its octree discoverable a page at a time.
 *
 *  Opening costs exactly two range requests and about 9KB: the 589-byte
 *  header plus COPC info VLR, then the root hierarchy page. Everything after
 *  that is driven by where the camera is looking. */
export class CopcSource {
  private constructor(
    readonly url: string,
    readonly copc: Copc,
    readonly getter: RangeGetter,
    readonly pool: DecodePool,
    /** Discovered nodes, by "d-x-y-z". A node here has point data to fetch. */
    readonly nodes: Map<string, Hierarchy.Node>,
    /** Hierarchy pages not yet loaded, by key. Fetched when traversal wants
     *  to descend past one -- this is how a 300M-point file stays navigable
     *  without ever reading its whole index. */
    readonly pages: Map<string, Hierarchy.Page>,
  ) {}

  static async open(url: string, pool: DecodePool): Promise<CopcSource> {
    const getter = createRangeGetter(url)
    const copc = await Copc.create(getter)
    const source = new CopcSource(url, copc, getter, pool, new Map(), new Map())
    await source.loadPage("0-0-0-0", copc.info.rootHierarchyPage)
    return source
  }

  /** The octree's half-width, and the centre every position is made relative
   *  to. See the note in records.ts on why positions cannot be absolute. */
  get origin(): [number, number, number] {
    const [minX, minY, minZ, maxX, maxY, maxZ] = this.copc.info.cube
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  }

  get cubeSize(): number {
    const [minX, , , maxX] = this.copc.info.cube
    return maxX - minX
  }

  get scaling(): Scaling {
    const { scale, offset } = this.copc.header
    return { scale: [scale[0], scale[1], scale[2]], offset: [offset[0], offset[1], offset[2]] }
  }

  /** A node's bounding box in the same origin-relative space as its points,
   *  so culling and geometry agree. The octree is a cube subdivided 2^d per
   *  axis, so this is pure arithmetic -- no stored bounds to go stale. */
  nodeBox(key: string): { min: [number, number, number]; max: [number, number, number] } {
    const [d, x, y, z] = key.split("-").map(Number)
    const size = this.cubeSize / 2 ** d
    const [cx, cy, cz] = this.origin
    const [minX, minY, minZ] = this.copc.info.cube
    return {
      min: [minX + x * size - cx, minY + y * size - cy, minZ + z * size - cz],
      max: [minX + (x + 1) * size - cx, minY + (y + 1) * size - cy, minZ + (z + 1) * size - cz],
    }
  }

  /** Point spacing at a depth. The selection metric in traverse.ts is this
   *  over distance-to-camera, which is Potree's and is the standard. */
  spacingAt(depth: number): number {
    return this.copc.info.spacing / 2 ** depth
  }

  private async loadPage(key: string, page: Hierarchy.Page) {
    const subtree = await Hierarchy.load(this.getter, page)
    for (const [k, node] of Object.entries(subtree.nodes)) if (node) this.nodes.set(k, node)
    for (const [k, p] of Object.entries(subtree.pages)) if (p) this.pages.set(k, p)
    this.pages.delete(key)
  }

  /** Descend into a lazily-referenced hierarchy page, once. */
  async ensurePage(key: string): Promise<boolean> {
    const page = this.pages.get(key)
    if (!page) return false
    this.pages.delete(key)
    await this.loadPage(key, page)
    return true
  }

  /** Fetch and decode one node. The signal cancels the download, which is
   *  the whole reason this does not use copc's loadCompressedPointDataBuffer. */
  async loadNode(key: string, signal: AbortSignal): Promise<DecodedNode> {
    const node = this.nodes.get(key)
    if (!node) throw new Error(`no such node ${key}`)
    const compressed = await this.getter(
      node.pointDataOffset,
      node.pointDataOffset + node.pointDataLength,
      { signal },
    )
    if (signal.aborted) throw new DOMException("aborted", "AbortError")
    const { pointDataRecordFormat, pointDataRecordLength } = this.copc.header
    return this.pool.decode({
      // Copied out of the fetch buffer so the transfer below cannot detach
      // anything the caller still holds.
      compressed: compressed.slice().buffer,
      pointCount: node.pointCount,
      pointDataRecordFormat,
      pointDataRecordLength,
      scaling: this.scaling,
      origin: this.origin,
    })
  }
}
