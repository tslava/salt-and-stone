import { clamp, mix, ease, distance, trajectory } from "./math.js";
import { poseAt } from "./rig.js";
export { clamp, mix, ease, distance, trajectory } from "./math.js";
export const REACH = 62,
  MAX_RANGE = 148;
// Hand anchors. Every node owns a real hand lip and two foot chips, drawn by the renderer.
export const holds = [
  { id: "s", x: 112, y: 100, rest: true, label: "Lower ledge" },
  { id: "a", x: 121, y: 147 },
  { id: "b", x: 169, y: 167 },
  { id: "c", x: 266, y: 223 },
  { id: "r1", x: 287, y: 270, rest: true, label: "Warm cornice" },
  { id: "d", x: 239, y: 294 },
  { id: "e", x: 202, y: 341 },
  { id: "r2", x: 146, y: 355, rest: true, label: "Pine balcony" },
  { id: "f", x: 139, y: 405 },
  { id: "g", x: 192, y: 449 },
  { id: "h", x: 248, y: 439 },
  { id: "i", x: 278, y: 489 },
  { id: "r3", x: 265, y: 544, rest: true, label: "Before the gap" },
  { id: "j", x: 275, y: 593 },
  { id: "r4", x: 390, y: 621, rest: true, label: "Wind Needle" },
  { id: "k", x: 416, y: 668 },
  { id: "l", x: 369, y: 703 },
  { id: "m", x: 424, y: 779 },
  { id: "r5", x: 386, y: 816, rest: true, label: "Wind shelter" },
  { id: "n", x: 430, y: 857 },
  { id: "o", x: 538, y: 895 },
  { id: "z", x: 466, y: 903 },
  { id: "r6", x: 586, y: 865, rest: true, label: "Quiet niche" },
  { id: "p", x: 615, y: 918 },
  { id: "q", x: 564, y: 966 },
  { id: "r7", x: 608, y: 1005, rest: true, label: "Last breather" },
  { id: "v", x: 549, y: 1053 },
  {
    id: "summit",
    x: 566,
    y: 1108,
    rest: true,
    final: true,
    label: "Last light",
  },
];
export const obstacles = [
  { id: "cleft", x: 222, y: 141, w: 16, h: 18, label: "Ledge in the way" },
  { id: "overhang", x: 484, y: 834, w: 18, h: 17, label: "Overhanging flake" },
];
const collisionCache = new Map();
export function blocked(a, b, jump) {
  const key = `${a.x},${a.y}:${b.x},${b.y}:${jump}`;
  if (collisionCache.has(key)) return collisionCache.get(key);
  let hit = null;
  for (let i = 0; i <= 80 && !hit; i++) {
    const p = poseAt(a, b, i / 80, jump);
    const points = [
      { x: p.body.x, y: p.body.y + 10, r: 9 },
      { ...p.head, r: 6 },
    ];
    for (const l of [...p.arms, ...p.legs])
      for (const [v, w] of [
        [l.root, l.joint],
        [l.joint, l.tip],
      ])
        for (let j = 0; j <= 5; j++)
          points.push({
            x: mix(v.x, w.x, j / 5),
            y: mix(v.y, w.y, j / 5),
            r: 3,
          });
    hit =
      obstacles.find((o) =>
        points.some(
          (q) =>
            q.x + q.r > o.x &&
            q.x - q.r < o.x + o.w &&
            q.y + q.r > o.y &&
            q.y - q.r < o.y + o.h,
        ),
      ) || null;
  }
  collisionCache.set(key, hit);
  return hit;
}
export function plan(from, to, held, stamina, retreat = false) {
  const d = distance(from, to),
    jump = d > REACH;
  const required = jump ? 0.2 + (d - REACH) / 170 : 0;
  const cost = retreat
    ? 0
    : jump
      ? Math.round(22 + d * 0.095)
      : Math.round(6 + d * 0.1);
  const obstruction = blocked(from, to, jump);
  const reason =
    d > MAX_RANGE
      ? "Too far"
      : obstruction
        ? "Rock in the way"
        : held < required
          ? "Charge the jump"
          : stamina < cost
            ? "Not enough strength"
            : null;
  return {
    from: from.id,
    to: to.id,
    jump,
    retreat,
    descending: to.y < from.y - 5,
    cost,
    d,
    required,
    ready: !reason,
    reason,
    obstacle: obstruction?.id || null,
    charge: required ? clamp(held / required, 0, 1) : 1,
  };
}
export function selectTarget(from, dx, dy, previous = null) {
  const mag = Math.hypot(dx, dy);
  const dir = mag < 9 ? { x: 0, y: 1 } : { x: dx / mag, y: dy / mag };
  const desired = clamp(mag, 48, MAX_RANGE);
  const candidates = holds
    .filter((h) => h.id !== from.id && distance(from, h) <= MAX_RANGE + 25)
    .map((h) => {
      const d = distance(from, h),
        dot = ((h.x - from.x) * dir.x + (h.y - from.y) * dir.y) / d;
      return { h, score: (1 - dot) * 5 + Math.abs(d - desired) * 0.003, dot };
    })
    .filter((c) => c.dot > (c.h.id === previous ? 0.52 : 0.73))
    .sort((a, b) => a.score - b.score);
  if (!candidates.length) return null;
  const old = candidates.find((c) => c.h.id === previous);
  return old && old.score < candidates[0].score + 0.24
    ? old.h
    : candidates[0].h;
}
export function holdById(id) {
  return holds.find((h) => h.id === id);
}
