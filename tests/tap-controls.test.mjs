import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/engine.js";
import { holdById } from "../src/route.js";
function tick(g, seconds) {
  for (let t = 0; t < seconds; t += 1 / 120) g.update(1 / 120);
}
function step(g, id) {
  assert.ok(g.select(id), `select ${id} from ${g.current.id}`);
  assert.ok(g.confirm(), `confirm ${id}: ${g.selectionPreview?.reason}`);
  tick(g, 2);
  assert.equal(g.current.id, id);
}
test("tap selects without moving, switches immediately, and locks the camera", () => {
  const g = new Game();
  g.start();
  assert.equal(g.select("summit"), false);
  assert.ok(g.select("a"));
  const camera = { ...g.camera };
  tick(g, 1);
  assert.deepEqual(g.camera, camera);
  assert.equal(g.moves, 0);
  assert.ok(g.select("b"));
  assert.equal(g.selected, "b");
  g.cancel();
  assert.equal(g.confirm(), false);
  step(g, "a");
  assert.equal(g.moves, 1);
});
test("jump prepares automatically; cancellation and pause cannot leave a queued move", () => {
  const g = new Game();
  g.start();
  step(g, "a");
  step(g, "b");
  const energy = g.energy;
  for (const interrupt of [
    () => g.cancel(),
    () => g.pause(),
    () => g.retry(),
  ]) {
    g.current = holdById("b");
    g.energy = energy;
    assert.ok(g.select("c"));
    assert.ok(g.confirm());
    assert.equal(g.state, "preparing");
    assert.equal(g.confirm(), false);
    assert.equal(g.select("a"), false);
    tick(g, 0.1);
    assert.equal(g.energy, energy);
    interrupt();
    g.resume();
    tick(g, 1);
    assert.equal(g.moves, 2);
    assert.equal(g.preparation, null);
  }
  g.current = holdById("b");
  g.energy = energy;
  step(g, "c");
  assert.equal(g.moves, 3);
  assert.equal(g.jumpCount, 1);
});
test("confirm rechecks stamina, while zero-energy retreat works including a jump", () => {
  const g = new Game();
  g.start();
  step(g, "a");
  step(g, "b");
  step(g, "c");
  g.select("r1");
  g.energy = 0.01;
  assert.equal(g.confirm(), false);
  assert.equal(g.state, "idle");
  for (const id of ["b", "a", "s"]) step(g, id);
  assert.equal(g.deaths, 0);
  tick(g, 4);
  assert.equal(g.energy, 100);
});
test("the whole careful route completes with direct selection and confirmation", () => {
  const g = new Game();
  g.start();
  for (const id of [
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
  ]) {
    if (g.current.rest) tick(g, 4);
    step(g, id);
  }
  tick(g, 4);
  assert.equal(g.state, "complete");
  assert.equal(g.moves, 26);
  assert.equal(g.deaths, 0);
});
