import { causality } from '../src/sim/world';

// Every test runs with the causality guard on: an important event without a
// cause (and not explicitly marked as a root) throws.
causality.strict = true;
