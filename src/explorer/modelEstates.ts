import { Kit } from '../demo/model/kit';
import { buildSite } from '../demo/model/site';
import { buildDowntown } from '../demo/model/downtown';
import { type Collider, type EstateSite, estateSites } from './layout';
import type { Settlement } from '../sim/types';

/**
 * The model estates beside a futuristic city: the Residences block and the Downtown ensemble from
 * the scale-model demo, built exactly as in the demo and set down on their levelled ground.
 * Their buildings block movement like the city's own.
 */
export interface Estate {
  site: EstateSite;
  kit: Kit;
}

export interface Estates {
  estates: Estate[];
  colliders: Collider[];
}

export function buildEstates(s: Settlement | undefined): Estates | null {
  if (!s) return null;
  const sites = estateSites(s);
  if (!sites.length) return null;
  const estates: Estate[] = [];
  const colliders: Collider[] = [];
  for (const site of sites) {
    const kit = new Kit();
    if (site.kind === 'residences') buildSite(kit);
    else buildDowntown(kit);
    estates.push({ site, kit });
    for (const c of kit.solids) colliders.push({ ...c, x: c.x + site.x, z: c.z + site.z });
  }
  return { estates, colliders };
}
