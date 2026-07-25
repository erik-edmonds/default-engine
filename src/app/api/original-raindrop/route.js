import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

export async function GET() {
  const source = await readFile(new URL("../../../../public/scripts/raindrop.js", import.meta.url), "utf8");

  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
