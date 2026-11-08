/**
 * Strongly typed data model for the Genesis universe.
 *
 * The World is a plain, JSON-serialisable object graph. Entities reference
 * each other by id, so the whole state can be persisted and validated without
 * custom serialisers. Rendering and UI only ever read from it; mutation is
 * owned by the simulation systems in /sim/systems and /sim/interventions.
 */

export type Id = string;

// ───────────────────────────── Cosmos ─────────────────────────────

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface Star {
  name: string;
  spectralClass: SpectralClass;
  /** Solar radii. */
  radius: number;
  /** Solar masses. */
  mass: number;
  /** Kelvin. */
  temperature: number;
  /** Solar luminosities. */
  luminosity: number;
  /** Billions of years. */
  age: number;
  color: string;
}

export interface StarSystem {
  id: Id;
  name: string;
  star: Star;
  /** Position in the galaxy disc (light years). */
  position: [number, number, number];
  planetIds: Id[];
  discoveredAt: number;
  /** Optional note on how it was charted. */
  origin: 'genesis' | 'discovered';
}

export type PlanetType =
  | 'terran'
  | 'ocean'
  | 'desert'
  | 'arctic'
  | 'jungle'
  | 'volcanic'
  | 'barren'
  | 'gas_giant'
  | 'ice_giant';

export type Biome =
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'forest'
  | 'jungle'
  | 'desert'
  | 'tundra'
  | 'ice'
  | 'mountain'
  | 'volcanic'
  | 'wasteland';

export interface ResourceProfile {
  metals: number; // 0..1 abundance
  energy: number;
  water: number;
  organics: number;
  exotics: number;
}

export interface Moon {
  name: string;
  radius: number; // earth radii
  orbit: number; // planet radii
  color: string;
}

export interface Region {
  index: number;
  name: string;
  biome: Biome;
  /** Normalised position on the planet. */
  lat: number;
  lon: number;
  fertility: number; // 0..1
  resources: ResourceProfile;
  ownerCivId: Id | null;
  /** Ids of neighbouring region indices. */
  neighbors: number[];
  explored: boolean;
}

export interface Atmosphere {
  composition: string;
  pressure: number; // atm
  breathable: boolean;
}

export interface PlanetEnvironment {
  /** User/event adjustable offset to mean temperature (°C). */
  temperatureOffset: number;
  /** Multiplier on agricultural yield from climate events (drought etc.). */
  climateYield: number;
  /** Remaining days of an active climate disturbance. */
  disturbanceDays: number;
  disturbance: string | null;
  disturbanceEventId?: Id;
  /** Visual weather preference for Explorer. */
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'dust' | 'fog';
}

export interface Planet {
  id: Id;
  systemId: Id;
  name: string;
  type: PlanetType;
  /** Astronomical units. */
  orbit: number;
  orbitalPeriodDays: number;
  orbitPhase: number;
  radius: number; // earth radii
  gravity: number; // g
  atmosphere: Atmosphere;
  baseTemperature: number; // °C
  climate: string;
  terrain: string;
  resources: ResourceProfile;
  moons: Moon[];
  habitability: number; // 0..1
  regions: Region[];
  civIds: Id[];
  environment: PlanetEnvironment;
  palette: PlanetPalette;
  seed: number;
  axialTilt: number;
  hasRings: boolean;
}

export interface PlanetPalette {
  deep: string;
  shallow: string;
  low: string;
  mid: string;
  high: string;
  peak: string;
  atmosphere: string;
}

// ───────────────────────────── Society ─────────────────────────────

export type ArchitectureStyle = 'futuristic' | 'organic' | 'frontier';

export interface CultureValues {
  /** -1 traditional … +1 progressive */
  progress: number;
  /** -1 individualist … +1 collectivist */
  collectivism: number;
  /** -1 spiritual … +1 rational */
  rationalism: number;
  /** -1 pacifist … +1 martial */
  militarism: number;
  /** -1 insular … +1 open/outward */
  openness: number;
}

export interface Culture {
  name: string;
  values: CultureValues;
  architecture: ArchitectureStyle;
  traditions: string[];
  /** Phoneme set key used for naming. */
  language: LanguageKey;
  motto: string;
}

export type LanguageKey = 'vel' | 'kor' | 'asha' | 'tir' | 'om' | 'zen';

export type GovernmentType =
  | 'Republic'
  | 'Technocracy'
  | 'Monarchy'
  | 'Council of Elders'
  | 'Directorate'
  | 'Theocracy'
  | 'Commune';

export type PolicyId =
  | 'research_grants'
  | 'agrarian_subsidies'
  | 'industrial_drive'
  | 'open_markets'
  | 'protectionism'
  | 'public_works'
  | 'austerity'
  | 'welfare'
  | 'expansionism'
  | 'cultural_festivals'
  | 'martial_order'
  | 'exploration_charter';

export interface Government {
  type: GovernmentType;
  leaderId: Id | null;
  leaderTitle: string;
  /** Sim minute when current term or reign began. */
  termStart: number;
  /** Term length in days (0 = indefinite). */
  termLengthDays: number;
  policies: PolicyId[];
  legitimacy: number; // 0..100
}

export type Good = 'food' | 'materials' | 'energy' | 'goods';
export const GOODS: Good[] = ['food', 'materials', 'energy', 'goods'];

export interface Economy {
  treasury: number;
  stockpile: Record<Good, number>;
  production: Record<Good, number>; // last daily
  consumption: Record<Good, number>; // last daily
  prices: Record<Good, number>;
  /** Imports minus exports, per good, last day. */
  netTrade: Record<Good, number>;
  gdp: number; // daily output value
  /** 0 (equal) .. 1 (unequal). */
  inequality: number;
  employment: number; // 0..1
  taxRate: number; // 0..0.5
  tradeIncome: number;
}

export interface TechState {
  known: string[];
  researching: string | null;
  progress: number; // points toward current
  /** Research points produced last day. */
  rate: number;
  priorities: Record<TechCategory, number>;
  /** Accumulated boosts from discoveries / diffusion per tech id. */
  boosts: Record<string, number>;
}

export type TechCategory = 'agriculture' | 'industry' | 'energy' | 'society' | 'medicine' | 'space' | 'science';

export interface CivStats {
  t: number; // sim day
  population: number;
  gdp: number;
  stability: number;
  satisfaction: number;
  techs: number;
  treasury: number;
}

export interface Civilization {
  id: Id;
  name: string;
  adjective: string;
  speciesName: string;
  homeworldId: Id;
  planetIds: Id[];
  color: string;
  culture: Culture;
  government: Government;
  economy: Economy;
  tech: TechState;
  stability: number; // 0..100
  satisfaction: number; // 0..100
  settlementIds: Id[];
  foundedYear: number;
  background: string;
  pastLeaderIds: Id[];
  /** Civs this one has contacted. */
  knownCivIds: Id[];
  stats: CivStats[];
  /** Ongoing named conditions driving events (e.g. 'famine'). */
  conditions: Record<string, number>;
  /** Most recent event id for a causal key (e.g. 'famine', 'leader'), used to link causes. */
  causeLinks: Record<string, Id>;
  extinct: boolean;
}

export type SettlementKind = 'capital' | 'city' | 'town' | 'outpost' | 'colony';
export type Specialization = 'agriculture' | 'industry' | 'research' | 'trade' | 'mining' | 'energy';

export interface Settlement {
  id: Id;
  name: string;
  civId: Id;
  planetId: Id;
  regionIndex: number;
  kind: SettlementKind;
  specialization: Specialization;
  population: number;
  /** Housing capacity. */
  capacity: number;
  infrastructure: number; // 1..10
  happiness: number; // 0..100
  employment: number; // 0..1
  foundedAt: number; // sim minute
  style: ArchitectureStyle;
  layoutSeed: number;
  /** Named landmarks for Explorer and history. */
  landmarks: Landmark[];
}

export interface Landmark {
  id: Id;
  name: string;
  kind: 'monument' | 'observatory' | 'market' | 'temple' | 'spire' | 'archive' | 'garden' | 'ruin' | 'spaceport';
  description: string;
}

// ───────────────────────────── Individuals ─────────────────────────────

export type Occupation =
  | 'farmer'
  | 'engineer'
  | 'scientist'
  | 'merchant'
  | 'artisan'
  | 'official'
  | 'explorer'
  | 'medic'
  | 'teacher'
  | 'guard'
  | 'miner'
  | 'artist'
  | 'pilot'
  | 'student'
  | 'retired';

export type Skill =
  | 'science'
  | 'engineering'
  | 'commerce'
  | 'diplomacy'
  | 'craft'
  | 'agriculture'
  | 'medicine'
  | 'leadership'
  | 'exploration'
  | 'art';

export const SKILLS: Skill[] = [
  'science',
  'engineering',
  'commerce',
  'diplomacy',
  'craft',
  'agriculture',
  'medicine',
  'leadership',
  'exploration',
  'art',
];

export interface Personality {
  openness: number; // 0..1
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface Needs {
  energy: number; // 0..100 (100 = fully satisfied)
  hunger: number;
  social: number;
  purpose: number;
  fun: number;
  security: number;
}

export type GoalType =
  | 'master_skill'
  | 'change_occupation'
  | 'make_friend'
  | 'explore'
  | 'wealth'
  | 'lead'
  | 'discover'
  | 'family'
  | 'create_work';

export interface Goal {
  id: string;
  type: GoalType;
  /** Skill, occupation, region index, character id… depending on type. */
  target: string;
  progress: number; // 0..1
  createdAt: number;
  description: string;
}

export type RelationKind = 'acquaintance' | 'friend' | 'close_friend' | 'rival' | 'partner' | 'family' | 'mentor';

export interface Relationship {
  affinity: number; // -100..100
  familiarity: number; // 0..100
  kind: RelationKind;
  since: number;
  lastInteraction: number;
}

export interface Memory {
  t: number;
  text: string;
  valence: number; // -1..1
  importance: number; // 1..5
  eventId?: Id;
  withId?: Id;
}

export type ActivityType =
  | 'sleep'
  | 'eat'
  | 'work'
  | 'socialize'
  | 'study'
  | 'leisure'
  | 'travel'
  | 'explore'
  | 'create'
  | 'govern'
  | 'mourn'
  | 'idle';

export interface Activity {
  type: ActivityType;
  startedAt: number;
  endsAt: number;
  targetId?: Id; // character or settlement
  description: string;
  /** Explain the utility scores for transparency. */
  reason?: string;
}

export interface Character {
  id: Id;
  givenName: string;
  familyName: string;
  civId: Id;
  settlementId: Id;
  homeSettlementId: Id;
  birthTime: number; // sim minute (negative = before epoch)
  alive: boolean;
  deathTime?: number;
  personality: Personality;
  occupation: Occupation;
  occupationSince: number;
  skills: Record<Skill, number>; // 0..100
  needs: Needs;
  mood: number; // -100..100
  health: number; // 0..100
  wealth: number;
  goals: Goal[];
  relationships: Record<Id, Relationship>;
  memories: Memory[];
  interests: string[];
  activity: Activity;
  /** Next sim minute this agent re-evaluates. */
  nextDecisionAt: number;
  parentIds: Id[];
  childIds: Id[];
  notable: boolean;
  reputation: number; // 0..100
  /** Ids of history events directly involving this character. */
  eventIds: Id[];
  /** Sum of discovery contributions, for credit. */
  contributions: number;
  /** Home building slot & work building slot in their settlement layout. */
  homeSlot: number;
  workSlot: number;
  /** When visiting another settlement: where they came from and when they plan to return. */
  travel?: { from: Id; until: number };
  /** Ring buffer of recent day-to-day activities. */
  recent: { t: number; text: string }[];
  /** Days with persistently unmet purpose (drives career changes). */
  discontent: number;
}

// ───────────────────────────── Diplomacy ─────────────────────────────

export type RelationStatus = 'unknown' | 'neutral' | 'cordial' | 'trade' | 'alliance' | 'tense' | 'rivalry';

export interface Treaty {
  kind: 'trade' | 'alliance' | 'research' | 'non_aggression';
  since: number;
}

export interface DiplomaticRelation {
  a: Id;
  b: Id;
  opinion: number; // -100..100
  status: RelationStatus;
  treaties: Treaty[];
  tradeVolume: number;
  incidents: number;
  history: { t: number; opinion: number }[];
  contactAt: number | null;
}

// ───────────────────────────── History ─────────────────────────────

export type EventCategory =
  | 'founding'
  | 'discovery'
  | 'economy'
  | 'politics'
  | 'diplomacy'
  | 'culture'
  | 'population'
  | 'environment'
  | 'exploration'
  | 'personal'
  | 'intervention'
  | 'cosmic';

export interface StateChange {
  label: string;
  before?: string | number;
  after?: string | number;
}

export interface HistoryEvent {
  id: Id;
  t: number; // sim minute
  category: EventCategory;
  title: string;
  description: string;
  importance: 1 | 2 | 3 | 4 | 5;
  civIds: Id[];
  planetId?: Id;
  systemId?: Id;
  settlementId?: Id;
  characterIds: Id[];
  /** Human-readable explanation of the conditions that produced this event. */
  cause: string;
  /** Prior events that causally led here. */
  causeIds: Id[];
  effects: StateChange[];
  /** Later events that cite this one as a cause (filled in automatically). */
  consequenceIds: Id[];
  /** Pre-history narrative vs simulated. */
  source: 'simulation' | 'chronicle' | 'creator';
}

// ───────────────────────────── World ─────────────────────────────

export interface Galaxy {
  name: string;
  seed: number;
  arms: number;
  radius: number;
  twist: number;
  coreColor: string;
  armColor: string;
}

export interface PlayerState {
  discoveredLandmarkIds: Id[];
  visitedSettlementIds: Id[];
  conversations: number;
  followedCharacterId: Id | null;
}

export interface World {
  schemaVersion: number;
  seed: string;
  createdAtReal: number;
  savedAtReal: number;
  /** Simulation clock in minutes since the epoch. */
  time: number;
  epochYear: number;
  rngState: number;
  nextId: number;
  galaxy: Galaxy;
  systems: Record<Id, StarSystem>;
  planets: Record<Id, Planet>;
  civs: Record<Id, Civilization>;
  settlements: Record<Id, Settlement>;
  characters: Record<Id, Character>;
  relations: Record<string, DiplomaticRelation>;
  events: HistoryEvent[];
  /** Global "first discovery" ledger: tech id → { civId, t, eventId }. */
  firstDiscoveries: Record<string, { civId: Id; t: number; eventId: Id; characterId?: Id }>;
  /** User-authored technologies added through the Creator Console. */
  customTechs: TechDef[];
  player: PlayerState;
  stats: { totalBirths: number; totalDeaths: number; ticks: number };
}

export interface TechEffect {
  /** Multiplier on production of a good (additive to 1). */
  production?: Partial<Record<Good, number>>;
  research?: number;
  growth?: number; // population growth bonus
  health?: number; // mortality reduction
  stability?: number;
  capacity?: number; // housing multiplier bonus
  trade?: number;
  unlocks?: ('contact' | 'colonize' | 'interstellar')[];
}

export interface TechDef {
  id: string;
  name: string;
  category: TechCategory;
  tier: number;
  cost: number;
  prereqs: string[];
  description: string;
  effects: TechEffect;
  custom?: boolean;
}
