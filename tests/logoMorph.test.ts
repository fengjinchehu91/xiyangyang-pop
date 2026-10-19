import { describe, expect, it } from 'vitest';
import { createParticleSeeds, sampleParticleShape } from '../src/lib/logoMorph';

const setPixel = (
  pixels: Uint8ClampedArray, width: number, x: number, y: number,
  rgba: [number, number, number, number],
) => pixels.set(rgba, (y * width + x) * 4);

describe('logo particle sampling', () => {
  it('returns finite XYZ and normalized RGB arrays at the requested count without changing pixels', () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    setPixel(pixels, 4, 1, 1, [235, 160, 35, 255]);
    setPixel(pixels, 4, 2, 2, [20, 130, 80, 255]);
    const original = pixels.slice();
    const shape = sampleParticleShape(pixels, 4, 3, 400, 'xiyangyang');

    expect(shape.positions).toBeInstanceOf(Float32Array);
    expect(shape.colors).toBeInstanceOf(Float32Array);
    expect(shape.positions).toHaveLength(1200);
    expect(shape.colors).toHaveLength(1200);
    expect([...shape.positions].every(Number.isFinite)).toBe(true);
    expect([...shape.colors].every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    for (let index = 0; index < 400; index++) {
      expect(shape.positions[index * 3 + 2]).toBe(0);
      expect(Math.abs(shape.positions[index * 3])).toBeLessThanOrEqual(1.403);
      expect(Math.abs(shape.positions[index * 3 + 1])).toBeLessThanOrEqual(1.403);
    }
    expect(pixels).toEqual(original);
  });

  it('includes alpha 64 but excludes transparent and lower-alpha pixels from colors and bounds', () => {
    const pixels = new Uint8ClampedArray(3 * 4);
    setPixel(pixels, 3, 0, 0, [0, 0, 255, 63]);
    setPixel(pixels, 3, 1, 0, [255, 0, 0, 64]);
    setPixel(pixels, 3, 2, 0, [0, 255, 0, 0]);
    const shape = sampleParticleShape(pixels, 3, 1, 50, 'pop');

    for (let index = 0; index < 50; index++) {
      expect(shape.colors[index * 3]).toBeGreaterThan(0.9);
      expect(shape.colors[index * 3 + 1]).toBeLessThan(0.1);
      expect(shape.colors[index * 3 + 2]).toBeLessThan(0.1);
      const radius = Math.hypot(shape.positions[index * 3], shape.positions[index * 3 + 1]);
      expect(radius).toBeLessThanOrEqual(0.35 * 1.65 + 0.000001);
    }
  });

  it('centers visible bounds and preserves a wide logo aspect ratio', () => {
    const width = 140, height = 90;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 20; y < 70; y++) {
      for (let x = 20; x < 120; x++) setPixel(pixels, width, x, y, [30, 130, 80, 255]);
    }
    const { positions } = sampleParticleShape(pixels, width, height, 9000, 'pop');
    const xs = [...positions].filter((_, index) => index % 3 === 0);
    const ys = [...positions].filter((_, index) => index % 3 === 1);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    expect(maxX - minX).toBeCloseTo(1.65, 1);
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(2, 1);
    expect((minX + maxX) / 2).toBeCloseTo(0, 2);
    expect((minY + maxY) / 2).toBeCloseTo(0, 2);
  });

  it('points the image Y axis upward independently of transparent padding', () => {
    const pixels = new Uint8ClampedArray(5 * 7 * 4);
    setPixel(pixels, 5, 2, 1, [255, 0, 0, 255]);
    setPixel(pixels, 5, 2, 5, [0, 0, 255, 255]);
    const { positions, colors } = sampleParticleShape(pixels, 5, 7, 100, 'pop');

    for (let index = 0; index < 100; index++) {
      if (colors[index * 3] > colors[index * 3 + 2]) {
        expect(positions[index * 3 + 1]).toBeGreaterThan(0.65);
      } else {
        expect(positions[index * 3 + 1]).toBeLessThan(-0.65);
      }
      expect(Math.abs(positions[index * 3])).toBeLessThan(0.15);
    }
  });

  it('uses deterministic randomized samples and subpixel positions', () => {
    const pixels = new Uint8ClampedArray([100, 180, 80, 255]);
    const first = sampleParticleShape(pixels, 1, 1, 50, 'xiyangyang');
    expect(sampleParticleShape(pixels, 1, 1, 50, 'xiyangyang')).toEqual(first);
    expect(new Set(first.positions.filter((_, index) => index % 3 === 0)).size).toBeGreaterThan(40);
  });

  it('maps XIYANGYANG white wool to soft gray-green while retaining POP light symbols', () => {
    const white = new Uint8ClampedArray([255, 250, 240, 255]);
    const wool = sampleParticleShape(white, 1, 1, 1, 'xiyangyang').colors;
    const pop = sampleParticleShape(white, 1, 1, 1, 'pop').colors;
    expect(wool[1]).toBeGreaterThan(wool[0]);
    expect(wool[1]).toBeGreaterThan(wool[2]);
    expect([...wool].every(value => value > 0.5 && value < 0.8)).toBe(true);
    expect(pop[0]).toBe(1);
    expect(pop[1]).toBeCloseTo(250 / 255, 6);
    expect(pop[2]).toBeCloseTo(240 / 255, 6);
  });

  it('preserves nonwhite source colors with only a small green tint', () => {
    const pixels = new Uint8ClampedArray([240, 175, 30, 255]);
    const { colors } = sampleParticleShape(pixels, 1, 1, 1, 'xiyangyang');
    [240, 175, 30].forEach((channel, index) => {
      expect(Math.abs(colors[index] - channel / 255)).toBeLessThan(0.06);
    });
    expect(colors[0]).toBeGreaterThan(colors[1]);
    expect(colors[1]).toBeGreaterThan(colors[2]);
  });

  it('rejects images without visible pixels so the renderer can fall back', () => {
    expect(() => sampleParticleShape(new Uint8ClampedArray(16), 2, 2, 10, 'pop'))
      .toThrow('No visible logo pixels');
    expect(() => sampleParticleShape(new Uint8ClampedArray([255, 255, 255, 63]), 1, 1, 10, 'pop'))
      .toThrow('No visible logo pixels');
  });

  it('validates dimensions and count and supports a zero particle count', () => {
    const pixel = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(() => sampleParticleShape(pixel, 0, 1, 1, 'pop')).toThrow(RangeError);
    expect(() => sampleParticleShape(pixel, 1.5, 1, 1, 'pop')).toThrow(RangeError);
    expect(() => sampleParticleShape(pixel, 2, 1, 1, 'pop')).toThrow(RangeError);
    expect(() => sampleParticleShape(pixel, 1, 1, -1, 'pop')).toThrow(RangeError);
    expect(() => sampleParticleShape(pixel, 1, 1, NaN, 'pop')).toThrow(RangeError);
    const empty = sampleParticleShape(pixel, 1, 1, 0, 'pop');
    expect(empty.positions).toHaveLength(0);
    expect(empty.colors).toHaveLength(0);
  });
});

describe('particle seed generation', () => {
  it('returns deterministic finite triples in the unit interval', () => {
    const seeds = createParticleSeeds(100);
    expect(seeds).toBeInstanceOf(Float32Array);
    expect(seeds).toHaveLength(300);
    expect([...seeds].every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(createParticleSeeds(100)).toEqual(seeds);
    expect(new Set(seeds).size).toBe(300);
  });

  it('supports zero and rejects invalid counts', () => {
    expect(createParticleSeeds(0)).toHaveLength(0);
    expect(() => createParticleSeeds(-1)).toThrow(RangeError);
    expect(() => createParticleSeeds(1.5)).toThrow(RangeError);
    expect(() => createParticleSeeds(Infinity)).toThrow(RangeError);
  });
});
