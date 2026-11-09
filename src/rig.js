import { mix, ease, clamp, distance, trajectory } from "./math.js";
const point = (x, y) => ({ x, y });
const lerp = (a, b, t) => point(mix(a.x, b.x, t), mix(a.y, b.y, t));
const step = (t, a, b) => ease(clamp((t - a) / (b - a), 0, 1));
export function stance(h) {
  return {
    body: point(h.x, h.y - 36),
    hands: [point(h.x - 8, h.y), point(h.x + 8, h.y)],
    feet: [
      point(h.x - 13, h.y - 61),
      point(h.x + 14, h.y - (h.rest ? 61 : 58)),
    ],
  };
}
// Analytical two-bone IK: segment lengths stay constant, even at full extension.
export function limb(root, end, length, bend) {
  const d = distance(root, end),
    n = Math.max(d, 0.00001),
    reach = Math.min(d, 2 * length - 0.001);
  const tip = point(
    root.x + ((end.x - root.x) * reach) / n,
    root.y + ((end.y - root.y) * reach) / n,
  );
  const mid = lerp(root, tip, 0.5),
    h = Math.sqrt(Math.max(0, length * length - (reach * reach) / 4));
  const joint = point(
    mid.x - ((tip.y - root.y) / Math.max(reach, 0.00001)) * h * bend,
    mid.y + ((tip.x - root.x) / Math.max(reach, 0.00001)) * h * bend,
  );
  return {
    root,
    joint,
    tip,
    requested: end,
    error: Math.max(0, d - 2 * length),
  };
}
export function poseAt(from, to = null, t = 0, jump = false, time = 0) {
  if (to && to.y < from.y) return poseAt(to, from, 1 - t, jump, time);
  const a = stance(from);
  let body = a.body,
    hands = a.hands,
    feet = a.feet,
    contacts = [true, true, true, true];
  if (to) {
    const b = stance(to);
    if (jump) {
      const u = ease(t);
      const arc = trajectory(a.body, b.body, u, true);
      body = arc;
      const lift = Math.sin(Math.PI * u) * 78;
      hands = a.hands.map((h, i) => {
        const p = lerp(h, b.hands[i], u);
        p.y += lift;
        return p;
      });
      feet = a.feet.map((f, i) => {
        const p = lerp(f, b.feet[i], u);
        p.y += lift + Math.sin(Math.PI * u) * (i ? 14 : 23);
        return p;
      });
      contacts = [
        t === 0 || t === 1,
        t === 0 || t === 1,
        t === 0 || t === 1,
        t === 0 || t === 1,
      ];
    } else {
      const leading = to.x >= from.x ? 1 : 0;
      hands = a.hands.map((h, i) =>
        lerp(
          h,
          b.hands[i],
          i === leading ? step(t, 0, 0.52) : step(t, 0.48, 1),
        ),
      );
      body = point(
        (hands[0].x + hands[1].x) / 2,
        (hands[0].y + hands[1].y) / 2 - 36 + Math.sin(Math.PI * t) ** 2 * 12,
      );
      feet = a.feet.map((f, i) => {
        const q = i === leading ? step(t, 0.04, 0.56) : step(t, 0.2, 0.98);
        const p = lerp(f, b.feet[i], q);
        p.y += Math.sin(Math.PI * q) * 7;
        return p;
      });
      contacts = hands
        .map((_, i) => (i === leading ? t >= 0.52 : t <= 0.48))
        .concat(
          feet.map((_, i) =>
            i === leading ? t <= 0.04 || t >= 0.56 : t <= 0.2 || t >= 0.98,
          ),
        );
    }
  } else {
    body = {
      ...body,
      x: body.x + Math.sin(time * 1.4) * 0.6,
      y: body.y + Math.sin(time * 2) * 0.5,
    };
  }
  return buildPose(body, hands, feet, contacts);
}
function buildPose(body, hands, feet, contacts) {
  const shoulders = [
    point(body.x - 7, body.y + 14),
    point(body.x + 7, body.y + 14),
  ];
  const hips = [point(body.x - 5, body.y), point(body.x + 5, body.y)];
  const arms = hands.map((h, i) => limb(shoulders[i], h, 21, i ? -1 : 1));
  const legs = feet.map((f, i) => limb(hips[i], f, 25, i ? 1 : -1));
  return {
    body,
    hands,
    feet,
    arms,
    legs,
    contacts,
    head: point(body.x, body.y + 24),
  };
}

export function summitPose(h, t) {
  const a = stance(h),
    u = ease(clamp(t, 0, 1));
  const body = point(h.x, mix(a.body.y, h.y + 46, u));
  const hands = a.hands.map((v, i) =>
    lerp(v, point(h.x + (i ? 22 : -22), h.y + 24), step(t, 0.38, 1)),
  );
  const feet = a.feet.map((v, i) => {
    const f = step(t, i ? 0.14 : 0, i ? 0.84 : 0.65);
    const p = lerp(v, point(h.x + (i ? 12 : -12), h.y + 1), f);
    p.y += Math.sin(Math.PI * f) * 5;
    return p;
  });
  return buildPose(body, hands, feet, [
    t <= 0.38,
    t <= 0.38,
    t >= 0.65,
    t >= 0.84,
  ]);
}

// Rotate each bone through its shortest arc: constant lengths throughout the
// victory gesture, no IK elbow flip as the hands pass shoulder height.
export function celebrationPose(h, t) {
  const pose = summitPose(h, 1),
    u = ease(clamp(t, 0, 1));
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const turn = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
  pose.arms = pose.arms.map((arm, i) => {
    const end = limb(
      arm.root,
      point(h.x + (i ? 32 : -32), h.y + 92),
      21,
      i ? -1 : 1,
    );
    const upper = turn(angle(arm.root, arm.joint), angle(end.root, end.joint));
    const lower = turn(angle(arm.joint, arm.tip), angle(end.joint, end.tip));
    const joint = point(
      arm.root.x + Math.cos(upper) * 21,
      arm.root.y + Math.sin(upper) * 21,
    );
    const tip = point(
      joint.x + Math.cos(lower) * 21,
      joint.y + Math.sin(lower) * 21,
    );
    return { ...arm, joint, tip, requested: tip, error: 0 };
  });
  pose.hands = pose.arms.map((arm) => arm.tip);
  return pose;
}
