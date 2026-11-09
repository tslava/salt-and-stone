export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function trajectory(a, b, t, jump) {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t) + (jump ? Math.sin(Math.PI * t) * 78 : 0),
  };
}
