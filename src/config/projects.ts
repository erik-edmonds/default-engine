/** The four projects, in the order the portfolio runs.
 *
 *  These used to be the drei portals example's own props -- a jar of pickles, a
 *  teacup and an orange twice -- with three of the four frames named "2" and a
 *  stranger's name on every one. The four project pages they should have been
 *  pointing at have existed in this repo the whole time, linked from nothing.
 *
 *  THIS TABLE IS NOW THE WRITE-UPS TOO, not just the card faces. Three of the
 *  four pages under app/portfolio were byte-identical seventeen-word
 *  placeholders ("You made it through the portal"), and the fix is not three
 *  hand-written pages that drift: the pages render from here, so a project is
 *  described in exactly one place. config/portals.ts states the same principle
 *  in its own header for the same reason.
 *
 *  Each interior is a generated point cloud rather than a downloaded model:
 *  distinct per project by colour and density, owes nobody an attribution, and
 *  adds nothing to the download.
 */

/** Links out from a write-up -- a repo, a paper, a demo. */
export interface ProjectLink {
  label: string
  href: string
}

export interface Project {
  id: string
  /** Shown after the slash on a card face, when that is not the id. */
  label: string
  title: string
  /** One line. The card face and the index row. */
  blurb: string
  href: string
  accent: string
  count: number
  bg: string

  // --- the write-up -------------------------------------------------------
  /** What kind of work this is, in three or four words. The page's eyebrow. */
  kicker: string
  /** Why the problem is hard. Not what was built -- what was in the way. */
  problem: string
  /** How it was approached. The part a client is actually buying. */
  approach: string
  /** What it produced. */
  outcome: string
  /** Tools actually used. EMPTY UNTIL ERIK FILLS IT IN -- see the note at the
   *  bottom of this file. The page omits the section rather than printing a
   *  guess. */
  stack: string[]
  /** Repo, demo, paper. Same rule: empty means the section is not drawn. */
  links: ProjectLink[]
}

/** The column, gaussian first.
 *
 *  Order is deliberate and it is the answer to "what do you want seen?" --
 *  splatting leads. Reordering is safe: nothing indexes this array by
 *  position, PortalInteriors reads only its length, and `label` and `id`
 *  travel with their own entry.
 *
 *  `id` is "work-01".."work-04" rather than "01".."04" on purpose: the wouter
 *  route while you are inside the Models portal IS /item/01, and anything in
 *  there sharing that id blends itself open. */
export const PROJECTS: Project[] = [
  {
    id: "work-04",
    label: "01",
    title: "Gaussian Splatting",
    blurb: "Photographs in, a scene you can fly through out — in real time.",
    href: "/portfolio/gaussian",
    accent: "#d9a7ff",
    count: 2200,
    bg: "#150f1c",
    kicker: "Real-time radiance fields",
    problem:
      "Classical photogrammetry hands you a mesh that looks like a melted version of the thing you photographed — thin structures disappear, anything shiny turns to porridge. Neural radiance fields finally got the look right and then cost seconds a frame to render, which means nobody can move through one while it draws.",
    approach:
      "3D gaussian splatting throws out the network and the ray marching. A scene becomes a few million anisotropic gaussians — each with a position, a covariance, an opacity and a view-dependent colour — fitted to a set of posed photographs by gradient descent, with the optimiser free to split, clone and prune them as it goes. Because the primitives are rasterised rather than integrated along rays, the whole thing goes down a conventional graphics pipeline.",
    outcome:
      "A capture you can fly a camera through at interactive rates, reconstructed from ordinary photographs rather than modelled by hand — and light enough to ship to a browser, which is the part that makes it useful to somebody other than the person who trained it.",
    stack: [],
    links: [],
  },
  {
    id: "work-03",
    label: "02",
    title: "Autonomous Driving",
    blurb: "Closed-loop driving policies, evaluated in CARLA.",
    href: "/portfolio/driving",
    accent: "#7ce3b1",
    count: 1400,
    bg: "#0c1a16",
    kicker: "Simulation and control",
    problem:
      "The situations a driving policy has to survive are exactly the ones you cannot arrange on a real road: the cyclist that appears from behind a parked van, the junction taken in rain at dusk. And a model scored on a recorded dataset is only ever answering what a good driver did there — never what happens next when it gets it wrong.",
    approach:
      "CARLA closes the loop. The policy drives, the simulator reacts, and the errors compound the way they would in the world instead of being reset at every frame by the ground truth. That makes the interesting work scenario design and evaluation — building the situations that discriminate between a policy that has learned to drive and one that has learned the dataset.",
    outcome:
      "A policy measured on what it does rather than on what it predicts, under conditions chosen because they are hard.",
    stack: [],
    links: [],
  },
  {
    id: "work-02",
    label: "03",
    title: "Object Detection",
    blurb: "Finding and classifying things in images.",
    href: "/portfolio/detection",
    accent: "#ffb37a",
    count: 1100,
    bg: "#1b1410",
    kicker: "Computer vision",
    problem:
      "Detection is where a vision model meets the long tail. The classes you care about are rare, the ones you do not are everywhere, and average precision over the whole set will happily climb while the model gets steadily worse at the thing you actually needed it for.",
    approach:
      "The work that moves the number is rarely the architecture. It is looking at what the model gets wrong and why — which classes are confused, which are simply never seen, where the labels disagree with each other — and fixing the data and the evaluation before touching the model.",
    outcome:
      "A detector whose score means something, because the set it is scored on reflects the cases it has to get right.",
    stack: [],
    links: [],
  },
  {
    id: "work-01",
    label: "04",
    title: "The Election Map",
    blurb: "Every US county, by turnout and margin — interactive, in D3.",
    href: "/portfolio/election",
    accent: "#6fa8ff",
    count: 1800,
    bg: "#0d1b2a",
    kicker: "Data visualisation",
    problem:
      "The standard election map answers one question — who won where — and is actively misleading about every other one, because it colours land rather than people. Turnout, margin, and how a county's vote compares with its own state are three different stories that the familiar red-and-blue picture flattens into one.",
    approach:
      "Every county plotted against turnout and margin at once, with area carrying weight — raw votes, electoral votes, or a vote-power index — so that a sparse county stops shouting over a dense one. Cross-sections by race, sex, age and education sit behind the same controls, and the year steps without redrawing the frame.",
    outcome:
      "The one finished, interactive artefact on this site: live D3, real data, and a chart you can interrogate rather than look at.",
    stack: ["D3", "TypeScript", "React"],
    links: [],
  },
]

// ---------------------------------------------------------------------------
// THINGS ONLY ERIK CAN FILL IN
//
// `stack` and `links` are empty above for every project but the election map,
// whose stack is visible in its own source and so can be stated without
// guessing. Everything else -- which framework, which dataset, which GPU, the
// repo URL, the numbers -- is yours, and inventing a plausible-sounding list
// would be the one thing a portfolio must not do. The pages omit a section
// whose array is empty rather than printing a placeholder, so filling these in
// is purely additive: add the strings, the section appears.
//
// The prose above is deliberately about the PROBLEM and the APPROACH rather
// than about results, for the same reason. Where you have a number -- an mAP,
// a frame rate, a route-completion score, a dataset size -- it belongs in
// `outcome`, and it is the sentence that will do the most work on the page.
// ---------------------------------------------------------------------------

/** Vertical gap between cards in the pool, in world units.
 *
 *  Its own constant rather than CameraHelpers' FRAME_SPACING: that one is tied
 *  to the page camera's dolly and to WaterScene's default pool height, and this
 *  column is read through a portal window at a different scale. A card is 2.06
 *  tall at CARD_SCALE, so this leaves about a card's half-height of water
 *  between them. */
export const CARD_GAP = 3.2

/** Where the first card sits, relative to the interior group's origin.
 *
 *  Just below the frame's bottom edge rather than centred in it: the camera
 *  sees open water with the top of a card intruding, which is what says there
 *  is something to scroll to. Centring the first card instead makes the portal
 *  look finished and nobody scrolls. */
export const CARD_TOP = -1.2

/** Card size in the pool. The default Frame is 1.5 x 2.427; at this scale it is
 *  1.28 x 2.06, about two thirds of the frame height when the portal is open
 *  (the camera sees 3.08 units of height at the column's distance). */
export const CARD_SCALE = 0.85

/** Look one up by its route, for the pages that render from this table. */
export const projectByHref = (href: string) => PROJECTS.find((p) => p.href === href) ?? null
