import {
  CanvasTexture, Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene,
  type WebGLRenderer,
} from 'three';

/** Reflection cards, captured once. The black gaps are as important as the lights. */
export function createPassportStudio(renderer: WebGLRenderer) {
  const studio = new Scene();
  studio.background = new Color(0x303030);
  const geometry = new PlaneGeometry(1, 1);
  const materials: MeshBasicMaterial[] = [];
  // A photographed diffusion panel has a bright core and feathered edges.
  // Capture that luminance falloff into the environment, not onto the gold.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const edge = Math.min(x, y, 255 - x, 255 - y) / 48;
      const t = Math.min(1, edge);
      const value = Math.round(255 * t * t * (3 - 2 * t));
      const offset = (y * 256 + x) * 4;
      pixels.data.set([value, value, value, 255], offset);
    }
  }
  context.putImageData(pixels, 0, 0);
  const diffusion = new CanvasTexture(canvas);
  const card = (
    width: number, height: number, x: number, y: number, z: number,
    intensity: number, color: number,
  ) => {
    const material = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(intensity), map: diffusion, toneMapped: false,
    });
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, 1);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  // Offset softbox + narrow opposing strip: broad satin highlight, crisp glass rim.
  card(3.5, 8, -2.8, 1.4, 5, 6, 0xffffff);
  card(1.1, 8, 4, 0.5, 2.4, 6, 0xffffff);
  card(5, 1.2, 0, 5, 1.5, 6, 0xffffff);
  card(2, 6, -4, 0, -3, 4, 0xffffff);
  card(3, 4, 1, 0, -6, 1.5, 0xffebd1);
  // Bright frontal bounce holds luminous midtones even at the resting angle.
  card(6, 7, 1, -0.5, 7, 0.3, 0xffffff);
  const pmrem = new PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(studio, 0.025, 0.1, 30);
  } finally {
    diffusion.dispose();
    geometry.dispose();
    materials.forEach(material => material.dispose());
    pmrem.dispose();
  }
}
