/**
 * "Edge reveal": a slow horizontal turn that walks the light down one long
 * edge and back. Every channel is a sine so the pose is square at t=0, which
 * is what an exported clip opens on. Frequencies carry a 2.625x speed-up over
 * the original pacing.
 */
export function edgeRevealPose(seconds: number) {
  return {
    x: Math.sin(seconds * 1.1025) * 0.035,
    y: Math.sin(seconds * 0.7875) * 0.22,
    z: Math.sin(seconds * 0.7875) * 0.008,
  };
}
