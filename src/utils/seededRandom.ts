// Seeded Pseudo-Random Number Generator and Bayesian Beta-Binomial Thompson Sampler
// Enables deterministic, reproducible, and verifiable Bayesian decisions

/**
 * 32-bit string hash (cyrb53 / FNV-1a hybrid)
 */
export function hashStringToSeed(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) >>> 0;
}

/**
 * Mulberry32 PRNG
 */
export class SeededRNG {
  private s: number;

  constructor(seed: number | string) {
    if (typeof seed === 'string') {
      this.s = hashStringToSeed(seed);
    } else {
      this.s = seed >>> 0;
    }
    if (this.s === 0) this.s = 1;
  }

  /**
   * Uniform random float in [0, 1)
   */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Standard Normal distribution sample N(0, 1) via Box-Muller transform
   */
  nextGaussian(): number {
    let u1 = this.next();
    let u2 = this.next();
    while (u1 <= 1e-15) u1 = this.next();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Gamma distribution sample using Marsaglia & Tsang method (2000)
   */
  nextGamma(alpha: number): number {
    if (alpha <= 0) return 0;

    // For alpha < 1, use transformation property: Gamma(alpha) = Gamma(alpha + 1) * U^(1/alpha)
    if (alpha < 1) {
      const u = Math.max(1e-15, this.next());
      return this.nextGamma(alpha + 1) * Math.pow(u, 1 / alpha);
    }

    const d = alpha - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let z = this.nextGaussian();
      let v = 1 + c * z;
      if (v <= 0) continue;

      v = v * v * v;
      const u = this.next();

      // Quick acceptance test
      if (u < 1 - 0.0331 * z * z * z * z) {
        return d * v;
      }

      // Squeeze test
      if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) {
        return d * v;
      }
    }
  }

  /**
   * Beta distribution sample Beta(alpha, beta) in [0, 1]
   */
  nextBeta(alpha: number, beta: number): number {
    const a = Math.max(1e-4, alpha);
    const b = Math.max(1e-4, beta);

    const x = this.nextGamma(a);
    const y = this.nextGamma(b);
    const sum = x + y;

    if (sum <= 0) {
      return a / (a + b);
    }

    const val = x / sum;
    // Bound safely
    return Math.max(0.0001, Math.min(0.9999, val));
  }
}

/**
 * Estimate selection propensity using Monte-Carlo draws
 * Computes the probability that each candidate would have been selected under Thompson sampling
 */
export function estimatePropensities(
  candidates: {
    id: string;
    alpha: number;
    beta: number;
    profit: number;
    multiplier: number;
  }[],
  seed: string,
  draws: number = 200
): Record<string, number> {
  const counts: Record<string, number> = {};
  candidates.forEach(c => (counts[c.id] = 0));

  if (candidates.length === 0) return counts;
  if (candidates.length === 1) {
    counts[candidates[0].id] = 1.0;
    return counts;
  }

  const mcRng = new SeededRNG(seed + '-propensity-mc');

  for (let d = 0; d < draws; d++) {
    let bestId = candidates[0].id;
    let maxScore = -Infinity;

    for (const c of candidates) {
      const p = mcRng.nextBeta(c.alpha, c.beta);
      const score = p * c.profit * c.multiplier;
      if (score > maxScore) {
        maxScore = score;
        bestId = c.id;
      }
    }

    counts[bestId] = (counts[bestId] || 0) + 1;
  }

  const propensities: Record<string, number> = {};
  for (const c of candidates) {
    propensities[c.id] = Math.max(0.005, counts[c.id] / draws);
  }

  return propensities;
}

/**
 * Analytical 90% Bayesian Credible Interval for Beta(alpha, beta)
 * Uses Wilson-Score / Normal approximation to Beta quantiles
 */
export function betaCredibleInterval90(alpha: number, beta: number): {
  mean: number;
  low90: number;
  high90: number;
} {
  const n = alpha + beta;
  if (n <= 0) return { mean: 0.15, low90: 0.05, high90: 0.25 };

  const mean = alpha / n;
  // Variance = (alpha * beta) / (n^2 * (n + 1))
  const variance = (alpha * beta) / (n * n * (n + 1));
  const std = Math.sqrt(Math.max(1e-6, variance));

  // Z-score for 90% two-tailed credible interval is ~1.645
  const z = 1.645;
  const low90 = Math.max(0, mean - z * std);
  const high90 = Math.min(1, mean + z * std);

  return { mean, low90, high90 };
}
