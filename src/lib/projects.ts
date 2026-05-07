export const SPONSOR_PROJECTS = [
  { slug: 'admin-app', name: 'Admin App', repo: 'https://github.com/LCV-Ideas-Software/admin-app' },
  { slug: 'astrologo-app', name: 'Astrologo App', repo: 'https://github.com/LCV-Ideas-Software/astrologo-app' },
  { slug: 'calculadora-app', name: 'Calculadora App', repo: 'https://github.com/LCV-Ideas-Software/calculadora-app' },
  { slug: 'cross-review-v1', name: 'Cross Review v1', repo: 'https://github.com/LCV-Ideas-Software/cross-review-v1' },
  { slug: 'cross-review-v2', name: 'Cross Review v2', repo: 'https://github.com/LCV-Ideas-Software/cross-review-v2' },
  { slug: 'grok-cli', name: 'Grok CLI', repo: 'https://github.com/LCV-Ideas-Software/grok-cli' },
  { slug: 'maestro-app', name: 'Maestro Editorial AI', repo: 'https://github.com/LCV-Ideas-Software/maestro-app' },
  { slug: 'mainsite-app', name: 'MainSite App', repo: 'https://github.com/LCV-Ideas-Software/mainsite-app' },
  { slug: 'mtasts-motor', name: 'MTA-STS Motor', repo: 'https://github.com/LCV-Ideas-Software/mtasts-motor' },
  {
    slug: 'oraculo-financeiro',
    name: 'Oraculo Financeiro',
    repo: 'https://github.com/LCV-Ideas-Software/oraculo-financeiro',
  },
  { slug: 'lcv-ideas-software', name: 'LCV Ideas & Software', repo: 'https://github.com/LCV-Ideas-Software' },
] as const;

export type SponsorProjectSlug = (typeof SPONSOR_PROJECTS)[number]['slug'];

export const PROJECT_BY_SLUG = new Map<string, (typeof SPONSOR_PROJECTS)[number]>(
  SPONSOR_PROJECTS.map((project) => [project.slug, project]),
);

export function normalizeProjectSlug(value: string | undefined): SponsorProjectSlug {
  const slug = String(value || '')
    .trim()
    .toLowerCase();
  return (PROJECT_BY_SLUG.has(slug) ? slug : 'lcv-ideas-software') as SponsorProjectSlug;
}
