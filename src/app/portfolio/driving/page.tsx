import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { projectByHref } from "@/config/projects"
import { ProjectWriteUp } from "../ProjectWriteUp"

/** Everything on this page comes from config/projects.ts -- see the note in
 *  ProjectWriteUp. This file exists to claim the route and the metadata. */
const project = projectByHref("/portfolio/driving")

export const metadata: Metadata = {
  title: project?.title ?? "Work",
  description: project?.blurb,
}

export default function Page() {
  if (!project) notFound()
  return <ProjectWriteUp project={project} />
}
