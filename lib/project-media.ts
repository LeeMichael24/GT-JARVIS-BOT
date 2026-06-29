/**
 * Project media catalog — maps GT project names to their media assets
 * (brochures, price lists, floor plans, gallery images).
 *
 * Currently a static config. In the future this can pull from the GT API
 * if the backend adds media URLs to the listing response.
 */

export interface ProjectMedia {
  projectName: string
  brochureUrl: string | null
  priceListUrl: string | null
  floorPlanUrl: string | null
  galleryUrls: string[]
}

/**
 * Static media catalog keyed by normalised project name (lowercase).
 * Add entries here as media assets become available.
 *
 * URL values should be publicly accessible (WhatsApp Cloud API fetches them
 * server-side, so they cannot be behind auth).
 */
const MEDIA_CATALOG: Record<string, ProjectMedia> = {
  // Example entries — replace URLs with real ones when available:
  // 'foresta townhomes': {
  //   projectName: 'Foresta Townhomes',
  //   brochureUrl: 'https://assets.grupoterranovasv.com/docs/foresta-brochure.pdf',
  //   priceListUrl: 'https://assets.grupoterranovasv.com/docs/foresta-precios.pdf',
  //   floorPlanUrl: 'https://assets.grupoterranovasv.com/docs/foresta-planos.pdf',
  //   galleryUrls: [
  //     'https://assets.grupoterranovasv.com/img/foresta-1.jpg',
  //     'https://assets.grupoterranovasv.com/img/foresta-2.jpg',
  //   ],
  // },
}

export function getProjectMedia(projectName: string): ProjectMedia | null {
  const key = projectName.toLowerCase()
  return MEDIA_CATALOG[key] ?? null
}

/**
 * Returns all configured project media entries — used by the admin panel
 * to show which projects have media and which don't.
 */
export function getAllProjectMedia(): ProjectMedia[] {
  return Object.values(MEDIA_CATALOG)
}

/**
 * Checks if a project has any media configured at all.
 */
export function hasAnyMedia(media: ProjectMedia): boolean {
  return !!(media.brochureUrl || media.priceListUrl || media.floorPlanUrl || media.galleryUrls.length > 0)
}
