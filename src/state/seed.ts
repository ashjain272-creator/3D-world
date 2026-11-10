/**
 * A fresh, human-readable seed for a new universe. This is the only place
 * that uses non-deterministic randomness; everything in /sim derives from
 * the seed it is given.
 */
export function randomSeed(): string {
  const words = ['aurora', 'ember', 'tide', 'quartz', 'lumen', 'cinder', 'halo', 'nova', 'drift', 'vesper', 'onyx', 'solace', 'zephyr', 'atlas', 'echo'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 90000 + 10000)}`;
}
