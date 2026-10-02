import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ['192.168.0.17'],
  // No `typescript.ignoreBuildErrors` here any more, deliberately.
  //
  // It used to suppress 615 errors. 216 of those were one cause -- gltfjsx
  // output reading `nodes.Foo.geometry`, which r3f types as a bare Object3D --
  // now fixed at the boundary in helpers/useGLTF.ts. ~270 more came from files
  // nothing imported, now deleted. What the flag was really costing was
  // visibility: it was also hiding two genuine bugs in hand-written state code,
  // which only surfaced once the noise was gone.
  //
  // (ESLint is not part of `next build` in this Next.js version at all -- `next
  // lint` and the `eslint` config option were removed in 16.0.0 -- so there is
  // no equivalent flag to drop for lint. `yarn lint` still has to be run.)

  // Nothing was setting Cache-Control on public/, so Next served the models,
  // audio and the raindrop bundle as max-age=0 and every one of them was
  // revalidated on every visit.
  //
  // This used to say `max-age=31536000, immutable`, on the stated grounds that
  // the files are "content-addressed by hand (a changed model gets a new
  // filename or a ?v= query)". They are not: every path in the codebase is a
  // bare /models/name.glb and `?v=` appears nowhere. `immutable` is a promise
  // that the bytes at a URL will never change, and browsers honour it by not
  // revalidating AT ALL -- so re-exporting island.glb under the same name would
  // have been invisible to every returning visitor for a year, with no way to
  // push a correction.
  //
  // A year of caching with revalidation gets nearly all of the benefit and none
  // of that risk: a returning visitor still pays only a 304. `immutable` can
  // come back the day the filenames carry a content hash, and not before.
  async headers() {
    return [
      {
        source: "/:dir(models|sound|scripts|water|cubemap|images)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, must-revalidate" }],
      },
    ];
  },

  // NO REDIRECT ON /portfolio ANY MORE.
  //
  // There was a permanent 308 from /portfolio to /item/01, added when the page
  // was retired on the grounds that "the four project cards it held now hang
  // in the pool inside the Models portal". They do not -- the cards were taken
  // out of the water (see PortalInteriors.tsx) and never replaced, so the
  // redirect pointed at an empty room. /portfolio is the written work again
  // and the Models portal now links TO it, which is the direction that was
  // always right: the 3D scene is how you find the work, not where it lives.
  //
  // `permanent: true` means this shipped as a 308, which browsers and crawlers
  // cache hard. Anyone who followed it while it was live may hold it until
  // their cache clears; nothing can be done about that from here, and it is
  // the reason a redirect on a URL you might want back should be 307.
};

export default nextConfig;
