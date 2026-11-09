import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/engine.js";
import {
  holds,
  holdById,
  plan,
  selectTarget,
  distance,
  trajectory,
} from "../src/route.js";
import { poseAt } from "../src/rig.js";
const tick = (g, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 120) {
    g.update(1 / 120);
    g.present();
  }
};
function gesture(g, id) {
  const h = holdById(id),
    dx = h.x - g.current.x,
    dy = h.y - g.current.y;
  g.begin(180, 700);
  g.aim(180 + dx, 700 - dy);
  tick(g, 0.9);
  assert.equal(g.gesture.target, id);
  assert.ok(g.gesture.preview.ready, JSON.stringify(g.gesture.preview));
  const before = g.gesture.preview;
  assert.ok(g.release());
  assert.equal(g.move.to, before.to);
  tick(g, 1);
}
test("first section: reach, lateral, jump, rest; no forced fall", () => {
  const g = new Game();
  g.start();
  for (const id of ["a", "b", "c", "r1"]) gesture(g, id);
  assert.equal(g.current.id, "r1");
  assert.equal(g.deaths, 0);
  assert.equal(g.jumpCount, 1);
  assert.ok(g.energy > 20);
  tick(g, 4);
  assert.equal(g.energy, 100);
});
test("blind identical up gestures do not pass the lateral gate", () => {
  const g = new Game();
  g.start();
  for (let i = 0; i < 60; i++) {
    g.begin(180, 700);
    g.aim(182, 680);
    tick(g, 0.12);
    g.release();
    tick(g, 0.7);
  }
  assert.ok(g.maxY <= 147);
  assert.ok(!g.history.some((m) => m.committed === "b"));
});
test("all reachable poses: fixed bone lengths and reachable contacts", () => {
  let maxError = 0;
  for (const a of holds)
    for (const b of holds) {
      const p = plan(a, b, 2, 100);
      if (a === b || !p.ready) continue;
      for (let i = 0; i <= 120; i++) {
        const pose = poseAt(a, b, i / 120, p.jump);
        for (const l of [...pose.arms, ...pose.legs]) {
          const len = pose.arms.includes(l) ? 21 : 25;
          assert.ok(Math.abs(distance(l.root, l.joint) - len) < 0.001);
          assert.ok(Math.abs(distance(l.joint, l.tip) - len) < 0.001);
          maxError = Math.max(maxError, l.error);
        }
      }
    }
  assert.ok(maxError < 0.01, `unreachable limb by ${maxError}`);
});
test("pinned hand is stationary until transfer; endpoints continuous", () => {
  const a = holds[1],
    b = holds[2];
  for (let i = 0; i < 48; i++) {
    const p = poseAt(a, b, i / 100, false);
    assert.equal(p.hands[0].x, a.x - 8);
    assert.equal(p.hands[0].y, a.y);
  }
  for (let i = 52; i <= 100; i++) {
    const p = poseAt(a, b, i / 100, false);
    assert.equal(p.hands[1].x, b.x + 8);
    assert.equal(p.hands[1].y, b.y);
  }
  for (const jump of [false, true]) {
    for (const [t, h] of [
      [0, a],
      [1, b],
    ]) {
      const p = poseAt(a, b, t, jump),
        q = poseAt(h);
      assert.ok(distance(p.body, q.body) < 0.001);
      for (let k = 0; k < 2; k++) {
        assert.ok(distance(p.hands[k], q.hands[k]) < 0.001);
        assert.ok(distance(p.feet[k], q.feet[k]) < 0.001);
      }
    }
  }
});
test("cancel, interruption, rapid unseen input, and input during flight do not execute", () => {
  const g = new Game();
  g.start();
  g.begin(100, 600);
  g.release();
  assert.equal(g.moves, 0);
  g.begin(100, 600);
  tick(g, 0.2);
  g.aim(100, 650);
  g.release();
  assert.equal(g.moves, 0);
  g.begin(100, 600);
  tick(g, 0.2);
  g.pause();
  g.release();
  assert.equal(g.moves, 0);
  g.resume();
  gesture(g, "a");
  g.begin(100, 600);
  g.aim(148, 580);
  tick(g, 0.2);
  g.release();
  assert.equal(g.state, "move");
  assert.equal(g.begin(100, 600), false);
  tick(g, 1);
  g.release();
  assert.equal(g.current.id, "b");
  assert.equal(g.moves, 2);
});
test("preview is stable under finger jitter and is exactly the committed target", () => {
  const g = new Game();
  g.start();
  g.begin(180, 700);
  for (let i = 0; i < 30; i++) {
    g.aim(180 + Math.sin(i) * 2, 677 + Math.cos(i) * 2);
    tick(g, 0.02);
    assert.equal(g.gesture.target, "a");
  }
  const preview = g.gesture.preview;
  g.release();
  assert.deepEqual(g.history[0].preview, preview);
  assert.equal(g.move.to, preview.to);
});
test("exhaustion falls and respawns at last ledge", () => {
  const g = new Game();
  g.start();
  gesture(g, "a");
  g.energy = 0.1;
  g.idleTime = 5;
  tick(g, 0.15);
  assert.equal(g.state, "falling");
  tick(g, 1.1);
  assert.equal(g.state, "idle");
  assert.equal(g.current.id, "s");
  assert.equal(g.deaths, 1);
  assert.equal(g.energy, 100);
});
test("insufficient charge and stamina are shown and reject movement", () => {
  assert.equal(plan(holds[2], holds[3], 0.1, 100).reason, "Charge the jump");
  assert.equal(plan(holds[2], holds[3], 1, 10).reason, "Not enough strength");
  const g = new Game();
  g.start();
  g.energy = 1;
  g.begin(100, 600);
  tick(g, 0.2);
  assert.equal(g.gesture.preview.reason, "Not enough strength");
  g.release();
  assert.equal(g.moves, 0);
});
export const careful = [
  "a",
  "b",
  "c",
  "r1",
  "d",
  "e",
  "r2",
  "f",
  "g",
  "h",
  "i",
  "r3",
  "j",
  "r4",
  "k",
  "l",
  "m",
  "r5",
  "n",
  "o",
  "r6",
  "p",
  "q",
  "r7",
  "v",
  "summit",
];
export const direct = [
  "a",
  "b",
  "c",
  "r1",
  "d",
  "e",
  "h",
  "i",
  "r3",
  "j",
  "r4",
  "k",
  "l",
  "m",
  "r5",
  "n",
  "o",
  "q",
  "r7",
  "v",
  "summit",
];
for (const [name, route] of [
  ["careful", careful],
  ["direct", direct],
])
  test(`${name} route completes both cliffs without falling`, () => {
    const g = new Game();
    g.start();
    let minEnergy = 100;
    for (const id of route) {
      if (g.current.rest) tick(g, 4);
      gesture(g, id);
      minEnergy = Math.min(minEnergy, g.energy);
    }
    tick(g, 3.5);
    assert.equal(g.state, "complete");
    assert.equal(g.stage, 2);
    assert.equal(g.deaths, 0);
    assert.ok(minEnergy > 0);
    console.log(
      `${name}: ${g.moves} moves / ${g.jumpCount} jumps / minimum energy ${minEnergy.toFixed(1)}`,
    );
  });
test("preview explicitly warns about a physical overhang", () => {
  const a = holdById("n"),
    b = holdById("z");
  const p = plan(a, b, 1, 100);
  assert.equal(p.ready, false);
  assert.equal(p.reason, "Rock in the way");
  assert.equal(p.obstacle, "overhang");
});
test("every hand lip and every resting foot platform is attached to a cliff", async () => {
  const { cliffs } = await import("../src/art.js");
  function inside(x, y, polygon) {
    let yes = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i],
        b = polygon[j];
      if (
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      )
        yes = !yes;
    }
    return yes;
  }
  for (const h of holds) {
    for (const [x, y] of [
      [h.x, h.y - 3],
      ...(h.rest
        ? [[h.x, h.y - 64]]
        : [
            [h.x - 13, h.y - 64],
            [h.x + 14, h.y - 61],
          ]),
    ])
      assert.ok(
        cliffs.some((c) => inside(x, y, c.outline)),
        `${h.id}: floating support at ${x},${y}`,
      );
  }
});

test("summit mantle is continuous and preserves bone lengths", async () => {
  const { summitPose } = await import("../src/rig.js");
  const h = holdById("summit"),
    start = poseAt(h),
    first = summitPose(h, 0);
  assert.ok(distance(start.body, first.body) < 0.001);
  for (let i = 0; i <= 240; i++) {
    const p = summitPose(h, i / 240);
    for (const l of [...p.arms, ...p.legs])
      assert.ok(l.error < 0.01, `mantle error ${l.error} at ${i / 240}`);
  }
  const end = summitPose(h, 1);
  assert.equal(end.feet[0].y, h.y + 1);
  assert.equal(end.feet[1].y, h.y + 1);
});
test("identical short upward gestures stall from every checkpoint", () => {
  for (const h of holds.filter((h) => h.rest && !h.final)) {
    const g = new Game();
    g.start();
    g.current = h;
    g.checkpoint = h;
    g.pose = poseAt(h);
    for (let i = 0; i < 30; i++) {
      g.begin(180, 700);
      g.aim(182, 680);
      tick(g, 0.12);
      g.release();
      tick(g, 0.7);
    }
    assert.notEqual(g.state, "complete");
    assert.ok(
      g.moves <= 1,
      `${h.id}: blind gesture traversed ${g.moves} edges`,
    );
  }
});
test("a range of repeated short upward gestures cannot solve either cliff", () => {
  for (const dx of [-10, 0, 10, 20])
    for (const dy of [15, 25, 35])
      for (const duration of [0.08, 0.12, 0.18]) {
        const g = new Game();
        g.start();
        for (let i = 0; i < 20; i++) {
          g.begin(180, 700);
          g.aim(180 + dx, 700 - dy);
          tick(g, duration);
          g.release();
          tick(g, 0.75);
        }
        assert.ok(
          g.maxY <= 167,
          `blind ${dx},${dy},${duration} reached ${g.maxY}`,
        );
        assert.equal(g.stage, 1);
      }
});
test("pause during flight preserves pose and remaining motion", () => {
  const g = new Game();
  g.start();
  g.begin(180, 700);
  g.aim(189, 653);
  tick(g, 0.2);
  g.release();
  tick(g, 0.25);
  const before = structuredClone(g.pose),
    elapsed = g.move.elapsed;
  g.pause();
  tick(g, 10);
  assert.deepEqual(g.pose, before);
  assert.equal(g.move.elapsed, elapsed);
  g.resume();
  tick(g, 1);
  assert.equal(g.current.id, "a");
});

test("magnet retains a target through jitter and requires persistent intent to switch", () => {
  const g = new Game();
  g.start();
  g.begin(180, 700);
  g.aim(189, 653);
  tick(g, 0.05);
  assert.equal(g.gesture.target, "a");
  for (let i = 0; i < 20; i++) {
    g.aim(i % 2 ? 225 : 189, i % 2 ? 655 : 653);
    tick(g, 0.02);
    assert.equal(g.gesture.target, "a");
  }
  g.aim(237, 633);
  tick(g, 0.1);
  assert.equal(g.gesture.target, "a");
  tick(g, 0.1);
  assert.equal(g.gesture.target, "b");
  const shown = g.gesture.preview;
  g.release();
  assert.equal(g.move.to, shown.to);
});
test("leaving the selection cone briefly does not drop the preview", () => {
  const g = new Game();
  g.start();
  g.begin(180, 700);
  g.aim(189, 653);
  tick(g, 0.4);
  g.aim(100, 700);
  tick(g, 0.12);
  assert.equal(g.gesture.target, "a");
  g.aim(189, 653);
  tick(g, 0.2);
  assert.equal(g.gesture.target, "a");
  g.aim(100, 700);
  tick(g, 0.3);
  assert.equal(g.gesture.target, null);
});
test("down selects an actual lower hold; returning to touch origin cancels immediately", () => {
  const g = new Game();
  g.start();
  gesture(g, "a");
  g.begin(180, 700);
  g.aim(171, 747);
  tick(g, 0.2);
  assert.equal(g.gesture.target, "s");
  assert.equal(g.gesture.preview.retreat, true);
  assert.equal(g.gesture.cancelled, false);
  g.aim(183, 702);
  assert.equal(g.gesture.cancelled, true);
  assert.equal(g.gesture.preview, null);
  g.release();
  assert.equal(g.current.id, "a");
});
test("every visited non-rest position has a zero-cost return all the way to the last rest", () => {
  const g = new Game();
  g.start();
  let retreats = 0;
  for (const id of careful) {
    if (g.current.rest) tick(g, 4);
    gesture(g, id);
    if (g.current.rest) continue;
    const copy = Object.assign(new Game(), structuredClone(g));
    copy.energy = 0.01;
    copy.idleTime = 5;
    const checkpoint = copy.checkpoint.id;
    for (let i = 0; !copy.current.rest && i < 40; i++) {
      const target = copy.retreatTarget;
      assert.ok(target, `no return from ${copy.current.id}`);
      copy.begin(180, 700);
      copy.aim(
        180 + target.x - copy.current.x,
        700 - (target.y - copy.current.y),
      );
      tick(copy, 1);
      assert.equal(copy.gesture.target, target.id);
      assert.equal(copy.gesture.preview.cost, 0);
      assert.equal(copy.gesture.preview.retreat, true);
      assert.ok(copy.gesture.preview.ready);
      assert.ok(copy.release());
      tick(copy, 1);
      retreats++;
      assert.equal(copy.deaths, 0);
    }
    assert.equal(copy.current.id, checkpoint);
  }
  assert.ok(retreats > 25);
});
test("reserve cannot pay for a new forward move or refill stamina by retracing a loop", () => {
  const g = new Game();
  g.start();
  gesture(g, "a");
  gesture(g, "b");
  g.energy = 2;
  gesture(g, "a");
  assert.equal(g.energy, 2);
  assert.equal(g.retreatTarget.id, "s");
  g.begin(180, 700);
  g.aim(228, 680);
  tick(g, 0.5);
  assert.equal(g.gesture.preview.retreat, false);
  assert.equal(g.gesture.preview.reason, "Not enough strength");
  g.release();
  assert.equal(g.current.id, "a");
});
test("victory raises both hands continuously, with planted feet and fixed bones", async () => {
  const { celebrationPose, summitPose } = await import("../src/rig.js");
  const h = holdById("summit"),
    a = summitPose(h, 1),
    start = celebrationPose(h, 0);
  assert.ok(distance(a.body, start.body) < 1e-9);
  for (let i = 0; i < 2; i++) {
    assert.ok(distance(a.hands[i], start.hands[i]) < 1e-9);
    assert.ok(distance(a.arms[i].joint, start.arms[i].joint) < 1e-9);
  }
  let previous = start;
  for (let i = 1; i <= 240; i++) {
    const p = celebrationPose(h, i / 240);
    for (let k = 0; k < 2; k++) {
      assert.ok(distance(previous.hands[k], p.hands[k]) < 1);
      assert.ok(distance(a.feet[k], p.feet[k]) < 1e-9);
      assert.ok(
        Math.abs(distance(p.arms[k].root, p.arms[k].joint) - 21) < 1e-9,
      );
      assert.ok(Math.abs(distance(p.arms[k].joint, p.arms[k].tip) - 21) < 1e-9);
    }
    previous = p;
  }
  assert.ok(previous.hands.every((hand) => hand.y > previous.head.y + 15));
});
