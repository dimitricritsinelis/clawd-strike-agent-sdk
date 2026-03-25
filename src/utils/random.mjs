export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createSeededRng(seed = Date.now()) {
  let state = Number(seed) || 1;

  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function choose(rng, values) {
  return values[Math.floor(rng() * values.length)];
}
