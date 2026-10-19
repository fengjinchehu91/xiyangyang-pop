export type LogoDot = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

export type MorphParticle = {
  from: LogoDot;
  to: LogoDot;
  arc: number;
};

export function createMorphParticles(first: LogoDot[], second: LogoDot[]): MorphParticle[] {
  if (!first.length || !second.length) return [];

  const count = Math.max(first.length, second.length);
  const particles = new Array<MorphParticle>(count * 2);

  for (let index = 0; index < count; index++) {
    const from = first[Math.floor(index * first.length / count)];
    const to = second[Math.floor(index * second.length / count)];
    const arc = Math.sin(index * 2.399963229728653) * 12;
    particles[index] = { from, to, arc };
    particles[count + index] = { from: to, to: from, arc: -arc };
  }

  return particles;
}

export function interpolateMorphDot(particle: MorphParticle, progress: number): LogoDot {
  const bounded = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  if (bounded === 0) return { ...particle.from };
  if (bounded === 1) return { ...particle.to };

  const t = bounded * bounded * (3 - 2 * bounded);
  const { from, to, arc } = particle;
  const channel = (start: number, end: number) =>
    Math.round(Math.max(0, Math.min(255, start + (end - start) * t)));

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t + arc * Math.sin(Math.PI * t),
    r: channel(from.r, to.r),
    g: channel(from.g, to.g),
    b: channel(from.b, to.b),
    a: from.a + (to.a - from.a) * t,
  };
}
