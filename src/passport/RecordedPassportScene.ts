import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  FrontSide,
  Group,
  Mesh,
  ShaderMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  ShapeGeometry,
  ShaderChunk,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RectAreaLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { edgeRevealPose } from './passportMotion';
import { createPassportStudio } from './createPassportStudio';
import { createBrushedMetalTextures } from './createBrushedMetalTextures';
import {
  paintBrushedColor,
  paintBrushedGoldMicroSurface,
} from './brushedGold';

const CARD_WIDTH = 2.72;
const CARD_HEIGHT = 3.82;
const CARD_RADIUS = 0.14;
const DEFAULT_PORTRAIT_URL = '/build-sprint/portrait.png';
const WORDMARK_URL = '/build-sprint/build-sprint-wordmark.svg';
const GROWTHX_URL = '/build-sprint/growthx-logo.svg';
const ENGRAVED_INK = '#5d3912';
const MACHINED_HIGHLIGHT = '#f6e8bd';
// Face maps are painted in 1200 × 1685 artboard units at 2× so cut edges stay
// crisp once the slab fills a 1080p frame.
const FACE_SCALE = 2;
/** Blur radius, in face texels, that shapes each cut's sloped walls. */
const WALL_BLUR_TEXELS = 3;
/** Plate gold (sRGB) that shows on the walls of each cut. */
const WALL_GOLD = [198, 138, 50];

type Disposable = { dispose(): void };

function roundedRectangle(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  shape.closePath();
  return shape;
}

function createPlateGeometry(width: number, height: number, radius: number, depth: number) {
  const geometry = new ExtrudeGeometry(roundedRectangle(width, height, radius), {
    depth,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: Math.min(radius * 0.36, 0.055),
    bevelThickness: Math.min(depth * 0.24, 0.045),
    curveSegments: 20,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function createGlassSlabGeometry() {
  const geometry = new ExtrudeGeometry(roundedRectangle(3.18, 4.28, 0.22), {
    depth: 0.4,
    bevelEnabled: true,
    bevelSegments: 6,
    bevelSize: 0.045,
    bevelThickness: 0.04,
    curveSegments: 24,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function createGlassSheenMaterial() {
  return new ShaderMaterial({
    uniforms: { sweep: { value: 0.72 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float sweep;
      void main() {
        float core = exp(-pow((vUv.x - sweep) * 7.0, 2.0));
        float shoulder = exp(-pow((vUv.x - sweep + 0.08) * 3.3, 2.0));
        float verticalFade = smoothstep(0.02, 0.18, vUv.y) * smoothstep(0.98, 0.82, vUv.y);
        float alpha = (core * 0.23 + shoulder * 0.075) * verticalFade;
        gl_FragColor = vec4(vec3(1.0, 0.985, 0.94), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

function createFaceGeometry(width: number, height: number, radius: number) {
  const geometry = new ShapeGeometry(roundedRectangle(width, height, radius), 24);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + width / 2) / width,
      (position.getY(index) + height / 2) / height,
    );
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv2', uv.clone());
  return geometry;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(
    image,
    (image.naturalWidth - sourceWidth) / 2,
    (image.naturalHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function portraitShieldPath() {
  const path = new Path2D();
  path.moveTo(600, 405);
  path.quadraticCurveTo(548, 449, 486, 454);
  path.quadraticCurveTo(414, 458, 410, 521);
  path.lineTo(410, 573);
  path.lineTo(374, 573);
  path.lineTo(374, 792);
  path.lineTo(410, 792);
  path.lineTo(410, 842);
  path.quadraticCurveTo(410, 916, 492, 949);
  path.lineTo(600, 991);
  path.lineTo(708, 949);
  path.quadraticCurveTo(790, 916, 790, 842);
  path.lineTo(790, 792);
  path.lineTo(826, 792);
  path.lineTo(826, 573);
  path.lineTo(790, 573);
  path.lineTo(790, 521);
  path.quadraticCurveTo(786, 458, 714, 454);
  path.quadraticCurveTo(652, 449, 600, 405);
  path.closePath();
  return path;
}

function roundedCanvasPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawEngravedText(
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  font: string,
  color = ENGRAVED_INK,
) {
  context.save();
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(255, 223, 139, .58)';
  context.shadowBlur = 0;
  context.shadowOffsetX = -2;
  context.shadowOffsetY = -2;
  context.fillStyle = color;
  context.fillText(label, x, y);
  context.shadowColor = 'rgba(58, 23, 0, .62)';
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 2;
  context.globalAlpha = 0.42;
  context.fillText(label, x, y);
  context.restore();
}

function drawTintedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  tint: string,
) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(width * FACE_SCALE));
  layer.height = Math.max(1, Math.round(height * FACE_SCALE));
  const layerContext = layer.getContext('2d')!;
  layerContext.drawImage(image, 0, 0, layer.width, layer.height);
  layerContext.globalCompositeOperation = 'source-in';
  layerContext.fillStyle = tint;
  layerContext.fillRect(0, 0, layer.width, layer.height);
  context.drawImage(layer, x, y, width, height);
}

/**
 * Builds the face's surface maps: the plate's hand brushing plus every
 * engraved mark (lettering, rules, portrait rim, logos) cut as a V-groove.
 *
 * Brushing and cuts share one tangent-space normal map and one roughness map
 * on a single material, the way the studio sandbox builds its plate. That
 * keeps cut edges antialiased (no cut-out layer) and resolves the brushing as
 * fine hairlines instead of screen-space bump bands.
 *
 * The groove profile is a blurred copy of the marks, so the walls slope
 * smoothly down to a floor. The walls are polished bare gold and the floor
 * holds the brown fill, so the marks glint differently from the satin plate
 * as the slab turns.
 */
function carveEngraving(
  mask: HTMLCanvasElement,
  color: HTMLCanvasElement,
  height: HTMLCanvasElement,
  brushedRoughness: HTMLCanvasElement,
) {
  const { width, height: rows } = mask;
  const coverage = mask.getContext('2d')!.getImageData(0, 0, width, rows).data;
  // Scales the wall slope so the full cut depth spans about 7 texels
  // (3.5 artboard px, roughly 2 screen px at 1080p).
  const wallTexels = 7;
  const colorContext = color.getContext('2d')!;
  const colorPixels = colorContext.getImageData(0, 0, width, rows);
  const heightPixels = height.getContext('2d')!.getImageData(0, 0, width, rows).data;
  // Wall normals come from a blurred copy of the marks, not the chamfer
  // distance: the distance field steps in 1 / √2 increments, which showed as
  // teeth along every curve. A blur gives the same sloped wall, smoothly.
  const profileCanvas = document.createElement('canvas');
  profileCanvas.width = width;
  profileCanvas.height = rows;
  const profileContext = profileCanvas.getContext('2d')!;
  profileContext.filter = `blur(${WALL_BLUR_TEXELS}px)`;
  profileContext.drawImage(mask, 0, 0);
  const profile = profileContext.getImageData(0, 0, width, rows).data;
  const makeLayer = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = rows;
    const context = canvas.getContext('2d')!;
    return { canvas, context, pixels: context.createImageData(width, rows) };
  };
  const normal = makeLayer();
  const roughness = makeLayer();
  // The plate keeps the brushed roughness it had as a tiled map (repeat
  // 1.08 × 1.45), baked here so the cuts can override it per texel.
  const tileWidth = width / 1.08;
  const tileHeight = rows / 1.45;
  for (let y = 0; y < rows; y += tileHeight) {
    for (let x = 0; x < width; x += tileWidth) {
      roughness.context.drawImage(brushedRoughness, x, y, tileWidth, tileHeight);
    }
  }
  const plateRoughness = roughness.context.getImageData(0, 0, width, rows).data;
  // Brushing relief, as in the studio sandbox's metal normal map: slopes
  // sampled two texels apart so single scratches read as fine hairlines.
  const brushStrength = 2.4;
  // Wall steepness: the full cut depth over the wall width, as a tangent.
  const depthOverWall = 1.7;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const alpha = coverage[p] / 255;
      // Height falls as slope rises: h = -slope. Canvas y runs down while the
      // texture's v runs up, hence the flipped sign on ny.
      const left = profile[(x > 0 ? i - 1 : i) * 4] / 255;
      const right = profile[(x < width - 1 ? i + 1 : i) * 4] / 255;
      const up = profile[(y > 0 ? i - width : i) * 4] / 255;
      const down = profile[(y < rows - 1 ? i + width : i) * 4] / 255;
      const cutX = ((right - left) / 2) * wallTexels * depthOverWall;
      const cutY = -((down - up) / 2) * wallTexels * depthOverWall;
      // The blurred wall reaches a little past the mark's edge; let it shade
      // there too, so the cut's lip is part of the same smooth slope.
      const wallReach = Math.min(1, (profile[p] / 255) * 4);
      const l2 = (y * width + Math.max(0, x - 2)) * 4;
      const r2 = (y * width + Math.min(width - 1, x + 2)) * 4;
      const u2 = (Math.max(0, y - 2) * width + x) * 4;
      const d2 = (Math.min(rows - 1, y + 2) * width + x) * 4;
      const brushX = ((heightPixels[l2] - heightPixels[r2]) / 255) * brushStrength;
      const brushY = ((heightPixels[d2] - heightPixels[u2]) / 255) * brushStrength;
      // Cut walls replace the brushing where the graver removed the surface.
      const nx = brushX * (1 - wallReach) + cutX * wallReach;
      const ny = brushY * (1 - wallReach) + cutY * wallReach;
      const length = Math.hypot(nx, ny, 1);
      normal.pixels.data[p] = Math.round((nx / length * 0.5 + 0.5) * 255);
      normal.pixels.data[p + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      normal.pixels.data[p + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normal.pixels.data[p + 3] = 255;
      // Polished walls, satin floor.
      // 0 at the mark's edge (where the blurred profile is half covered),
      // 1 once the wall has reached the floor.
      const cut = Math.min(1, Math.max(0, (profile[p] / 255 - 0.5) * 2));
      const cutRoughness = 72 + cut * cut * 58;
      const surfaceRoughness = Math.round(plateRoughness[p] * (1 - alpha) + cutRoughness * alpha);
      roughness.pixels.data[p] = roughness.pixels.data[p + 1] = roughness.pixels.data[p + 2] = surfaceRoughness;
      roughness.pixels.data[p + 3] = 255;
      if (!alpha) continue;
      // The brown is a fill lying in the floor; the walls show the gold.
      const fill = 0.78 + 0.22 * cut;
      for (let channel = 0; channel < 3; channel++) {
        const wall = WALL_GOLD[channel] * (1 - fill) + colorPixels.data[p + channel] * fill;
        colorPixels.data[p + channel] = Math.round(colorPixels.data[p + channel] * (1 - alpha) + wall * alpha);
      }
    }
  }
  colorContext.putImageData(colorPixels, 0, 0);
  for (const layer of [normal, roughness]) layer.context.putImageData(layer.pixels, 0, 0);
  return { normal: normal.canvas, roughness: roughness.canvas };
}

async function createRecordedTextures(portraitUrl: string, brushedRoughness: HTMLCanvasElement) {
  await Promise.race([
    document.fonts.load('400 84px "Recorded Newsreader"'),
    new Promise(resolve => window.setTimeout(resolve, 1200)),
  ]);
  const portrait = await loadImage(portraitUrl);
  const [wordmark, growthx] = await Promise.all([
    Promise.race<HTMLImageElement | null>([
      loadImage(WORDMARK_URL).catch(() => null),
      new Promise(resolve => window.setTimeout(() => resolve(null), 1200)),
    ]),
    Promise.race<HTMLImageElement | null>([
      loadImage(GROWTHX_URL).catch(() => null),
      new Promise(resolve => window.setTimeout(() => resolve(null), 1200)),
    ]),
  ]);
  const size = { width: 1200, height: 1685 };
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const detailCanvas = document.createElement('canvas');
  for (const canvas of [colorCanvas, bumpCanvas, detailCanvas]) {
    canvas.width = size.width * FACE_SCALE;
    canvas.height = size.height * FACE_SCALE;
    canvas.getContext('2d')!.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, 0, 0);
  }
  const color = colorCanvas.getContext('2d')!;
  const bump = bumpCanvas.getContext('2d')!;
  const detail = detailCanvas.getContext('2d')!;

  color.fillStyle = '#C68A32';
  color.fillRect(0, 0, size.width, size.height);
  paintBrushedColor(color);

  paintBrushedGoldMicroSurface(bumpCanvas, FACE_SCALE);
  detail.fillStyle = '#000';
  detail.fillRect(0, 0, size.width, size.height);

  const frameStroke = (
    context: CanvasRenderingContext2D,
    inset: number,
    lineWidth: number,
    strokeStyle?: string,
  ) => {
    roundedCanvasPath(context, inset, inset, size.width - inset * 2, size.height - inset * 2, 58);
    context.strokeStyle = strokeStyle ?? (context === detail ? '#fff' : '#656565');
    context.lineWidth = lineWidth;
    context.stroke();
  };
  frameStroke(color, 64, 13, MACHINED_HIGHLIGHT);
  frameStroke(color, 64, 9, ENGRAVED_INK);
  frameStroke(color, 88, 10, MACHINED_HIGHLIGHT);
  frameStroke(color, 88, 6, ENGRAVED_INK);
  frameStroke(detail, 64, 9);
  frameStroke(detail, 88, 6);

  drawEngravedText(color, 'BUILDER', 600, 270, '400 76px "Recorded Newsreader"');
  detail.fillStyle = '#fff';
  detail.font = '400 76px "Recorded Newsreader"';
  detail.textAlign = 'center';
  detail.textBaseline = 'middle';
  detail.fillText('BUILDER', 600, 270);

  const portraitPath = portraitShieldPath();
  color.save();
  color.clip(portraitPath);
  drawCover(color, portrait, 365, 402, 470, 602);
  const portraitShade = color.createLinearGradient(375, 410, 825, 990);
  portraitShade.addColorStop(0, 'rgba(255,180,58,.10)');
  portraitShade.addColorStop(1, 'rgba(68,16,0,.20)');
  color.fillStyle = portraitShade;
  color.fillRect(365, 402, 470, 602);
  color.restore();
  for (const [stroke, width] of [[ENGRAVED_INK, 14], ['#d9b66d', 4]] as const) {
    color.strokeStyle = stroke;
    color.lineWidth = width;
    color.stroke(portraitPath);
  }
  detail.strokeStyle = '#fff';
  detail.lineWidth = 8;
  detail.stroke(portraitPath);

  detail.fillStyle = '#fff';
  const markWidth = 540;
  const markHeight = markWidth / 3.06;
  const markY = 1110;
  if (wordmark) {
    drawTintedImage(color, wordmark, 600 - markWidth / 2, markY, markWidth, markHeight, ENGRAVED_INK);
    drawTintedImage(detail, wordmark, 600 - markWidth / 2, markY, markWidth, markHeight, '#fff');
  } else {
    drawEngravedText(color, 'BUILD SPRINT', 600, markY + markHeight / 2, '400 78px "Recorded Newsreader"');
  }
  const growthWidth = 250;
  const growthHeight = growthWidth / 4.01;
  const growthTop = markY + markHeight + 10;
  const byX = 600 - growthWidth / 2 - 34;
  if (growthx) {
    drawTintedImage(color, growthx, 600 - growthWidth / 2, growthTop, growthWidth, growthHeight, ENGRAVED_INK);
    drawTintedImage(detail, growthx, 600 - growthWidth / 2, growthTop, growthWidth, growthHeight, '#fff');
  } else {
    drawEngravedText(color, 'GrowthX', 600, growthTop + growthHeight / 2, '400 42px Arial');
  }
  drawEngravedText(color, 'By', byX, growthTop + growthHeight / 2, '400 24px Arial');
  detail.fillStyle = '#fff';
  detail.font = '400 24px Arial';
  detail.fillText('By', byX, growthTop + growthHeight / 2);

  const surface = carveEngraving(detailCanvas, colorCanvas, bumpCanvas, brushedRoughness);
  const colorMap = new CanvasTexture(colorCanvas);
  colorMap.colorSpace = SRGBColorSpace;
  const normalMap = new CanvasTexture(surface.normal);
  const roughnessMap = new CanvasTexture(surface.roughness);
  return { colorMap, normalMap, roughnessMap };
}

export class RecordedPassportScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(27, 1, 0.1, 40);
  private assembly = new Group();
  private resources = new Set<Disposable>();
  private cleanups: Array<() => void> = [];
  private environmentTarget: WebGLRenderTarget | null = null;
  private sweepLight: RectAreaLight;
  private glassSheenMaterial: ShaderMaterial | null = null;
  private animationFrame = 0;
  private startTime = performance.now();
  private pointer = new Vector2();
  private pointerActive = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;
  private exporting = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private portraitUrl = DEFAULT_PORTRAIT_URL,
  ) {
    RectAreaLightUniformsLib.init();
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.camera.position.set(0, 0, 8.1);
    this.scene.background = new Color(0x000000);
    this.scene.add(this.assembly);

    this.environmentTarget = createPassportStudio(this.renderer);
    this.scene.environment = this.environmentTarget.texture;
    this.resources.add(this.environmentTarget);

    this.scene.add(new AmbientLight(0xd8c9ae, 0.07));

    const frontBookLight = new RectAreaLight(0xffffff, 0.85, 5.6, 6.2);
    frontBookLight.position.set(0.1, 0.05, 6.4);
    frontBookLight.lookAt(0, 0, 0);
    this.scene.add(frontBookLight);

    const keySoftbox = new RectAreaLight(0xfff5e5, 3.9, 2.35, 5.5);
    keySoftbox.position.set(-3.1, 0.8, 4.8);
    keySoftbox.lookAt(-0.65, 0, 0);
    this.scene.add(keySoftbox);

    const edgeCard = new RectAreaLight(0xffe1a1, 3.35, 0.64, 5.15);
    edgeCard.position.set(3.25, -0.2, 4.5);
    edgeCard.lookAt(0.75, -0.05, 0);
    this.scene.add(edgeCard);

    const topSoftbox = new RectAreaLight(0xffffff, 1.45, 4.8, 1.1);
    topSoftbox.position.set(-0.35, 4.0, 3.6);
    topSoftbox.lookAt(0, 0.7, 0);
    this.scene.add(topSoftbox);

    const lowerGoldSoftbox = new RectAreaLight(0xffedac, 2.25, 2.8, 1.5);
    lowerGoldSoftbox.position.set(0.2, -2.75, 3.9);
    lowerGoldSoftbox.lookAt(0, -0.9, 0);
    this.scene.add(lowerGoldSoftbox);

    this.sweepLight = new RectAreaLight(0xfff7e8, 3.6, 0.68, 6.0);
    this.sweepLight.position.set(-3.6, 0.35, 4.55);
    this.sweepLight.lookAt(0, 0, 0);
    this.scene.add(this.sweepLight);

    const rim = new RectAreaLight(0xe7efff, 2.9, 0.56, 5.4);
    rim.position.set(3.15, 0.15, -2.2);
    rim.lookAt(0, 0, 0);
    this.scene.add(rim);

    this.addObjects();
    this.bindEvents();
    this.resize();
    this.tick();
  }

  private async addObjects() {
    const goldBodyGeometry = createPlateGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS, 0.2);
    const glassGeometry = createGlassSlabGeometry();
    const glassSheenGeometry = createFaceGeometry(3.1, 4.2, 0.19);
    const faceGeometry = createFaceGeometry(CARD_WIDTH - 0.08, CARD_HEIGHT - 0.08, CARD_RADIUS - 0.02);
    this.resources.add(goldBodyGeometry);
    this.resources.add(glassGeometry);
    this.resources.add(glassSheenGeometry);
    this.resources.add(faceGeometry);

    const goldBodyMaterial = new MeshPhysicalMaterial({
      // The studio sandbox's gold.
      color: 0xffc454,
      metalness: 1,
      roughness: 0.31,
      anisotropy: 0.62,
      anisotropyRotation: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.25,
    });
    const brushed = createBrushedMetalTextures();
    for (const texture of [brushed.roughnessMap, brushed.microBump]) {
      texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
      this.resources.add(texture);
    }
    goldBodyMaterial.roughnessMap = brushed.roughnessMap;
    goldBodyMaterial.bumpMap = brushed.microBump;
    goldBodyMaterial.bumpScale = 0.008;
    const glassMaterial = new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transmission: 1,
      thickness: 0.08,
      ior: 1.49,
      dispersion: 0.012,
      specularIntensity: 0.45,
      attenuationColor: new Color(0xe8f5ef),
      attenuationDistance: 8,
      envMapIntensity: 0.45,
      opacity: 1,
      side: FrontSide,
      transparent: false,
      depthWrite: true,
    });
    const glassEdgeMaterial = glassMaterial.clone();
    glassEdgeMaterial.thickness = 0.48;
    glassEdgeMaterial.roughness = 0.045;
    glassEdgeMaterial.specularIntensity = 1;
    glassEdgeMaterial.envMapIntensity = 1.35;
    glassMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_pars_fragment>',
        ShaderChunk.transmission_pars_fragment.replace(
          'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );',
          'return textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );',
        ),
      );
    };
    glassMaterial.customProgramCacheKey = () => 'recorded-passport-clear-cap-v1';
    this.resources.add(goldBodyMaterial);
    this.resources.add(glassMaterial);
    this.resources.add(glassEdgeMaterial);
    this.glassSheenMaterial = createGlassSheenMaterial();
    this.resources.add(this.glassSheenMaterial);

    const glass = new Mesh(glassGeometry, [glassMaterial, glassEdgeMaterial]);
    glass.position.z = 0;
    glass.renderOrder = 4;
    this.assembly.add(glass);
    const glassSheen = new Mesh(glassSheenGeometry, this.glassSheenMaterial);
    glassSheen.position.z = 0.236;
    glassSheen.renderOrder = 5;
    this.assembly.add(glassSheen);
    const body = new Mesh(goldBodyGeometry, goldBodyMaterial);
    body.position.z = 0.03;
    body.renderOrder = 1;
    this.assembly.add(body);
    try {
      const { colorMap, normalMap, roughnessMap } = await createRecordedTextures(
        this.portraitUrl,
        brushed.roughnessMap.image as HTMLCanvasElement,
      );
      const faceMaps = [colorMap, normalMap, roughnessMap];
      if (this.disposed) {
        faceMaps.forEach(texture => texture.dispose());
        return;
      }
      for (const texture of faceMaps) {
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.resources.add(texture);
      }
      const faceMaterial = new MeshPhysicalMaterial({
        map: colorMap,
        normalMap,
        roughnessMap,
        // Matched to the studio sandbox's gold (hue 35, saturation 0.73) under
        // this page's brighter rig. The old 0xffcf65 tint read as burnt orange.
        color: 0xe6cc5c,
        metalness: 0.94,
        roughness: 0.32,
        anisotropy: 0.74,
        anisotropyRotation: 0,
        clearcoat: 0.04,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.12,
      });
      this.resources.add(faceMaterial);
      const face = new Mesh(faceGeometry, faceMaterial);
      // The beveled metal body's front crest reaches ~0.18 world units.
      // Keep the artwork above that crest while remaining behind the 0.24 glass face.
      face.position.z = 0.205;
      face.renderOrder = 2;
      this.assembly.add(face);
      this.canvas.dataset.artwork = 'ready';
    } catch (error) {
      this.canvas.dataset.artwork = 'error';
      console.error('Could not load the recorded passport artwork', error);
    }
  }

  private bindEvents() {
    const onPointerMove = (event: PointerEvent) => {
      const bounds = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      );
      this.pointerActive = true;
    };
    const onPointerLeave = () => {
      this.pointerActive = false;
    };
    const onResize = () => this.resize();
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', onResize);
    this.cleanups.push(
      () => this.canvas.removeEventListener('pointermove', onPointerMove),
      () => this.canvas.removeEventListener('pointerleave', onPointerLeave),
      () => window.removeEventListener('resize', onResize),
    );
  }

  private resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = height > width ? 12.2 : 10.82;
    this.camera.updateProjectionMatrix();
    if (this.reducedMotion) this.renderer.render(this.scene, this.camera);
  }

  private tick = () => {
    if (this.disposed || this.exporting) return;
    this.renderAt((performance.now() - this.startTime) / 1000);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private renderAt(elapsed: number) {
    if (!this.reducedMotion) {
      // Same edge-reveal curve the studio sandbox exports, so both pages move
      // at one pace. The pointer only ever adds to it.
      const pose = edgeRevealPose(elapsed);
      // An export ignores the pointer outright. When the panel reflows at the
      // start of an export, Chrome sends a synthetic pointermove to whatever
      // now sits under the resting cursor, often the canvas, which used to
      // lean the clip by up to 14° from that frame on.
      const lean = this.pointerActive && !this.exporting;
      const targetY = pose.y + (lean ? this.pointer.x * 0.24 : 0);
      const targetX = pose.x + (lean ? -this.pointer.y * 0.16 : 0);
      if (this.exporting) {
        // The easing below is per-frame, not per-second, so it would drag the
        // clip behind the curve. An export follows the pose exactly.
        this.assembly.rotation.set(targetX, targetY, pose.z);
      } else {
        this.assembly.rotation.y += (targetY - this.assembly.rotation.y) * 0.055;
        this.assembly.rotation.x += (targetX - this.assembly.rotation.x) * 0.055;
        this.assembly.rotation.z = pose.z;
      }
      if (this.glassSheenMaterial) {
        // Parked mid-slab. The travelling band crossed the face as a white
        // flare that swallowed the engraving; the studio sandbox has no such
        // sweep, and the edge reveal is the only motion this page needs.
        this.glassSheenMaterial.uniforms.sweep.value = 0.5;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Clip export: render off a virtual clock at a fixed size so the file never
   * depends on real time, the window size or the display's refresh rate.
   */
  beginClip(width: number, height: number) {
    this.exporting = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    // The clip opens square to the camera, so it must ignore wherever the
    // pointer left the slab resting.
    this.pointerActive = false;
    this.assembly.rotation.set(0, 0, 0);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.z = height > width ? 12.2 : 10.82;
    this.camera.updateProjectionMatrix();
  }

  renderClipFrame(elapsedMs: number) {
    this.renderAt(elapsedMs / 1000);
  }

  endClip() {
    this.exporting = false;
    this.startTime = performance.now();
    this.resize();
    if (!this.disposed) this.tick();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.cleanups.forEach(cleanup => cleanup());
    this.scene.traverse(object => {
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.resources.forEach(resource => resource.dispose());
    this.renderer.dispose();
  }
}
