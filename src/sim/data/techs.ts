import type { TechDef } from '../types';

/**
 * Technology tree. Effects are applied as additive multipliers by
 * `techModifiers()` in systems/technology.ts.
 */
export const TECHS: TechDef[] = [
  // Tier 1 — foundations
  { id: 'irrigation', name: 'Irrigation Networks', category: 'agriculture', tier: 1, cost: 120, prereqs: [], description: 'Channelled water lets farms survive dry seasons.', effects: { production: { food: 0.15 } } },
  { id: 'metallurgy', name: 'Metallurgy', category: 'industry', tier: 1, cost: 120, prereqs: [], description: 'Reliable alloys for tools and frames.', effects: { production: { materials: 0.15 } } },
  { id: 'combustion', name: 'Combustion Engines', category: 'energy', tier: 1, cost: 120, prereqs: [], description: 'Controlled burning turned into motion and power.', effects: { production: { energy: 0.15 } } },
  { id: 'written_law', name: 'Codified Law', category: 'society', tier: 1, cost: 110, prereqs: [], description: 'Shared written rules reduce disputes.', effects: { stability: 4 } },
  { id: 'herbal_medicine', name: 'Systematic Medicine', category: 'medicine', tier: 1, cost: 110, prereqs: [], description: 'Catalogued remedies and hygiene.', effects: { health: 0.15 } },
  { id: 'optics', name: 'Optics', category: 'science', tier: 1, cost: 110, prereqs: [], description: 'Lenses reveal the very small and the very far.', effects: { research: 0.1 } },

  // Tier 2
  { id: 'crop_genetics', name: 'Crop Genetics', category: 'agriculture', tier: 2, cost: 320, prereqs: ['irrigation', 'optics'], description: 'Selective breeding of resilient high-yield crops.', effects: { production: { food: 0.25 }, growth: 0.05 } },
  { id: 'assembly_lines', name: 'Assembly Lines', category: 'industry', tier: 2, cost: 320, prereqs: ['metallurgy'], description: 'Standardised mass production of goods.', effects: { production: { goods: 0.3, materials: 0.1 } } },
  { id: 'electrification', name: 'Electrification', category: 'energy', tier: 2, cost: 340, prereqs: ['combustion', 'metallurgy'], description: 'Power grids reach every district.', effects: { production: { energy: 0.25, goods: 0.1 }, capacity: 0.1 } },
  { id: 'printing', name: 'Mass Communication', category: 'society', tier: 2, cost: 300, prereqs: ['written_law'], description: 'Ideas spread faster than rumour.', effects: { research: 0.12, stability: 2 } },
  { id: 'vaccination', name: 'Vaccination', category: 'medicine', tier: 2, cost: 320, prereqs: ['herbal_medicine', 'optics'], description: 'Immunity against the great plagues.', effects: { health: 0.25, growth: 0.05 } },
  { id: 'scientific_method', name: 'Scientific Method', category: 'science', tier: 2, cost: 300, prereqs: ['optics', 'written_law'], description: 'Hypothesis, experiment, repeat.', effects: { research: 0.25 } },
  { id: 'radio', name: 'Radio Astronomy', category: 'space', tier: 2, cost: 380, prereqs: ['electrification', 'optics'], description: 'Listening to the sky — and to other worlds.', effects: { research: 0.05, unlocks: ['contact'] } },

  // Tier 3
  { id: 'vertical_farms', name: 'Vertical Farms', category: 'agriculture', tier: 3, cost: 700, prereqs: ['crop_genetics', 'electrification'], description: 'Food grown in towers under artificial suns.', effects: { production: { food: 0.35 }, capacity: 0.15 } },
  { id: 'automation', name: 'Automation', category: 'industry', tier: 3, cost: 720, prereqs: ['assembly_lines', 'electrification'], description: 'Machines that build machines.', effects: { production: { goods: 0.3, materials: 0.25 } } },
  { id: 'fission', name: 'Fission Power', category: 'energy', tier: 3, cost: 750, prereqs: ['electrification', 'scientific_method'], description: 'The atom yields abundant energy.', effects: { production: { energy: 0.45 } } },
  { id: 'global_network', name: 'Planetary Network', category: 'society', tier: 3, cost: 680, prereqs: ['printing', 'electrification'], description: 'Instant communication across the world.', effects: { research: 0.2, trade: 0.2, stability: 3 } },
  { id: 'gene_therapy', name: 'Gene Therapy', category: 'medicine', tier: 3, cost: 720, prereqs: ['vaccination', 'crop_genetics'], description: 'Inherited illness becomes curable.', effects: { health: 0.3 } },
  { id: 'computing', name: 'Computing', category: 'science', tier: 3, cost: 700, prereqs: ['scientific_method', 'electrification'], description: 'Calculation at the speed of light.', effects: { research: 0.35 } },
  { id: 'orbital_flight', name: 'Orbital Flight', category: 'space', tier: 3, cost: 800, prereqs: ['radio', 'fission'], description: 'Reaching orbit, and with it the system.', effects: { unlocks: ['contact', 'colonize'], trade: 0.1 } },

  // Tier 4
  { id: 'synthetic_biology', name: 'Synthetic Biology', category: 'agriculture', tier: 4, cost: 1400, prereqs: ['vertical_farms', 'gene_therapy'], description: 'Designed organisms for food and medicine.', effects: { production: { food: 0.4 }, health: 0.1 } },
  { id: 'nanofabrication', name: 'Nanofabrication', category: 'industry', tier: 4, cost: 1500, prereqs: ['automation', 'computing'], description: 'Matter assembled atom by atom.', effects: { production: { goods: 0.45, materials: 0.35 } } },
  { id: 'fusion', name: 'Fusion Power', category: 'energy', tier: 4, cost: 1500, prereqs: ['fission', 'computing'], description: 'A star bottled in a reactor.', effects: { production: { energy: 0.7 } } },
  { id: 'arcology', name: 'Arcologies', category: 'society', tier: 4, cost: 1300, prereqs: ['global_network', 'vertical_farms'], description: 'Self-contained city structures housing millions.', effects: { capacity: 0.4, stability: 3 } },
  { id: 'longevity', name: 'Longevity Treatments', category: 'medicine', tier: 4, cost: 1450, prereqs: ['gene_therapy', 'computing'], description: 'Ageing slowed to a crawl.', effects: { health: 0.35, growth: -0.02 } },
  { id: 'machine_learning', name: 'Synthetic Cognition', category: 'science', tier: 4, cost: 1450, prereqs: ['computing', 'global_network'], description: 'Thinking machines that assist research.', effects: { research: 0.5 } },
  { id: 'colonisation', name: 'Interplanetary Colonisation', category: 'space', tier: 4, cost: 1600, prereqs: ['orbital_flight', 'fusion'], description: 'Permanent settlements on other worlds.', effects: { unlocks: ['colonize'], capacity: 0.1 } },

  // Tier 5
  { id: 'terraforming', name: 'Terraforming', category: 'agriculture', tier: 5, cost: 2800, prereqs: ['synthetic_biology', 'colonisation'], description: 'Remaking climates to suit life.', effects: { production: { food: 0.3 }, capacity: 0.2 } },
  { id: 'matter_compilers', name: 'Matter Compilers', category: 'industry', tier: 5, cost: 3000, prereqs: ['nanofabrication', 'fusion'], description: 'Any object, printed from raw feedstock.', effects: { production: { goods: 0.6, materials: 0.4 } } },
  { id: 'quantum_lattice', name: 'Quantum Lattice Theory', category: 'science', tier: 5, cost: 3000, prereqs: ['machine_learning', 'fusion'], description: 'A unified model of spacetime structure.', effects: { research: 0.6 } },
  { id: 'warp_theory', name: 'Fold Drive', category: 'space', tier: 5, cost: 3600, prereqs: ['quantum_lattice', 'colonisation'], description: 'Folding space to reach other stars.', effects: { unlocks: ['interstellar'], trade: 0.3 } },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
