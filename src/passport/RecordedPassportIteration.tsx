import { useEffect, useRef, useState } from 'react';
import { RecordedPassportScene } from './RecordedPassportScene';
import {
  CLIP_FORMATS,
  downloadClip,
  exportPassportClip,
  isClipExportSupported,
  type ClipFormat,
} from './exportPassportClip';
import styles from './RecordedPassportIteration.module.css';

type ClipState =
  | { phase: 'idle' }
  | { phase: 'rendering'; progress: number }
  | { phase: 'encoding' }
  | { phase: 'done'; size: number; filename: string }
  | { phase: 'error'; message: string };


export function RecordedPassportIteration() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RecordedPassportScene | null>(null);
  const [clipFormat, setClipFormat] = useState<ClipFormat>('portrait');
  const [clipState, setClipState] = useState<ClipState>({ phase: 'idle' });
  // Encoder support can only be read in the browser; deciding it during SSR
  // renders the wrong copy and fails hydration.
  const [canExport, setCanExport] = useState(false);
  const busy =
    clipState.phase === 'rendering' || clipState.phase === 'encoding';

  useEffect(() => {
    setCanExport(isClipExportSupported());
    document.title = 'Build Sprint passport';
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new RecordedPassportScene(canvasRef.current);
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);

  const handleExportClip = async () => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    setClipState({ phase: 'rendering', progress: 0 });
    try {
      const blob = await exportPassportClip(
        scene,
        canvas,
        clipFormat,
        progress =>
          setClipState(
            progress.phase === 'encoding'
              ? { phase: 'encoding' }
              : { phase: 'rendering', progress: progress.fraction },
          ),
      );
      const filename = 'build-sprint-passport-recording.mp4';
      downloadClip(blob, filename);
      setClipState({ phase: 'done', size: blob.size, filename });
    } catch (error) {
      setClipState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Export failed',
      });
    }
  };

  return (
    <>
      <main className={styles.stage}>
        <h1 className={styles.title}>
          Build Sprint passport, recorded 21 September 2026
        </h1>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="Interactive three-dimensional gold Build Sprint passport in a glass slab"
          role="img"
        />
        <div className={styles.exportControl}>
          <div className={styles.exportPlate}>
            <span className={styles.exportHeader}>
              <strong>Export clip</strong>
              <small>
                {canExport
                  ? '10 seconds, 30fps MP4, rendered frame by frame in this browser.'
                  : 'Needs Chrome, Edge or Safari 16.4+ for in-browser video encoding.'}
              </small>
            </span>
            <span className={styles.exportRow}>
              <select
                aria-label="Clip format"
                value={clipFormat}
                disabled={busy}
                onChange={event =>
                  setClipFormat(event.target.value as ClipFormat)
                }
              >
                {(Object.keys(CLIP_FORMATS) as ClipFormat[]).map(key => (
                  <option key={key} value={key}>
                    {CLIP_FORMATS[key].label} · {CLIP_FORMATS[key].width}×
                    {CLIP_FORMATS[key].height}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.exportButton}
                disabled={!canExport || busy}
                onClick={handleExportClip}
              >
                {clipState.phase === 'rendering'
                  ? `Rendering ${Math.round(clipState.progress * 100)}%`
                  : clipState.phase === 'encoding'
                    ? 'Encoding…'
                    : 'Export 10s clip'}
              </button>
            </span>
            {clipState.phase === 'rendering' && (
              <progress
                className={styles.exportProgress}
                max={1}
                value={clipState.progress}
              />
            )}
            {clipState.phase === 'encoding' && (
              <progress className={styles.exportProgress} />
            )}
            {clipState.phase === 'done' && (
              <small className={styles.exportNote}>
                Saved to your Downloads folder as {clipState.filename} ·{' '}
                {(clipState.size / 1_048_576).toFixed(1)} MB
              </small>
            )}
            {clipState.phase === 'error' && (
              <small className={styles.exportNote} role="alert">
                {clipState.message}
              </small>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
