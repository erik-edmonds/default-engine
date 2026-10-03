/** Where the racing game's assets live, once.
 *
 *  The original project was a standalone Vite app served from its own root,
 *  so every path in it was relative ("models/car.glb"). Under the App Router
 *  a relative URL resolves against the ROUTE, not the origin, so the same
 *  string would ask for /mini-game/models/car.glb and 404 -- and a failed
 *  GLTF load inside <Suspense fallback={null}> shows an empty scene with
 *  nothing in the console to say why. Absolute, and in one place. */
export const RACING_ASSET = (file: string) => `/racing/${file}`
