export type ParticleShape = {
  positions: Float32Array;
  colors: Float32Array;
};

export type ParticleBrand = 'xiyangyang' | 'pop';

function validateCount(count: number) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Invalid particle count');
}

function seededRandom() {
  let state = 1234567;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createParticleSeeds(count: number): Float32Array {
  validateCount(count);
  const random = seededRandom();
  return Float32Array.from({ length: count * 3 }, () => random());
}

export function sampleParticleShape(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  count: number,
  brand: ParticleBrand,
): ParticleShape {
  validateCount(count);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      pixels.length !== width * height * 4) {
    throw new RangeError('Invalid logo pixel dimensions');
  }

  const visible: number[] = [];
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] < 64) continue;
      visible.push(offset);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!visible.length) throw new Error('No visible logo pixels');

  const span = Math.max(maxX - minX, maxY - minY, 1);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = seededRandom();
  const deepGreen = [7, 62, 50];
  const woolGreen = [74, 106, 90];

  for (let index = 0; index < count; index++) {
    const offset = visible[Math.floor(random() * visible.length)];
    const pixelIndex = offset / 4;
    const x = pixelIndex % width, y = Math.floor(pixelIndex / width);
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 0.35;
    const target = index * 3;
    positions[target] = (x - centerX + Math.cos(angle) * radius) / span * 1.65;
    positions[target + 1] = -(y - centerY + Math.sin(angle) * radius) / span * 1.65;

    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const white = Math.min(r, g, b) >= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 35;
    const tint = white && brand === 'xiyangyang' ? woolGreen : deepGreen;
    const mix = white ? (brand === 'xiyangyang' ? 0.48 : 0) : 0.06;
    for (let channel = 0; channel < 3; channel++) {
      colors[target + channel] = (pixels[offset + channel] * (1 - mix) + tint[channel] * mix) / 255;
    }
  }

  return { positions, colors };
}
