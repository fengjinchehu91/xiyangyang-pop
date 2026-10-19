import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, OrthographicCamera,
  Points, Scene, ShaderMaterial, Vector2, WebGLRenderer,
} from 'three';
import { createParticleSeeds, sampleParticleShape, type ParticleBrand, type ParticleShape } from './logoMorph';

const PARTICLE_COUNT = 19_000;
const HOLD_MS = 3_000;
const MORPH_MS = 1_800;

const vertexShader = `
  attribute vec3 aTo;
  attribute vec3 aColorFrom;
  attribute vec3 aColorTo;
  attribute vec3 aSeed;
  uniform float uMix;
  uniform float uTime;
  uniform float uDpr;
  uniform float uSize;
  uniform float uMotion;
  uniform vec2 uPointer;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float t = uMix * uMix * (3.0 - 2.0 * uMix);
    float wave = sin(t * 3.14159265);
    float phase = aSeed.x * 6.2831853 + t * 4.0;
    vec3 p = mix(position, aTo, t);
    p.xy += vec2(cos(phase), sin(phase)) * (0.12 + aSeed.y * 0.34) * wave;
    p.z += sin(phase * 1.3) * wave * 0.28;
    p.xy += vec2(sin(uTime * 0.7 + aSeed.x * 20.0),
                 cos(uTime * 0.55 + aSeed.z * 18.0)) * 0.0035 * uMotion;
    vec2 delta = p.xy - uPointer;
    float distance = length(delta);
    p.xy += delta / max(distance, 0.001) * pow(max(0.0, 1.0 - distance / 0.32), 2.0) * 0.12 * uMotion;
    p.xy *= 1.0 + p.z * 0.14;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.xy, 0.0, 1.0);
    gl_PointSize = uSize * uDpr * (0.8 + aSeed.y * 0.4) * (1.0 + wave * 0.3);
    vColor = mix(aColorFrom, aColorTo, t);
    vAlpha = 0.78 + wave * 0.15;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float radius = length(gl_PointCoord - 0.5);
    if (radius > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.24, 0.5, radius)) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

async function loadShape(source: string, brand: ParticleBrand): Promise<ParticleShape> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load ecosystem logo'));
    image.src = source;
  });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 384;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error('Logo sampling unavailable');
  const scale = Math.min(384 / image.naturalWidth, 384 / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (384 - width) / 2, (384 - height) / 2, width, height);
  return sampleParticleShape(context.getImageData(0, 0, 384, 384).data, 384, 384, PARTICLE_COUNT, brand);
}

export class EcosystemParticles {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 10);
  private readonly geometry = new BufferGeometry();
  private readonly from = new BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3).setUsage(DynamicDrawUsage);
  private readonly to = new BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3).setUsage(DynamicDrawUsage);
  private readonly colorFrom = new BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3).setUsage(DynamicDrawUsage);
  private readonly colorTo = new BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3).setUsage(DynamicDrawUsage);
  private readonly uniforms = {
    uMix: { value: 0 }, uTime: { value: 0 }, uDpr: { value: 1 },
    uSize: { value: 2.05 }, uMotion: { value: 1 }, uPointer: { value: new Vector2(9, 9) },
  };
  private readonly material = new ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  private resizeObserver?: ResizeObserver;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private clock = 0;
  private index = 0;
  private next = 0;
  private queued: number | null = null;
  private transitioning = false;
  private paused = false;
  private reduced = false;
  private visible = false;
  private failed = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly targets: ParticleShape[],
    private readonly onChange: (index: number) => void,
    private readonly onError: () => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    try {
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = () => this.fail();
      this.geometry.setAttribute('position', this.from);
      this.geometry.setAttribute('aTo', this.to);
      this.geometry.setAttribute('aColorFrom', this.colorFrom);
      this.geometry.setAttribute('aColorTo', this.colorTo);
      this.geometry.setAttribute('aSeed', new BufferAttribute(createParticleSeeds(PARTICLE_COUNT), 3));
      const points = new Points(this.geometry, this.material);
      points.frustumCulled = false;
      this.scene.add(points);
      this.camera.position.z = 5;
      this.bindTargets(0, 0);
      this.resize();
      if (this.failed) throw new Error('Ecosystem shader initialization failed');
      canvas.addEventListener('pointermove', this.onPointer);
      canvas.addEventListener('pointerleave', this.onPointerLeave);
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(canvas);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  private bindTargets(from: number, to: number) {
    this.from.copyArray(this.targets[from].positions);
    this.to.copyArray(this.targets[to].positions);
    this.colorFrom.copyArray(this.targets[from].colors);
    this.colorTo.copyArray(this.targets[to].colors);
    this.from.needsUpdate = this.to.needsUpdate = true;
    this.colorFrom.needsUpdate = this.colorTo.needsUpdate = true;
  }

  private canAnimate() {
    return !this.disposed && !this.failed && this.visible && !document.hidden && !this.paused && !this.reduced;
  }

  private syncPlayback() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
    if (this.canAnimate()) this.frame = requestAnimationFrame(this.tick);
  }

  private startTransition(index: number) {
    this.next = index;
    this.transitioning = true;
    this.elapsed = 0;
    this.bindTargets(this.index, index);
    this.onChange(index);
  }

  private showStatic(index: number) {
    this.index = this.next = index;
    this.transitioning = false;
    this.elapsed = 0;
    this.queued = null;
    this.bindTargets(index, index);
    this.onChange(index);
    this.draw();
  }

  select(index: number) {
    if (this.disposed || this.failed || !Number.isInteger(index)) return;
    const target = ((index % this.targets.length) + this.targets.length) % this.targets.length;
    if (this.paused || this.reduced || !this.visible) {
      this.showStatic(target);
    } else if (this.transitioning) {
      this.queued = target;
    } else if (target !== this.index) {
      this.startTransition(target);
    }
    this.syncPlayback();
  }

  setPaused(value: boolean) {
    if (this.disposed || this.paused === value) return;
    this.paused = value;
    this.syncPlayback();
  }

  setReduced(value: boolean) {
    if (this.disposed || this.reduced === value) return;
    this.reduced = value;
    this.uniforms.uMotion.value = value ? 0 : 1;
    if (value) this.showStatic(this.transitioning ? this.next : this.index);
    this.syncPlayback();
  }

  setVisible(value: boolean) {
    if (this.disposed || this.visible === value) return;
    this.visible = value;
    this.syncPlayback();
  }

  private tick = (now: number) => {
    this.frame = 0;
    if (!this.canAnimate()) { this.last = 0; return; }
    const delta = this.last ? Math.min(now - this.last, 50) : 0;
    this.last = now;
    this.elapsed += delta;
    this.clock += delta / 1000;
    this.uniforms.uMotion.value = 1;
    if (this.transitioning && this.elapsed >= MORPH_MS) {
      this.index = this.next;
      this.transitioning = false;
      this.elapsed = 0;
      this.bindTargets(this.index, this.index);
      const queued = this.queued;
      this.queued = null;
      if (queued !== null && queued !== this.index) this.startTransition(queued);
    } else if (!this.transitioning && this.elapsed >= HOLD_MS) {
      this.startTransition((this.index + 1) % this.targets.length);
    }
    this.draw();
    if (this.canAnimate()) this.frame = requestAnimationFrame(this.tick);
  };

  private draw() {
    if (this.disposed || this.failed) return;
    this.uniforms.uMix.value = this.transitioning ? Math.min(1, this.elapsed / MORPH_MS) : 0;
    this.uniforms.uTime.value = this.clock;
    try { this.renderer.render(this.scene, this.camera); }
    catch { this.fail(); }
  }

  private resize = () => {
    if (this.disposed || this.failed) return;
    const box = this.canvas.getBoundingClientRect();
    const width = Math.max(1, box.width), height = Math.max(1, box.height);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const dpr = mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.7);
    this.camera.left = -1.35 * width / height;
    this.camera.right = 1.35 * width / height;
    this.camera.updateProjectionMatrix();
    this.geometry.setDrawRange(0, mobile ? 9_000 : PARTICLE_COUNT);
    this.uniforms.uDpr.value = dpr;
    this.uniforms.uSize.value = mobile ? 1.65 : 2.05;
    try {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      this.draw();
    } catch { this.fail(); }
  };

  private onPointer = (event: PointerEvent) => {
    if (this.disposed || this.paused || this.reduced || event.pointerType === 'touch') return;
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.uniforms.uPointer.value.set(
      ((event.clientX - box.left) / box.width * 2 - 1) * this.camera.right,
      (1 - (event.clientY - box.top) / box.height * 2) * this.camera.top,
    );
  };

  private onPointerLeave = () => { this.uniforms.uPointer.value.set(9, 9); };
  private onVisibility = () => { this.syncPlayback(); };
  private onContextLost = (event: Event) => { event.preventDefault(); this.fail(); };

  private fail() {
    if (this.failed || this.disposed) return;
    this.failed = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.onError();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

export async function createEcosystemParticles(
  canvas: HTMLCanvasElement,
  sources: [string, string],
  onChange: (index: number) => void,
  onError: () => void,
): Promise<EcosystemParticles> {
  let reported = false;
  const reportError = () => { if (!reported) { reported = true; onError(); } };
  try {
    const targets = await Promise.all([loadShape(sources[0], 'xiyangyang'), loadShape(sources[1], 'pop')]);
    return new EcosystemParticles(canvas, targets, onChange, reportError);
  } catch (error) {
    reportError();
    throw error;
  }
}
