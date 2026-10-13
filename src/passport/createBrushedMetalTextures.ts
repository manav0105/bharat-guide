import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping } from 'three';

export function createBrushedMetalTextures() {
  const size = 512;
  const roughnessCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  roughnessCanvas.width = bumpCanvas.width = size;
  roughnessCanvas.height = bumpCanvas.height = size;
  const roughness = roughnessCanvas.getContext('2d')!;
  const bump = bumpCanvas.getContext('2d')!;
  let seed = 4819;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  roughness.fillStyle = 'rgb(132,132,132)';
  roughness.fillRect(0, 0, size, size);
  bump.fillStyle = 'rgb(128,128,128)';
  bump.fillRect(0, 0, size, size);

  // A brushed plate has directional scratches, not full-width scan lines. Long,
  // broken fibres supply the direction while wider, low-contrast passes keep the
  // finish continuous when the card is viewed at rest.
  for (let index = 0; index < 110; index++) {
    const y = random() * size;
    const x = -size * 0.08 + random() * size * 0.35;
    const length = size * (0.58 + random() * 0.62);
    const value = Math.round(104 + random() * 57);
    roughness.strokeStyle = `rgb(${value},${value},${value})`;
    roughness.globalAlpha = 0.07 + random() * 0.09;
    roughness.lineWidth = 2.5 + random() * 7.5;
    roughness.beginPath();
    roughness.moveTo(x, y);
    roughness.bezierCurveTo(
      x + length * 0.33,
      y + (random() - 0.5) * 1.8,
      x + length * 0.66,
      y + (random() - 0.5) * 1.8,
      x + length,
      y + (random() - 0.5) * 1.2,
    );
    roughness.stroke();
  }
  for (let index = 0; index < 920; index++) {
    const x = random() * size;
    const y = random() * size;
    const length = 28 + random() * 250;
    const value = Math.round(92 + random() * 78);
    roughness.strokeStyle = `rgb(${value},${value},${value})`;
    roughness.globalAlpha = 0.11 + random() * 0.2;
    roughness.lineWidth = random() > 0.91 ? 1.35 : 0.55;
    roughness.beginPath();
    roughness.moveTo(x, y);
    roughness.lineTo(Math.min(size, x + length), y + (random() - 0.5) * 0.85);
    roughness.stroke();

    bump.strokeStyle = random() > 0.5 ? '#858585' : '#797979';
    bump.globalAlpha = 0.1 + random() * 0.16;
    bump.lineWidth = random() > 0.94 ? 1.2 : 0.55;
    bump.beginPath();
    bump.moveTo(x, y);
    bump.lineTo(Math.min(size, x + length), y + (random() - 0.5) * 0.7);
    bump.stroke();
  }
  roughness.globalAlpha = 1;
  bump.globalAlpha = 1;
  const roughnessMap = new CanvasTexture(roughnessCanvas);
  const microBump = new CanvasTexture(bumpCanvas);
  for (const texture of [roughnessMap, microBump]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(1.08, 1.45);
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
  }
  return { roughnessMap, microBump };
}
