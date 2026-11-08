import type { LanguageKey } from '../types';
import type { Rng } from '../rng';

/**
 * Syllable-based name generation. Each civilisation speaks a "language" — a
 * phoneme inventory — so its people, cities and leaders share a recognisable
 * sound, while different cultures sound distinct.
 */
interface Language {
  onsets: string[];
  vowels: string[];
  codas: string[];
  endings: string[];
  placeSuffixes: string[];
}

const LANGUAGES: Record<LanguageKey, Language> = {
  vel: {
    onsets: ['v', 'l', 's', 'th', 'r', 'n', 'el', 'c', 'ph', 'm', 'a', 'is'],
    vowels: ['a', 'e', 'i', 'ae', 'ia', 'o', 'ei'],
    codas: ['', '', 'n', 'l', 'r', 's', 'th'],
    endings: ['a', 'iel', 'ora', 'ine', 'is', 'en', 'ael', 'yn'],
    placeSuffixes: ['ara', 'enor', 'ithil', 'eon', 'aris', 'elle'],
  },
  kor: {
    onsets: ['k', 'g', 'dr', 'br', 'th', 'kr', 'v', 'z', 'h', 'tor', 'b', 'gr'],
    vowels: ['a', 'o', 'u', 'ar', 'or', 'e'],
    codas: ['', 'k', 'g', 'rn', 'th', 'd', 'x', 'r'],
    endings: ['ak', 'or', 'un', 'ath', 'ok', 'gar', 'rik', 'os'],
    placeSuffixes: ['hold', 'gard', 'mar', 'dun', 'rak', 'heim'],
  },
  asha: {
    onsets: ['sh', 'a', 'm', 'n', 'y', 'h', 'k', 'r', 'z', 'sa', 'ta', 'l'],
    vowels: ['a', 'aa', 'i', 'u', 'e', 'ai', 'ou'],
    codas: ['', '', 'n', 'm', 'r', 'h'],
    endings: ['a', 'ani', 'esh', 'ira', 'un', 'ai', 'oum', 'eya'],
    placeSuffixes: ['abad', 'ira', 'esh', 'oun', 'ahar', 'ime'],
  },
  tir: {
    onsets: ['t', 'qu', 'p', 'x', 'c', 'tl', 'y', 'ch', 'ts', 'm', 'ix', 'k'],
    vowels: ['i', 'a', 'o', 'e', 'ua', 'io'],
    codas: ['', 'l', 'n', 'x', 'c', 'tl'],
    endings: ['ec', 'tli', 'an', 'ixa', 'ol', 'atl', 'ico', 'uin'],
    placeSuffixes: ['tlan', 'pec', 'oya', 'calli', 'tzin', 'opan'],
  },
  om: {
    onsets: ['o', 'b', 'd', 'w', 'f', 'm', 'n', 'ol', 'um', 'g', 'l', 'p'],
    vowels: ['o', 'u', 'a', 'oo', 'e', 'ou'],
    codas: ['', 'm', 'n', 'l', 'b', 'w'],
    endings: ['o', 'um', 'ele', 'owa', 'un', 'abe', 'ondo', 'imi'],
    placeSuffixes: ['wena', 'olo', 'umba', 'ende', 'ogo', 'ami'],
  },
  zen: {
    onsets: ['z', 'j', 'k', 's', 'h', 'r', 'ts', 'n', 'y', 'm', 'ky', 'sh'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ei', 'ou'],
    codas: ['', '', '', 'n'],
    endings: ['ra', 'ko', 'mi', 'to', 'ren', 'shi', 'ka', 'no'],
    placeSuffixes: ['zan', 'mura', 'kyo', 'hara', 'shima', 'dai'],
  },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as LanguageKey[];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function syllable(rng: Rng, lang: Language): string {
  return rng.pick(lang.onsets) + rng.pick(lang.vowels) + rng.pick(lang.codas);
}

function cleanup(s: string): string {
  // collapse triple letters and awkward doubled vowels
  return s.replace(/(.)\1\1+/g, '$1$1').replace(/([aeiou])\1([aeiou])/g, '$1$2');
}

export function personName(rng: Rng, key: LanguageKey): string {
  const lang = LANGUAGES[key];
  const n = rng.int(1, 2);
  let s = '';
  for (let i = 0; i < n; i++) s += syllable(rng, lang);
  s += rng.pick(lang.endings);
  s = cleanup(s);
  if (s.length > 10) s = s.slice(0, 8) + rng.pick(lang.endings).slice(-1);
  return cap(s);
}

export function familyName(rng: Rng, key: LanguageKey): string {
  const lang = LANGUAGES[key];
  let s = syllable(rng, lang) + syllable(rng, lang);
  if (rng.chance(0.5)) s += rng.pick(lang.codas);
  s = cleanup(s);
  return cap(s.slice(0, 10));
}

export function placeName(rng: Rng, key: LanguageKey): string {
  const lang = LANGUAGES[key];
  let s = syllable(rng, lang);
  if (rng.chance(0.4)) s += syllable(rng, lang);
  s += rng.pick(lang.placeSuffixes);
  return cap(cleanup(s));
}

export function civName(rng: Rng, key: LanguageKey): { name: string; adjective: string; root: string } {
  const lang = LANGUAGES[key];
  const root = cap(cleanup(syllable(rng, lang) + syllable(rng, lang)));
  const forms = [
    { name: `${root} Concord`, adjective: `${root}i` },
    { name: `Dominion of ${root}`, adjective: `${root}an` },
    { name: `${root} Union`, adjective: `${root}ese` },
    { name: `Free Cities of ${root}`, adjective: `${root}an` },
    { name: `${root} Ascendancy`, adjective: `${root}ic` },
    { name: `Commonwealth of ${root}`, adjective: `${root}ian` },
    { name: `${root} Covenant`, adjective: `${root}ite` },
  ];
  const f = rng.pick(forms);
  return { ...f, root };
}

const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Omega'];
const STAR_ROOTS = [
  'Aster', 'Vega', 'Caelum', 'Lyra', 'Orin', 'Halcy', 'Seren', 'Thal', 'Myra', 'Kepler', 'Solen', 'Tauri', 'Nadir', 'Eos',
  'Ilia', 'Corva', 'Pyx', 'Varan', 'Ondra', 'Zephy', 'Calyx', 'Helio', 'Nyx', 'Auren', 'Sirra', 'Belen', 'Rho', 'Draco',
];
const STAR_SUFFIX = ['is', 'a', 'on', 'ae', 'ion', 'ar', 'us', 'ix', 'ea', 'or'];

export function starName(rng: Rng): string {
  const root = rng.pick(STAR_ROOTS);
  const base = root + (rng.chance(0.55) ? rng.pick(STAR_SUFFIX) : '');
  return rng.chance(0.3) ? `${base} ${rng.pick(GREEK)}` : base;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export function planetName(rng: Rng, star: string, index: number, inhabited: boolean): string {
  if (!inhabited && rng.chance(0.55)) return `${star.split(' ')[0]} ${ROMAN[index] ?? index + 1}`;
  const roots = ['Ter', 'Ny', 'Cal', 'Ves', 'Or', 'Ae', 'Mor', 'Thal', 'Sel', 'Ka', 'Ish', 'Bel', 'Hy', 'Ul', 'Dra', 'Pel', 'Kyr', 'Ost'];
  const mids = ['a', 'e', 'i', 'o', 'ar', 'en', 'or', 'il'];
  const ends = ['ra', 'is', 'on', 'ia', 'us', 'eth', 'ara', 'ova', 'ix', 'enne', 'ys'];
  return rng.pick(roots) + rng.pick(mids) + rng.pick(ends);
}

export function moonName(rng: Rng): string {
  const a = ['Phi', 'Lum', 'Cor', 'Mir', 'Tes', 'Ar', 'Neb', 'Sol', 'Ky', 'Ose'];
  const b = ['os', 'ena', 'ix', 'ae', 'is', 'an', 'el', 'ora'];
  return rng.pick(a) + rng.pick(b);
}

export function galaxyName(rng: Rng): string {
  const a = ['The Veil of', 'The Spiral of', 'The Reach of', 'The Lantern of', 'The Expanse of'];
  const b = ['Auriga', 'Senna', 'Kaelith', 'Oraven', 'Tessaly', 'Ombrae', 'Valis', 'Heliandor', 'Myrrhine', 'Cassiar'];
  return `${rng.pick(a)} ${rng.pick(b)}`;
}
