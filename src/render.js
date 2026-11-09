import { cliffs } from "./art.js";
import { holds, holdById, obstacles, trajectory, clamp } from "./route.js";
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.mode = new URLSearchParams(location.search).get("art") || "color";
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.bounds = r;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.scale = Math.min(this.w / 400, Math.max(100, this.h - 330) / 360);
    this.anchor = (140 + this.h - 254) / 2;
    this.centerX = this.w / 2;
    if (this.w > this.h && this.h < 500) {
      this.scale = Math.min((this.w - 280) / 400, (this.h - 120) / 360);
      this.centerX = (this.w - 280) / 2;
      this.anchor = (100 + this.h) / 2;
    }
  }
  rounded(points, fill, radius = 8) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        d = points[(i + 1) % points.length];
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]),
        bd = Math.hypot(d[0] - b[0], d[1] - b[1]);
      const r = Math.min(radius, ab * 0.24, bd * 0.24);
      const p = [
          b[0] + ((a[0] - b[0]) * r) / ab,
          b[1] + ((a[1] - b[1]) * r) / ab,
        ],
        q = [b[0] + ((d[0] - b[0]) * r) / bd, b[1] + ((d[1] - b[1]) * r) / bd];
      if (i) c.lineTo(...p);
      else c.moveTo(...p);
      c.quadraticCurveTo(...b, ...q);
    }
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
  }
  path(points, fill, stroke = null, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (fill) {
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  line(points, color, width = 1) {
    this.path(points, null, color, width);
  }
  circle(x, y, r, color) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }
  gradient(x, y, x2, y2, stops) {
    const g = this.ctx.createLinearGradient(x, y, x2, y2);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  }
  background(game) {
    const c = this.ctx,
      w = this.w,
      h = this.h,
      t = game.time;
    const horizon = h * 0.46 + Math.min(70, game.camera.y * 0.035);
    c.fillStyle = this.gradient(0, 0, 0, horizon, [
      "#776783",
      "#b58994",
      "#e8b09b",
    ]);
    c.fillRect(0, 0, w, h);
    const sunX = w * 0.81 - game.camera.x * 0.02;
    const glow = c.createRadialGradient(
      sunX,
      horizon - 80,
      3,
      sunX,
      horizon - 80,
      155,
    );
    glow.addColorStop(0, "#ffdbc24a");
    glow.addColorStop(1, "#ffd5aa00");
    c.fillStyle = glow;
    c.fillRect(0, 0, w, horizon);
    this.circle(sunX, horizon - 82, 25, "#ffdbb3");
    for (let i = 0; i < 6; i++) {
      const y = 80 + i * 35;
      const x = i % 2 ? w * 0.6 : w * 0.1;
      c.fillStyle = this.gradient(x, y, x + 180, y, [
        "#edd5c900",
        "#e8c2ba20",
        "#edd5c900",
      ]);
      c.fillRect(x - 60, y, 240, 2 + (i % 3));
    }
    c.fillStyle = this.gradient(0, horizon, 0, h, [
      "#77848b",
      "#4d737e",
      "#294652",
    ]);
    c.fillRect(0, horizon, w, h - horizon);
    this.path(
      [
        [0, horizon + 18],
        [w * 0.13, horizon + 6],
        [w * 0.27, horizon + 10],
        [w * 0.32, horizon - 13],
        [w * 0.37, horizon - 16],
        [w * 0.4, horizon - 1],
        [w * 0.49, horizon + 8],
        [w * 0.6, horizon + 20],
        [w, horizon + 25],
        [w, horizon + 36],
        [0, horizon + 36],
      ],
      "#8c829060",
    );
    for (let i = 0; i < 46; i++) {
      const f = i / 46,
        y = horizon + 8 + f * f * (h - horizon);
      const len = 8 + f * 65;
      const x = ((i * 83.7 + Math.sin(t * 0.3 + i) * 6) % (w + 80)) - 40;
      this.line(
        [
          [x, y],
          [x + len, y],
        ],
        i % 4 === 0 ? "#ddc4b44a" : "#b1bec02b",
        0.6 + f * 0.7,
      );
      const sx = sunX + Math.sin(i * 19) * f * 48;
      this.line(
        [
          [sx - len * 0.2, y],
          [sx + len * 0.4, y],
        ],
        "#f4c6a22a",
        1,
      );
    }
    // Remote stacks share a common bed but recede into marine haze.
    c.save();
    c.translate(w * 0.95 - game.camera.x * 0.06, horizon + 110);
    c.scale(0.34, -0.4);
    this.path(cliffs[0].outline, "#7d788783");
    c.translate(-470, -45);
    c.scale(0.55, 0.64);
    this.path(cliffs[1].outline, "#a38d9866");
    c.restore();
    for (let i = 0; i < 3; i++) {
      const x = w * 0.68 + Math.sin(t * 0.06 + i * 2) * w * 0.25,
        y = 150 + i * 29 + Math.cos(t * 0.14 + i) * 8;
      const flap = Math.sin(t * 3 + i) * 2;
      const c = this.ctx;
      c.strokeStyle = "#4b485666";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - 5, y + flap);
      c.quadraticCurveTo(x - 2, y + 3, x, y);
      c.quadraticCurveTo(x + 2, y + 3, x + 6, y + flap);
      c.stroke();
    }
  }
  pine(x, y, s = 1) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    this.line(
      [
        [0, 0],
        [3, 12],
        [1, 24],
        [7, 37],
      ],
      "#343939",
      3,
    );
    this.line(
      [
        [3, 14],
        [-7, 22],
        [-13, 22],
      ],
      "#343939",
      1.5,
    );
    this.path(
      [
        [-18, 23],
        [-12, 28],
        [-8, 27],
        [-4, 30],
        [3, 25],
        [1, 21],
      ],
      "#47554b",
    );
    this.path(
      [
        [-10, 30],
        [-4, 37],
        [0, 36],
        [5, 43],
        [10, 39],
        [17, 38],
        [19, 33],
        [9, 30],
      ],
      "#414b43",
    );
    this.path(
      [
        [-5, 36],
        [0, 40],
        [5, 43],
        [10, 39],
        [16, 39],
        [9, 37],
      ],
      "#71806a",
    );
    this.line(
      [
        [0, 2],
        [4, 5],
        [7, 4],
      ],
      "#af9e7b",
      1,
    );
    c.restore();
  }
  cliff(rock, index) {
    const c = this.ctx,
      gray = this.mode === "clay",
      sil = this.mode === "silhouette";
    this.rounded(rock.outline, sil ? "#373737" : "#463440", 12);
    if (sil) return;
    c.save();
    this.rounded(rock.outline, null, 12);
    c.clip();
    const tones = gray
      ? ["#9d9d9d", "#818181", "#575757", "#303030"]
      : ["#a17a73", "#76565b", "#503c49", "#302a38"];
    for (const p of rock.planes) {
      const xs = p.points.map((v) => v[0]);
      const min = Math.min(...xs),
        max = Math.max(...xs);
      const color = tones[p.tone];
      const g = this.gradient(min, 900, max, -200, [
        color,
        p.tone === 0 ? (gray ? "#777777" : "#72535a") : color,
      ]);
      this.rounded(p.points, g, 8);
      c.save();
      this.path(p.points, null);
      c.clip();
      const sheen = c.createLinearGradient(min, 0, max, 0);
      sheen.addColorStop(
        0,
        p.tone === 0 ? (gray ? "#ffffff25" : "#ffd4a823") : "#00000000",
      );
      sheen.addColorStop(0.38, "#ffffff00");
      sheen.addColorStop(1, "#1b1b242b");
      c.fillStyle = sheen;
      c.fillRect(min, -300, max - min, 1600);
      c.restore();
    }
    for (const bed of rock.beds) {
      const top = bed.map(([x, y]) => [x, y + 2]);
      const bottom = bed
        .slice()
        .reverse()
        .map(([x, y], i) => [x + (i === 0 ? 2 : -1), y - 5 - (i % 2) * 3]);
      this.path([...bed, ...bottom], gray ? "#4c4c4c" : "#42313d");
      this.line(top, gray ? "#a5a5a5" : "#b18a7b", 1.3);
    }
    for (const crack of rock.cracks) {
      this.line(crack, gray ? "#484848" : "#48363e", 0.8);
      this.line(
        crack.map(([x, y]) => [x + 2, y]),
        gray ? "#8c8c8c" : "#ad877624",
        0.7,
      );
    }
    c.restore();
    if (this.mode === "color") {
      // Sparse, low-contrast mineral streaks follow each face; the volume exists without them.
      c.save();
      c.beginPath();
      rock.outline.forEach(([x, y], i) =>
        i ? c.lineTo(x, y) : c.moveTo(x, y),
      );
      c.closePath();
      c.clip();
      for (let i = 0; i < 33; i++) {
        const x = (index ? 370 : 50) + i * 8.1,
          y = 20 + ((i * 71) % 1020);
        this.line(
          [
            [x, y],
            [x + 3, y + 19],
            [x + 1, y + 48],
          ],
          "#e3b19709",
          0.7,
        );
      }
      c.restore();
      for (const p of rock.plants) this.pine(...p);
    }
  }
  lip(x, y, w, rest = false) {
    const gray = this.mode === "clay";
    this.path(
      [
        [x - w / 2 - 2, y - 3],
        [x - w / 2, y],
        [x + w * 0.25, y + 1],
        [x + w / 2 + 2, y - 1],
        [x + w / 2 - 1, y - 7],
        [x - 2, y - 9],
      ],
      gray ? "#676767" : "#654e54",
    );
    this.path(
      [
        [x - w / 2, y],
        [x + w * 0.25, y + 1],
        [x + w / 2 + 2, y - 1],
        [x + w / 2 - 1, y - 3],
        [x - w / 2 - 2, y - 3],
      ],
      gray ? "#b8b8b8" : rest ? "#b7ae8c" : "#c49b80",
    );
    this.line(
      [
        [x - w / 2 - 2, y - 8],
        [x + 2, y - 10],
        [x + w / 2 - 1, y - 7],
      ],
      gray ? "#404040" : "#352c39",
      1.5,
    );
  }
  supports(game) {
    for (const h of holds) {
      this.lip(h.x, h.y, 24);
      if (h.rest) {
        if (h.final) this.lip(h.x, h.y, 65, true);
        this.lip(h.x, h.y - 61, 65, true);
        if (this.mode === "color") {
          this.pine(h.x + 24, h.y - 60, 0.38);
          this.line(
            [
              [h.x + 34, h.y - 56],
              [h.x + 37, h.y - 49],
              [h.x + 36, h.y - 57],
              [h.x + 42, h.y - 53],
            ],
            "#a9ad86",
            1.3,
          );
        }
      } else {
        this.lip(h.x - 13, h.y - 61, 9);
        this.lip(h.x + 14, h.y - 58, 9);
      }
      if (this.mode === "color") {
        this.line(
          [
            [h.x - 6, h.y + 1],
            [h.x - 1, h.y + 2],
          ],
          "#f7dac4a0",
          1.5,
        );
        this.line(
          [
            [h.x + 5, h.y + 1],
            [h.x + 9, h.y + 1],
          ],
          "#f7dac466",
          1,
        );
      }
    }
    for (const o of obstacles) {
      this.path(
        [
          [o.x, o.y],
          [o.x, o.y + o.h * 0.8],
          [o.x + 8, o.y + o.h],
          [o.x + o.w, o.y + o.h - 4],
          [o.x + o.w, o.y + 4],
          [o.x + o.w, o.y],
        ],
        this.mode === "clay" ? "#555" : "#543b45",
      );
      this.path(
        [
          [o.x, o.y + o.h * 0.8],
          [o.x + 8, o.y + o.h],
          [o.x + o.w, o.y + o.h - 4],
          [o.x + o.w - 2, o.y + o.h - 8],
          [o.x + 2, o.y + o.h - 5],
        ],
        this.mode === "clay" ? "#aaa" : "#b08773",
      );
    }
  }
  hero(game) {
    const p = game.pose,
      c = this.ctx;
    c.save();
    if (game.state === "falling") {
      c.translate(0, -game.fallTime * game.fallTime * 480);
      c.translate(p.body.x, p.body.y);
      c.rotate(game.fallTime * 0.6);
      c.translate(-p.body.x, -p.body.y);
    }
    c.lineCap = "round";
    c.lineJoin = "round"; // Small offset contact shadow preserves separation from rock.
    const drawLimb = (l, col, width) => {
      this.line(
        [
          [l.root.x + 2, l.root.y - 1],
          [l.joint.x + 2, l.joint.y - 1],
          [l.tip.x + 2, l.tip.y - 1],
        ],
        "#251f2c66",
        width + 2,
      );
      this.line(
        [
          [l.root.x, l.root.y],
          [l.joint.x, l.joint.y],
          [l.tip.x, l.tip.y],
        ],
        col,
        width,
      );
    };
    for (const l of p.legs) drawLimb(l, "#263b46", 6.5);
    for (const l of p.legs)
      this.line(
        [
          [l.tip.x - 2, l.tip.y],
          [l.tip.x + 4, l.tip.y],
        ],
        "#e1bba2",
        4,
      );
    this.path(
      [
        [p.body.x - 7, p.body.y - 2],
        [p.body.x + 7, p.body.y - 1],
        [p.body.x + 10, p.body.y + 16],
        [p.body.x + 4, p.body.y + 19],
        [p.body.x - 6, p.body.y + 19],
        [p.body.x - 10, p.body.y + 15],
      ],
      "#edd3ad",
    );
    this.path(
      [
        [p.body.x + 1, p.body.y],
        [p.body.x + 7, p.body.y - 1],
        [p.body.x + 10, p.body.y + 16],
        [p.body.x + 4, p.body.y + 19],
        [p.body.x + 3, p.body.y + 8],
      ],
      "#bf967d",
    );
    for (const l of p.arms) {
      drawLimb(l, "#e3b496", 4.5);
      this.circle(l.tip.x, l.tip.y, 2.7, "#fce0bf");
    }
    this.line(
      [
        [p.body.x - 7, p.body.y + 3],
        [p.body.x + 7, p.body.y + 2],
      ],
      "#80544c",
      3,
    );
    this.path(
      [
        [p.body.x - 7, p.body.y + 7],
        [p.body.x + 1, p.body.y + 5],
        [p.body.x + 6, p.body.y + 12],
        [p.body.x + 5, p.body.y + 18],
        [p.body.x - 2, p.body.y + 18],
        [p.body.x - 8, p.body.y + 19],
      ],
      "#b65e49",
    );
    this.line(
      [
        [p.body.x - 6, p.body.y + 18],
        [p.body.x + 2, p.body.y + 18],
      ],
      "#dc9470",
      1.5,
    );
    this.circle(p.head.x, p.head.y, 6, "#e3b397");
    this.path(
      [
        [p.head.x - 6, p.head.y],
        [p.head.x - 7, p.head.y + 4],
        [p.head.x - 4, p.head.y + 8],
        [p.head.x + 3, p.head.y + 8],
        [p.head.x + 6, p.head.y + 4],
        [p.head.x + 6, p.head.y + 1],
      ],
      "#f4d5aa",
    );
    this.line(
      [
        [p.head.x - 4, p.head.y + 7],
        [p.head.x + 2, p.head.y + 8],
      ],
      "#fff1d0",
      1.3,
    );
    c.restore();
  }
  preview(game) {
    const p = game.selectionPreview;
    if (!p || game.paused) return;
    const h = holdById(p.to),
      a = game.current,
      c = this.ctx;
    c.save();
    c.strokeStyle = "#ffe1ad";
    c.lineWidth = 2 / this.scale;
    c.globalAlpha = 0.8;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const q = trajectory(a, h, i / 40, p.jump);
      i ? c.lineTo(q.x, q.y + 7) : c.moveTo(q.x, q.y + 7);
    }
    c.stroke();
    c.restore();
  }
  draw(game) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background(game);
    c.save();
    c.translate(this.centerX, this.anchor);
    c.scale(this.scale, -this.scale);
    c.translate(-game.camera.x, -game.camera.y);
    this.cliff(cliffs[1], 1);
    this.cliff(cliffs[0], 0);
    if (this.mode !== "silhouette") {
      this.supports(game);
      this.hero(game);
      this.preview(game);
    }
    c.restore();
    const shade = this.gradient(0, 0, 0, this.h, [
      "#2e25311a",
      "#30222e00",
      "#17273235",
    ]);
    c.fillStyle = shade;
    c.fillRect(0, 0, this.w, this.h);
    if (game.fade > 0) {
      c.fillStyle = `rgba(40,37,47,${game.fade})`;
      c.fillRect(0, 0, this.w, this.h);
    }
    if (game.state === "falling" && game.fallTime > 0.65) {
      c.fillStyle = `rgba(40,37,47,${clamp((game.fallTime - 0.65) / 0.3, 0, 1)})`;
      c.fillRect(0, 0, this.w, this.h);
    }
  }
  worldToScreen(p, game) {
    return {
      x: this.centerX + (p.x - game.camera.x) * this.scale,
      y: this.anchor - (p.y - game.camera.y) * this.scale,
    };
  }
}
