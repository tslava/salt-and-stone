import { holds, holdById, selectTarget, plan, clamp } from "./route.js";
import { poseAt, summitPose, celebrationPose } from "./rig.js";
export class Game {
  constructor() {
    this.started = false;
    this.paused = false;
    this.state = "idle";
    this.current = holds[0];
    this.checkpoint = this.current;
    this.retreatTrail = [this.current.id];
    this.energy = 100;
    this.time = 0;
    this.idleTime = 0;
    this.gesture = null;
    this.selected = null;
    this.preparation = null;
    this.move = null;
    this.pose = poseAt(this.current);
    this.camera = { x: 200, y: this.current.y + 22 };
    this.deaths = 0;
    this.moves = 0;
    this.jumpCount = 0;
    this.stage = 1;
    this.events = [];
    this.history = [];
    this.maxY = this.current.y;
    this.fallTime = 0;
    this.fade = 0;
  }
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  start() {
    this.started = true;
    this.emit("start");
  }
  get targets() {
    return holds.filter((h) => {
      if (h.id === this.current.id) return false;
      const p = this.previewFor(h, Infinity);
      return p.reason !== "Слишком далеко" && !p.obstacle;
    });
  }
  get selectionPreview() {
    return this.selected
      ? this.previewFor(holdById(this.selected), Infinity)
      : null;
  }
  select(id) {
    if (!this.started || this.paused || this.state !== "idle") return false;
    if (!this.targets.some((h) => h.id === id)) return false;
    this.selected = id;
    return true;
  }
  confirm() {
    if (!this.started || this.paused || this.state !== "idle") return false;
    const p = this.selectionPreview;
    if (!p) return false;
    if (!p.ready) {
      this.emit("rejected", { reason: p.reason });
      return false;
    }
    if (p.jump) {
      this.preparation = { ...p, elapsed: 0 };
      this.state = "preparing";
      return true;
    }
    return this.commit(p);
  }
  begin(x, y, id = 1) {
    if (!this.started || this.paused || this.state !== "idle" || this.gesture)
      return false;
    this.gesture = {
      x,
      y,
      dx: 0,
      dy: 0,
      id,
      held: 0,
      target: null,
      preview: null,
      presented: false,
      cancelled: false,
      directed: false,
      travelled: false,
      lockedAt: -Infinity,
      pending: undefined,
      pendingAt: 0,
    };
    this.aim(x, y);
    return true;
  }
  get retreatTarget() {
    return this.retreatTrail.length > 1
      ? holdById(this.retreatTrail.at(-2))
      : null;
  }
  previewFor(target, held) {
    return plan(
      this.current,
      target,
      held,
      this.energy,
      target.id === this.retreatTarget?.id,
    );
  }
  aim(x, y) {
    const g = this.gesture;
    if (!g) return;
    g.dx = x - g.x;
    g.dy = g.y - y;
    const radius = Math.hypot(g.dx, g.dy);
    if (radius > 32) g.travelled = true;
    g.cancelled = g.travelled && radius < (g.cancelled ? 32 : 22);
    this.updateSelection();
  }
  updateSelection() {
    const g = this.gesture;
    if (!g) return;
    if (g.cancelled) {
      g.target = null;
      g.preview = null;
      g.pending = undefined;
      g.directed = false;
      g.presented = false;
      return;
    }
    const candidate = selectTarget(
      this.current,
      g.dx,
      g.dy,
      g.directed ? g.target : null,
    );
    const id = candidate?.id || null;
    const directed = Math.hypot(g.dx, g.dy) >= 14;
    const adopt = () => {
      if (g.target !== id) g.presented = false;
      g.target = id;
      g.lockedAt = this.time;
      g.pending = undefined;
    };
    // The first deliberate direction is immediate. Subsequent changes need both
    // a 300 ms magnet lock and 160 ms of consistent intent (240 ms to clear).
    if (!g.directed) {
      adopt();
      if (directed) g.directed = true;
    } else if (id === g.target) {
      g.pending = undefined;
    } else {
      if (g.pending !== id) {
        g.pending = id;
        g.pendingAt = this.time;
      }
      if (
        this.time - g.lockedAt >= 0.3 &&
        this.time - g.pendingAt >= (id ? 0.16 : 0.24)
      )
        adopt();
    }
    g.preview = g.target ? this.previewFor(holdById(g.target), g.held) : null;
  }
  present() {
    if (this.gesture) this.gesture.presented = true;
  }
  cancel() {
    this.selected = null;
    if (this.preparation) {
      this.preparation = null;
      this.state = "idle";
    }
    if (this.gesture) {
      this.gesture = null;
      this.emit("cancel");
    }
  }
  release(id = 1) {
    const g = this.gesture;
    if (!g || id !== g.id) return false;
    const p = g.preview;
    this.gesture = null;
    if (g.cancelled || !g.presented || !p) {
      this.emit("cancel");
      return false;
    }
    if (!p.ready) {
      this.emit("rejected", { reason: p.reason });
      return false;
    }
    return this.commit(p);
  }
  commit(p) {
    this.selected = null;
    this.preparation = null;
    this.energy -= p.cost;
    this.move = {
      ...p,
      fromNode: this.current,
      toNode: holdById(p.to),
      elapsed: 0,
      duration: p.jump ? 0.78 : 0.62,
    };
    this.state = "move";
    this.idleTime = 0;
    this.moves++;
    if (p.jump) this.jumpCount++;
    this.history.push({ preview: { ...p }, committed: p.to });
    this.emit("move", { jump: p.jump });
    return true;
  }
  pause() {
    if (!this.started || this.state === "complete") return;
    this.cancel();
    this.paused = true;
    this.emit("pause");
  }
  resume() {
    this.paused = false;
    this.emit("resume");
  }
  retry() {
    this.fade = 1;
    this.cancel();
    this.move = null;
    this.current = this.checkpoint;
    this.retreatTrail = [this.current.id];
    this.energy = 100;
    this.state = "idle";
    this.idleTime = 0;
    this.pose = poseAt(this.current);
    this.paused = false;
    this.camera = {
      x: clamp(this.current.x + 35, 200, 505),
      y: this.current.y + 25,
    };
    this.emit("retry");
  }
  reset() {
    const fresh = new Game();
    Object.assign(this, fresh);
    this.start();
  }
  update(dt) {
    dt = clamp(dt, 0, 0.04);
    if (this.paused) return;
    this.time += dt;
    this.fade = Math.max(0, this.fade - dt * 3);
    if (!this.started) {
      this.pose = poseAt(this.current, null, 0, false, this.time);
      return;
    }
    if (this.state === "idle") {
      this.idleTime += dt;
      if (this.current.rest && !this.gesture)
        this.energy = Math.min(100, this.energy + 27 * dt);
      else if (
        !this.current.rest &&
        this.idleTime > 4 &&
        !this.gesture?.preview?.retreat &&
        !this.selectionPreview?.retreat
      )
        this.energy = Math.max(0, this.energy - 1.7 * dt);
      if (this.gesture) {
        const g = this.gesture;
        g.held += dt;
        this.updateSelection();
      }
      this.pose = poseAt(this.current, null, 0, false, this.time);
      if (
        this.energy <= 0 &&
        this.idleTime > 4 &&
        !this.gesture?.preview?.retreat &&
        !this.selectionPreview?.retreat
      ) {
        this.cancel();
        this.state = "falling";
        this.fallTime = 0;
        this.deaths++;
        this.fallPose = this.pose;
        this.emit("fall");
      }
    } else if (this.state === "preparing") {
      const p = this.preparation;
      p.elapsed += dt;
      this.pose = poseAt(this.current, null, 0, false, this.time);
      if (p.elapsed >= p.required) {
        const checked = this.previewFor(holdById(p.to), p.elapsed);
        if (checked.ready) this.commit(checked);
        else {
          this.cancel();
          this.emit("rejected", { reason: checked.reason });
        }
      }
    } else if (this.state === "move") {
      const m = this.move;
      m.elapsed += dt;
      const t = clamp(m.elapsed / m.duration, 0, 1);
      this.pose = poseAt(m.fromNode, m.toNode, t, m.jump, this.time);
      if (t >= 1) {
        this.current = m.toNode;
        if (m.retreat) this.retreatTrail.pop();
        else this.retreatTrail.push(this.current.id);
        this.move = null;
        this.state = "idle";
        this.maxY = Math.max(this.maxY, this.current.y);
        if (this.current.rest) {
          this.checkpoint = this.current;
          this.retreatTrail = [this.current.id];
          this.emit("rest", { label: this.current.label });
        }
        const nextStage = this.current.x > 350 ? 2 : 1;
        if (nextStage !== this.stage) {
          this.stage = nextStage;
          this.emit("stage", { stage: nextStage });
        }
        if (this.current.final) {
          this.state = "mantle";
          this.mantleTime = 0;
        }
        this.emit("catch");
      }
    } else if (this.state === "mantle") {
      this.mantleTime += dt;
      this.pose = summitPose(this.current, Math.min(1, this.mantleTime / 1.25));
      if (this.mantleTime >= 1.25) {
        this.state = "celebrate";
        this.celebrationTime = 0;
      }
    } else if (this.state === "celebrate") {
      this.celebrationTime += dt;
      this.pose = celebrationPose(
        this.current,
        Math.min(1, this.celebrationTime / 1.1),
      );
      if (this.celebrationTime >= 1.9) {
        this.state = "complete";
        this.emit("complete");
      }
    } else if (this.state === "falling") {
      this.fallTime += dt;
      if (this.fallTime > 1) {
        this.retry();
      }
    }
    if (this.selected) return;
    const targetX = clamp(this.current.x + 35, 200, 505);
    const lookBelow = this.gesture?.target
      ? holdById(this.gesture.target)
      : this.energy < 30
        ? this.retreatTarget
        : null;
    const lookDown = lookBelow
      ? Math.min(70, Math.max(0, this.current.y - lookBelow.y) * 0.55)
      : 0;
    const lookUp = this.gesture?.target
      ? Math.min(
          50,
          Math.max(0, holdById(this.gesture.target).y - this.current.y - 60) *
            0.6,
        )
      : 0;
    const targetY =
      (this.move
        ? this.current.y + (this.move.toNode.y - this.current.y) * 0.6
        : this.current.y) +
      22 -
      lookDown +
      lookUp;
    const f = 1 - Math.exp(-dt * 3.8);
    this.camera.x += (targetX - this.camera.x) * f;
    this.camera.y += (targetY - this.camera.y) * f;
  }
}
