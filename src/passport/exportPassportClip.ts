import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
/**
 * Both passport scenes expose the same virtual-clock hooks, so the exporter
 * does not care which one it is driving.
 */
export type ClipRenderableScene = {
  beginClip(width: number, height: number): void;
  renderClipFrame(elapsedMs: number, motionStartMs: number): void;
  endClip(): void;
};

export type ClipFormat = 'portrait' | 'square' | 'landscape';

export const CLIP_FORMATS: Record<ClipFormat, { label: string; width: number; height: number }> = {
  portrait: { label: '4:5 portrait', width: 1080, height: 1350 },
  square: { label: '1:1 square', width: 1080, height: 1080 },
  landscape: { label: '16:9 landscape', width: 1920, height: 1080 },
};

export const CLIP_DURATION_MS = 10_000;
// 30fps: every social platform recompresses to 30 anyway, and it halves the
// encode work, which matters on machines without a hardware H.264 encoder.
export const CLIP_FPS = 30;
/** The entrance runs first; the chosen motion starts here. */
export const CLIP_MOTION_START_MS = 2_000;

export const isClipExportSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });


// H.264 level 4.0 covers 1080p30. High profile needs a hardware encoder in
// Chrome; Baseline always has a software path. `isConfigSupported` alone is not
// trustworthy (a broken hardware encoder still reports supported), so each
// candidate is proven with a real one-frame encode before it is used.
const H264_CANDIDATES = ['avc1.640028', 'avc1.4D4028', 'avc1.42E028', 'avc1.42E01F'];

async function probeEncoder(config: VideoEncoderConfig) {
  const { supported } = await VideoEncoder.isConfigSupported(config);
  if (!supported) return false;
  const probe = document.createElement('canvas');
  probe.width = config.width;
  probe.height = config.height;
  probe.getContext('2d')!.fillRect(0, 0, 4, 4);
  let failed = false;
  const encoder = new VideoEncoder({ output: () => {}, error: () => { failed = true; } });
  try {
    encoder.configure(config);
    const frame = new VideoFrame(probe, { timestamp: 0, duration: 33_333 });
    encoder.encode(frame, { keyFrame: true });
    frame.close();
    await withTimeout(encoder.flush(), 4_000, 'Encoder probe');
    return !failed;
  } catch {
    return false;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

async function pickEncoderConfig(width: number, height: number): Promise<VideoEncoderConfig> {
  for (const codec of H264_CANDIDATES) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: 10_000_000,
      framerate: CLIP_FPS,
      latencyMode: 'quality',
    };
    if (await probeEncoder(config)) return config;
  }
  throw new Error('This browser has no working H.264 encoder. Try Chrome or Edge on desktop.');
}

export type ClipProgress = { phase: 'rendering' | 'encoding'; fraction: number };

/**
 * Renders the passport frame by frame off a virtual clock and encodes an MP4
 * in the browser. Nothing is uploaded. Resolves with the finished file.
 */
export async function exportPassportClip(
  scene: ClipRenderableScene,
  canvas: HTMLCanvasElement,
  format: ClipFormat,
  onProgress: (progress: ClipProgress) => void,
): Promise<Blob> {
  const { width, height } = CLIP_FORMATS[format];
  const config = await pickEncoderConfig(width, height);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });
  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: error => { encodeError = error; },
  });
  encoder.configure(config);

  const totalFrames = Math.round((CLIP_DURATION_MS / 1000) * CLIP_FPS);
  const frameDuration = Math.round(1_000_000 / CLIP_FPS);
  scene.beginClip(width, height);
  try {
    for (let index = 0; index < totalFrames; index += 1) {
      if (encodeError) throw encodeError;
      scene.renderClipFrame((index * 1000) / CLIP_FPS, CLIP_MOTION_START_MS);
      const frame = new VideoFrame(canvas, {
        timestamp: index * frameDuration,
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: index % CLIP_FPS === 0 });
      frame.close();
      onProgress({ phase: 'rendering', fraction: index / totalFrames });
      // Real backpressure: never let the encoder fall more than a few frames
      // behind, or the final flush becomes a long, silent wait.
      const waitStart = performance.now();
      while (encoder.encodeQueueSize > 4) {
        if (encodeError) throw encodeError;
        if (performance.now() - waitStart > 10_000) {
          throw new Error('Video encoder stopped responding. Try Chrome or Edge on desktop.');
        }
        await yieldToBrowser();
      }
      if (index % 4 === 0) await yieldToBrowser();
    }
    onProgress({ phase: 'encoding', fraction: 1 });
    await withTimeout(encoder.flush(), 60_000, 'Video encoder');
    if (encodeError) throw encodeError;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    encoder.close();
    scene.endClip();
  }
}

export function downloadClip(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
