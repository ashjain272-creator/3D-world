import type {
  ArchitectureStyle,
  CultureValues,
  GovernmentType,
  Good,
  Occupation,
  PolicyId,
  Skill,
  Specialization,
  TechCategory,
} from '../types';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  description: string;
  /** Production multipliers (additive). */
  production?: Partial<Record<Good, number>>;
  research?: number;
  satisfaction?: number;
  stability?: number;
  growth?: number;
  inequality?: number; // pushes inequality up (+) or down (-)
  treasuryPerCapita?: number; // daily cost (+) or income (-) per 1M pop
  trade?: number;
  /** Culture value alignment: positive affinity means the culture likes it. */
  culture: Partial<CultureValues>;
  excludes?: PolicyId[];
}

export const POLICIES: Record<PolicyId, PolicyDef> = {
  research_grants: { id: 'research_grants', name: 'Research Grants', description: 'State funding for laboratories and academies.', research: 0.25, treasuryPerCapita: 1.2, culture: { progress: 0.6, rationalism: 0.6 } },
  agrarian_subsidies: { id: 'agrarian_subsidies', name: 'Agrarian Subsidies', description: 'Price supports and equipment for farmers.', production: { food: 0.2 }, treasuryPerCapita: 0.8, satisfaction: 2, culture: { progress: -0.3, collectivism: 0.3 } },
  industrial_drive: { id: 'industrial_drive', name: 'Industrial Drive', description: 'Quotas and incentives for factories and mines.', production: { materials: 0.2, goods: 0.15 }, satisfaction: -3, culture: { collectivism: 0.4, militarism: 0.3 } },
  open_markets: { id: 'open_markets', name: 'Open Markets', description: 'Low tariffs and free private enterprise.', trade: 0.3, inequality: 0.08, production: { goods: 0.1 }, culture: { collectivism: -0.7, openness: 0.6 }, excludes: ['protectionism'] },
  protectionism: { id: 'protectionism', name: 'Protectionism', description: 'Tariffs shield domestic producers.', trade: -0.3, production: { materials: 0.1 }, stability: 2, culture: { openness: -0.7 }, excludes: ['open_markets'] },
  public_works: { id: 'public_works', name: 'Public Works', description: 'Roads, housing and grids built by the state.', treasuryPerCapita: 1.5, satisfaction: 3, growth: 0.02, culture: { collectivism: 0.5 }, excludes: ['austerity'] },
  austerity: { id: 'austerity', name: 'Austerity', description: 'Cuts spending to rebuild the treasury.', treasuryPerCapita: -1.5, satisfaction: -6, stability: -2, culture: { collectivism: -0.4 }, excludes: ['public_works', 'welfare'] },
  welfare: { id: 'welfare', name: 'Social Welfare', description: 'A floor of support for every citizen.', treasuryPerCapita: 1.6, satisfaction: 5, inequality: -0.1, culture: { collectivism: 0.7 }, excludes: ['austerity'] },
  expansionism: { id: 'expansionism', name: 'Expansionism', description: 'Encourages founding new settlements.', growth: 0.02, treasuryPerCapita: 0.6, culture: { militarism: 0.4, openness: 0.3 } },
  cultural_festivals: { id: 'cultural_festivals', name: 'Cultural Festivals', description: 'Seasonal celebrations of shared heritage.', satisfaction: 4, stability: 2, treasuryPerCapita: 0.5, culture: { progress: -0.4, rationalism: -0.4 } },
  martial_order: { id: 'martial_order', name: 'Martial Order', description: 'Patrols and curfews keep the peace.', stability: 8, satisfaction: -6, culture: { militarism: 0.8, openness: -0.4 } },
  exploration_charter: { id: 'exploration_charter', name: 'Exploration Charter', description: 'Funds expeditions to chart unknown regions.', research: 0.05, treasuryPerCapita: 0.7, culture: { openness: 0.6, progress: 0.3 } },
};

export interface GovernmentDef {
  type: GovernmentType;
  leaderTitle: string;
  termLengthDays: number; // 0 = for life
  succession: 'election' | 'heredity' | 'appointment' | 'council';
  baseLegitimacy: number;
  inequalityBias: number;
  preferredSkill: Skill;
  culture: Partial<CultureValues>;
}

export const GOVERNMENTS: Record<GovernmentType, GovernmentDef> = {
  Republic: { type: 'Republic', leaderTitle: 'First Consul', termLengthDays: 360 * 4, succession: 'election', baseLegitimacy: 70, inequalityBias: 0, preferredSkill: 'diplomacy', culture: { collectivism: -0.2, openness: 0.3 } },
  Technocracy: { type: 'Technocracy', leaderTitle: 'Chief Architect', termLengthDays: 360 * 6, succession: 'appointment', baseLegitimacy: 62, inequalityBias: 0.05, preferredSkill: 'science', culture: { rationalism: 0.8, progress: 0.6 } },
  Monarchy: { type: 'Monarchy', leaderTitle: 'Sovereign', termLengthDays: 0, succession: 'heredity', baseLegitimacy: 66, inequalityBias: 0.12, preferredSkill: 'leadership', culture: { progress: -0.6, militarism: 0.3 } },
  'Council of Elders': { type: 'Council of Elders', leaderTitle: 'Eldest Speaker', termLengthDays: 360 * 8, succession: 'council', baseLegitimacy: 68, inequalityBias: -0.02, preferredSkill: 'diplomacy', culture: { progress: -0.5, collectivism: 0.5 } },
  Directorate: { type: 'Directorate', leaderTitle: 'Director-General', termLengthDays: 360 * 5, succession: 'appointment', baseLegitimacy: 55, inequalityBias: 0.18, preferredSkill: 'commerce', culture: { collectivism: -0.7, openness: 0.4 } },
  Theocracy: { type: 'Theocracy', leaderTitle: 'High Oracle', termLengthDays: 0, succession: 'council', baseLegitimacy: 72, inequalityBias: 0.08, preferredSkill: 'leadership', culture: { rationalism: -0.9, progress: -0.3 } },
  Commune: { type: 'Commune', leaderTitle: 'Coordinator', termLengthDays: 360 * 2, succession: 'election', baseLegitimacy: 60, inequalityBias: -0.15, preferredSkill: 'diplomacy', culture: { collectivism: 0.9 } },
};

export interface OccupationDef {
  id: Occupation;
  label: string;
  skill: Skill;
  /** Which settlement specialisation benefits. */
  sector: Specialization | 'any';
  wage: number;
  verb: string;
}

export const OCCUPATIONS: Record<Occupation, OccupationDef> = {
  farmer: { id: 'farmer', label: 'Farmer', skill: 'agriculture', sector: 'agriculture', wage: 3, verb: 'tending the fields' },
  engineer: { id: 'engineer', label: 'Engineer', skill: 'engineering', sector: 'industry', wage: 6, verb: 'maintaining the works' },
  scientist: { id: 'scientist', label: 'Scientist', skill: 'science', sector: 'research', wage: 6, verb: 'running experiments' },
  merchant: { id: 'merchant', label: 'Merchant', skill: 'commerce', sector: 'trade', wage: 7, verb: 'brokering deals' },
  artisan: { id: 'artisan', label: 'Artisan', skill: 'craft', sector: 'industry', wage: 4, verb: 'crafting wares' },
  official: { id: 'official', label: 'Official', skill: 'leadership', sector: 'any', wage: 6, verb: 'handling civic affairs' },
  explorer: { id: 'explorer', label: 'Explorer', skill: 'exploration', sector: 'any', wage: 5, verb: 'charting the wilds' },
  medic: { id: 'medic', label: 'Medic', skill: 'medicine', sector: 'any', wage: 6, verb: 'treating patients' },
  teacher: { id: 'teacher', label: 'Teacher', skill: 'science', sector: 'research', wage: 4, verb: 'teaching classes' },
  guard: { id: 'guard', label: 'Warden', skill: 'leadership', sector: 'any', wage: 4, verb: 'keeping watch' },
  miner: { id: 'miner', label: 'Miner', skill: 'engineering', sector: 'mining', wage: 4, verb: 'working the deep shafts' },
  artist: { id: 'artist', label: 'Artist', skill: 'art', sector: 'any', wage: 3, verb: 'composing new work' },
  pilot: { id: 'pilot', label: 'Pilot', skill: 'exploration', sector: 'trade', wage: 6, verb: 'flying cargo routes' },
  student: { id: 'student', label: 'Student', skill: 'science', sector: 'research', wage: 0, verb: 'attending lectures' },
  retired: { id: 'retired', label: 'Retired', skill: 'art', sector: 'any', wage: 1, verb: 'enjoying retirement' },
};

export const WORKING_OCCUPATIONS: Occupation[] = [
  'farmer', 'engineer', 'scientist', 'merchant', 'artisan', 'official', 'explorer', 'medic', 'teacher', 'guard', 'miner', 'artist', 'pilot',
];

/** Which occupations a settlement specialisation demands most. */
export const SPECIALIZATION_JOBS: Record<Specialization, Occupation[]> = {
  agriculture: ['farmer', 'farmer', 'engineer', 'merchant', 'medic', 'teacher'],
  industry: ['engineer', 'artisan', 'artisan', 'miner', 'merchant', 'guard'],
  research: ['scientist', 'scientist', 'teacher', 'engineer', 'medic', 'artist'],
  trade: ['merchant', 'merchant', 'pilot', 'artisan', 'official', 'guard'],
  mining: ['miner', 'miner', 'engineer', 'guard', 'medic', 'merchant'],
  energy: ['engineer', 'engineer', 'scientist', 'miner', 'official', 'guard'],
};

export const SPECIALIZATION_OUTPUT: Record<Specialization, Partial<Record<Good, number>>> = {
  agriculture: { food: 1.6, goods: 0.1 },
  industry: { goods: 1.0, materials: 0.5 },
  research: { goods: 0.2, food: 0.2 },
  trade: { goods: 0.5, food: 0.3 },
  mining: { materials: 1.5, energy: 0.2 },
  energy: { energy: 1.6 },
};

export const CATEGORY_LABEL: Record<TechCategory, string> = {
  agriculture: 'Agriculture',
  industry: 'Industry',
  energy: 'Energy',
  society: 'Society',
  medicine: 'Medicine',
  space: 'Spaceflight',
  science: 'Science',
};

export const ARCHITECTURE_LABEL: Record<ArchitectureStyle, string> = {
  futuristic: 'Luminous high-rise',
  organic: 'Living organic',
  frontier: 'Stone & timber frontier',
};

export const TRADITIONS = [
  'Starwatch vigils on the longest night',
  'Oral genealogies recited at coming of age',
  'Communal harvest feasts',
  'Silent contemplation gardens',
  'Annual city-founding processions',
  'Debate halls open to every citizen',
  'Ritual exchange of crafted tokens',
  'Pilgrimages to ancestral ruins',
  'Lantern regattas on the rivers',
  'Apprenticeship oaths sworn before the guilds',
  'Remembrance of the Founders in song',
  'Seasonal migration festivals',
  'Geometric mural painting',
  'Public astronomical calendars carved in stone',
];

export const MOTTOS = [
  'Through knowledge, permanence.',
  'Many hands, one hearth.',
  'The sky remembers.',
  'Endure, and build.',
  'What is shared is never lost.',
  'Toward the farthest light.',
  'Order begets abundance.',
  'Root deep, reach high.',
  'In balance, freedom.',
  'Each voice a star.',
];

export const SPECIES = [
  'Velari', 'Orrin', 'Kaeth', 'Suun', 'Ithri', 'Moradi', 'Tessar', 'Ylen', 'Draxi', 'Qorrim',
];

export const INTERESTS = [
  'astronomy', 'music', 'history', 'botany', 'cartography', 'poetry', 'mechanics', 'cooking', 'philosophy', 'games of strategy',
  'sculpture', 'medicine', 'architecture', 'folklore', 'mathematics', 'sailing', 'gardening', 'theatre', 'geology', 'politics',
];
