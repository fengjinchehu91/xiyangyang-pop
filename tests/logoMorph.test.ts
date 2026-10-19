import { describe, expect, it } from 'vitest';
import { createMorphParticles, interpolateMorphDot } from '../src/lib/logoMorph';
import type { LogoDot, MorphParticle } from '../src/lib/logoMorph';

const dot = (x: number, y = 0): LogoDot => ({ x, y, r: 20, g: 120, b: 220, a: 1 });

describe('logo morph particle mapping', () => {
  it('returns no particles when either logo has no samples', () => {
    expect(createMorphParticles([], [])).toEqual([]);
    expect(createMorphParticles([dot(0)], [])).toEqual([]);
    expect(createMorphParticles([], [dot(0)])).toEqual([]);
  });

  it('uniformly maps unequal sample counts into two equal directional groups', () => {
    const first = [dot(0), dot(10)];
    const second = [dot(100), dot(110), dot(120), dot(130), dot(140)];
    const particles = createMorphParticles(first, second);

    expect(particles).toHaveLength(10);
    expect(particles.slice(0, 5).map(particle => particle.from.x)).toEqual([0, 0, 0, 10, 10]);
    expect(particles.slice(0, 5).map(particle => particle.to.x)).toEqual([100, 110, 120, 130, 140]);
    particles.slice(0, 5).forEach((particle, index) => {
      const returning = particles[index + 5];
      expect(returning.from).toEqual(particle.to);
      expect(returning.to).toEqual(particle.from);
      expect(returning.arc).toBe(-particle.arc);
      expect(Math.abs(particle.arc)).toBeLessThanOrEqual(12);
    });
  });

  it('handles one-dot logos and preserves the input arrays and dots', () => {
    const first = [dot(5, 10)];
    const second = [dot(15, 20)];
    const originals = structuredClone([first, second]);
    first.forEach(Object.freeze);
    second.forEach(Object.freeze);
    Object.freeze(first);
    Object.freeze(second);

    expect(createMorphParticles(first, second)).toHaveLength(2);
    expect([first, second]).toEqual(originals);
  });

  it('is deterministic without randomness', () => {
    const first = Array.from({ length: 23 }, (_, index) => dot(index, index * 2));
    const second = Array.from({ length: 31 }, (_, index) => dot(index * 3, 100 - index));
    expect(createMorphParticles(first, second)).toEqual(createMorphParticles(first, second));
  });
});

describe('logo morph interpolation', () => {
  const particle: MorphParticle = {
    from: { x: 0, y: 20, r: 10, g: 240, b: 0, a: 0.2 },
    to: { x: 100, y: 120, r: 241, g: 10, b: 255, a: 0.8 },
    arc: 12,
  };

  it('returns exact endpoints as new dots in both directions', () => {
    for (const current of [particle, { from: particle.to, to: particle.from, arc: -12 }]) {
      expect(interpolateMorphDot(current, 0)).toEqual(current.from);
      expect(interpolateMorphDot(current, 1)).toEqual(current.to);
      expect(interpolateMorphDot(current, 0)).not.toBe(current.from);
      expect(interpolateMorphDot(current, 1)).not.toBe(current.to);
    }
  });

  it('applies smoothstep, the vertical arc, and rounded color interpolation', () => {
    const quarter = interpolateMorphDot({ ...particle, arc: 0 }, 0.25);
    expect(quarter.x).toBe(15.625);
    expect(quarter.y).toBe(35.625);

    const halfway = interpolateMorphDot(particle, 0.5);
    expect(halfway).toEqual({ x: 50, y: 82, r: 126, g: 125, b: 128, a: 0.5 });
  });

  it('clamps out-of-range progress and treats NaN as the starting point', () => {
    for (const progress of [-10, -Infinity, NaN]) {
      expect(interpolateMorphDot(particle, progress)).toEqual(particle.from);
    }
    for (const progress of [10, Infinity]) {
      expect(interpolateMorphDot(particle, progress)).toEqual(particle.to);
    }
  });

  it('keeps results finite, color channels integral and bounded, and inputs unchanged', () => {
    const original = structuredClone(particle);
    for (let index = 0; index <= 100; index++) {
      const result = interpolateMorphDot(particle, index / 100);
      expect(Object.values(result).every(Number.isFinite)).toBe(true);
      for (const color of [result.r, result.g, result.b]) {
        expect(Number.isInteger(color)).toBe(true);
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(255);
      }
      expect(result.a).toBeGreaterThanOrEqual(0.2);
      expect(result.a).toBeLessThanOrEqual(0.8);
    }
    expect(particle).toEqual(original);
  });

  it('clamps interpolated RGB channels to the canvas color range', () => {
    const result = interpolateMorphDot({
      from: { ...dot(0), r: -300, g: 500, b: 20.2 },
      to: { ...dot(100), r: -100, g: 700, b: 21.2 },
      arc: 0,
    }, 0.5);
    expect([result.r, result.g, result.b]).toEqual([0, 255, 21]);
  });
});
