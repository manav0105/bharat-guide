const WIDTH = 1200;
const HEIGHT = 1685;
const TEXTURE_SCALE = 2;

/** Non-repeating horizontal hand brushing, shared direction across material maps. */
export function paintBrushedGoldMicroSurface(
  canvas: HTMLCanvasElement,
  textureScale = TEXTURE_SCALE,
) {
  const context = canvas.getContext('2d')!;
  let seed = 2401;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  context.save();
  context.resetTransform();
  context.fillStyle = '#808080';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(textureScale, textureScale);
  context.lineCap = 'round';
  for (let i = 0; i < 18500; i++) {
    const x = -WIDTH * .5 + random() * WIDTH * 1.5;
    const y = -HEIGHT * .3 + random() * HEIGHT * 1.3;
    const broad = i < 380;
    const length = broad ? 230 + random() * 700 : 18 + random() * 310;
    const bend = (random() - .5) * (broad ? 65 : 12);
    const value = Math.round(107 + random() * 42);
    context.strokeStyle = `rgb(${value},${value},${value})`;
    context.globalAlpha = broad ? .08 + random() * .12 : .22 + random() * .35;
    context.lineWidth = broad ? 3 + random() * 13 : .25 + random() * .8;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + length * .5 + bend, y - bend * .12, x + length, y);
    context.stroke();
  }
  context.restore();
}

export function paintBrushedColor(context: CanvasRenderingContext2D) {
  let seed = 8137;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  context.save();
  // Broad alloy/foil variation supplies warm bronze patches; moving specular
  // highlights remain in the lights and roughness rather than painted white.
  for (const [x, y, radius, tint] of [
    [80, 320, 590, '#633415'], [1120, 870, 650, '#8B501F'],
    [220, 1420, 440, '#321A0D'], [770, 150, 470, '#F5D77A'],
    [660, 1270, 490, '#F5D77A'],
  ] as const) {
    const patch = context.createRadialGradient(x, y, 0, x, y, radius);
    patch.addColorStop(0, tint); patch.addColorStop(1, `${tint}00`);
    context.globalAlpha = .32;
    context.fillStyle = patch; context.fillRect(0, 0, WIDTH, HEIGHT);
  }
  for (let i = 0; i < 11000; i++) {
    const x = random() * WIDTH, y = random() * HEIGHT;
    const length = 12 + random() * 190;
    context.strokeStyle = i % 3 === 0 ? '#F5D77A' : '#8B501F';
    context.globalAlpha = .05 + random() * .13;
    context.lineWidth = .3 + random() * .6;
    context.beginPath(); context.moveTo(x, y);
    context.quadraticCurveTo(x + length * .53, y + (random() - .5) * 1.5, x + length, y);
    context.stroke();
  }
  context.restore();
}
