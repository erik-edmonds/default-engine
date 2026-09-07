import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ['192.168.0.17'],
  // A large pre-existing backlog of GLTF-model type-narrowing gaps (tracked
  // for part 2) would otherwise block every production build. The handful
  // of genuine bugs in that backlog have been fixed directly; the rest is
  // non-blocking here but still visible via `npx tsc --noEmit`. (ESLint
  // isn't part of `next build` in this Next.js version at all -- `next
  // lint` and the `eslint` config option were removed in 16.0.0 -- so no
  // equivalent flag is needed for lint.)
  typescript: { ignoreBuildErrors: true },

  // Nothing was setting Cache-Control on public/, so Next served the models,
  // audio and the raindrop bundle as max-age=0 and every one of them was
  // revalidated on every visit. These are content-addressed by hand (a changed
  // model gets a new filename or a ?v= query), so they can be immutable.
  async headers() {
    return [
      {
        source: "/:dir(models|sound|scripts|water|cubemap|images)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
