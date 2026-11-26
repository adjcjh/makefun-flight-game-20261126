// Drawing only: world state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred. The 3D view
// is a small perspective projection onto canvas 2D: sky and sun, distant
// ridges, a height-shaded terrain mesh, the runway, the ring course,
// clouds, the aircraft (chase or cockpit), then the instrument HUD.
import { COURSE, FIELD, FONT, MONO, PALETTE, RUNWAY } from './config.js';
import { terrainHeight } from './world.js';
import { hash2, valueNoise } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export const CAMERA_CHASE = 'chase';
export const CAMERA_COCKPIT = 'cockpit';

const FOCAL = 1040;
const ROWS = 58;
const COLS = 44;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgb(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const SKY_TOP = [38, 84, 160];
const SKY_MID = [110, 168, 225];
const HORIZON = [252, 214, 160];
const HAZE = [196, 216, 235];
const WATER = [46, 110, 178];
const SAND = [216, 196, 150];
const GRASS_A = [86, 158, 74];
const GRASS_B = [64, 132, 60];
const FIELD_GOLD = [196, 168, 84];
const ROCK = [128, 122, 116];
const SNOW = [240, 244, 248];

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, font) {
    context.font = `${size}px ${font || FONT}`;
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h) {
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(x, y, w, h, 12);
    context.fill();
    context.stroke();
  }

  // Camera basis for this frame, filled by setupCamera.
  const cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0 };

  function setupCamera(state) {
    const plane = state.plane;
    const heading = plane.heading;
    const pitch = plane.pitch * 0.55;
    const back = 34;
    const up = 10;
    cam.x = plane.x - Math.sin(heading) * back;
    cam.z = plane.z - Math.cos(heading) * back;
    cam.y = plane.y + up - Math.sin(plane.pitch) * 6;
    cam.fx = Math.sin(heading) * Math.cos(pitch);
    cam.fy = Math.sin(pitch);
    cam.fz = Math.cos(heading) * Math.cos(pitch);
    cam.rx = Math.cos(heading);
    cam.rz = -Math.sin(heading);
    // up = forward x right
    cam.ux = cam.fy * cam.rz - cam.fz * 0;
    cam.uy = cam.fz * cam.rx - cam.fx * cam.rz;
    cam.uz = cam.fx * 0 - cam.fy * cam.rx;
    const len = Math.hypot(cam.ux, cam.uy, cam.uz) || 1;
    cam.ux /= len;
    cam.uy /= len;
    cam.uz /= len;
  }

  /** Project a world point; returns [sx, sy, depth] or null when behind. */
  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const depth = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (depth < 4) return null;
    const side = dx * cam.rx + dz * cam.rz;
    const up = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    return [FIELD.width / 2 + (side / depth) * FOCAL, FIELD.height / 2 - (up / depth) * FOCAL, depth];
  }

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, rgb(SKY_TOP));
    gradient.addColorStop(0.45, rgb(SKY_MID));
    gradient.addColorStop(0.72, rgb(HORIZON));
    gradient.addColorStop(1, rgb(HAZE));
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Sun: fixed world direction, projected like everything else.
    const sun = project(cam.x + 2600, cam.y + 1150, cam.z + 4200);
    if (sun) {
      const glow = context.createRadialGradient(sun[0], sun[1], 4, sun[0], sun[1], 190);
      glow.addColorStop(0, 'rgba(255,244,200,0.95)');
      glow.addColorStop(0.18, 'rgba(255,226,150,0.55)');
      glow.addColorStop(1, 'rgba(255,226,150,0)');
      context.fillStyle = glow;
      context.fillRect(sun[0] - 190, sun[1] - 190, 380, 380);
      context.fillStyle = '#fff6d8';
      context.beginPath();
      context.arc(sun[0], sun[1], 26, 0, Math.PI * 2);
      context.fill();
    }

    // Two distant ridge silhouettes, scrolling with heading.
    const heading = state.plane.heading;
    for (let layer = 0; layer < 2; layer += 1) {
      const base = FIELD.height * (0.52 + layer * 0.035);
      const amp = 120 - layer * 38;
      context.fillStyle = layer === 0 ? 'rgba(92,120,168,0.55)' : 'rgba(70,104,92,0.65)';
      context.beginPath();
      context.moveTo(0, FIELD.height);
      for (let sx = 0; sx <= FIELD.width; sx += 32) {
        const a = heading + (sx / FIELD.width - 0.5) * 1.5 + layer * 2.7;
        const h = valueNoise(a * 3.1, layer * 5.3, 41) * amp + valueNoise(a * 9.7, layer, 97) * amp * 0.35;
        context.lineTo(sx, base - h);
      }
      context.lineTo(FIELD.width, FIELD.height);
      context.closePath();
      context.fill();
    }
  }

  function terrainColor(x, z, h, seed, depth, light) {
    let color;
    if (h < 0.5) {
      color = WATER;
    } else if (h < 7) {
      color = SAND;
    } else if (h > 300) {
      color = SNOW;
    } else {
      const slope = Math.abs(terrainHeight(x + 34, z, seed) - h) + Math.abs(terrainHeight(x, z + 34, seed) - h);
      const patch = hash2(Math.floor(x / 190), Math.floor(z / 190), seed + 3);
      const base = patch > 0.86 ? FIELD_GOLD : patch > 0.45 ? GRASS_A : GRASS_B;
      const rockT = clamp((slope - 20) / 26, 0, 0.85);
      color = mixColor(base, ROCK, rockT);
      const shade = clamp(0.86 + (h / 260) * 0.22 + light, 0.72, 1.14);
      color = [color[0] * shade, color[1] * shade, color[2] * shade];
    }
    const hazeT = clamp(depth / 6800, 0, 0.55);
    return rgb(mixColor(color, HAZE, hazeT));
  }

  function drawTerrain(state) {
    const seed = state.seed;
    // Grid points in camera space, projected once per frame.
    const points = [];
    for (let row = 0; row <= ROWS; row += 1) {
      const dist = 26 * Math.pow(1.115, row);
      const rowPoints = [];
      for (let col = 0; col <= COLS; col += 1) {
        const lat = (col / COLS - 0.5) * dist * 2.0;
        const wx = cam.x + cam.fx * dist + cam.rx * lat;
        const wz = cam.z + cam.fz * dist + cam.rz * lat;
        const h = terrainHeight(wx, wz, seed);
        const p = project(wx, h, wz);
        rowPoints.push(p ? { sx: p[0], sy: p[1], wx, wz, h, depth: dist } : null);
      }
      points.push(rowPoints);
    }
    // Painter's order: far rows first.
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      for (let col = 0; col < COLS; col += 1) {
        const a = points[row][col];
        const b = points[row][col + 1];
        const c = points[row + 1][col + 1];
        const d = points[row + 1][col];
        if (!a || !b || !c || !d) continue;
        const light = clamp((a.h - d.h) / 90, -0.12, 0.12);
        context.fillStyle = terrainColor(a.wx, a.wz, a.h, seed, a.depth, light);
        context.strokeStyle = context.fillStyle;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(a.sx, a.sy);
        context.lineTo(b.sx, b.sy);
        context.lineTo(c.sx, c.sy);
        context.lineTo(d.sx, d.sy);
        context.closePath();
        context.fill();
        context.stroke();
      }
    }
  }

  function drawRunway(state) {
    const halfW = RUNWAY.width / 2;
    const halfL = RUNWAY.length / 2;
    const corners = [
      project(RUNWAY.x - halfW, 8.6, RUNWAY.z - halfL),
      project(RUNWAY.x + halfW, 8.6, RUNWAY.z - halfL),
      project(RUNWAY.x + halfW, 8.6, RUNWAY.z + halfL),
      project(RUNWAY.x - halfW, 8.6, RUNWAY.z + halfL),
    ];
    if (corners.some((p) => !p)) return;
    context.fillStyle = '#2c3138';
    context.beginPath();
    corners.forEach((p, i) => (i === 0 ? context.moveTo(p[0], p[1]) : context.lineTo(p[0], p[1])));
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.lineWidth = 2;
    context.stroke();

    // Centreline dashes and edge lights.
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let z = -halfL + 40; z < halfL - 40; z += 90) {
      const a = project(RUNWAY.x, 9.1, RUNWAY.z + z);
      const b = project(RUNWAY.x, 9.1, RUNWAY.z + z + 42);
      if (!a || !b) continue;
      context.lineWidth = clamp(320 / a[2], 1, 5);
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();
    }
    const blink = Math.floor(state.elapsed * 2) % 2 === 0;
    for (let z = -halfL; z <= halfL; z += 98) {
      for (const sideSign of [-1, 1]) {
        const p = project(RUNWAY.x + sideSign * (halfW + 4), 9.4, RUNWAY.z + z);
        if (!p) continue;
        context.fillStyle = blink ? '#ffd76a' : '#c9a23f';
        context.beginPath();
        context.arc(p[0], p[1], clamp(90 / p[2], 1.2, 4), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawRings(state) {
    const rings = state.rings;
    // Far to near so nearer rings paint over farther ones.
    const order = rings.map((ring, i) => ({ ring, i })).sort((a, b) => {
      const da = Math.hypot(a.ring.x - cam.x, a.ring.z - cam.z);
      const db = Math.hypot(b.ring.x - cam.x, b.ring.z - cam.z);
      return db - da;
    });
    for (const { ring, i } of order) {
      const p = project(ring.x, ring.y, ring.z);
      if (!p) continue;
      const radius = (COURSE.ringRadius / p[2]) * FOCAL;
      if (radius < 3) continue;
      const isNext = i === state.ringIndex;
      const pulse = 0.75 + 0.25 * Math.sin(state.elapsed * 4);
      let color;
      if (ring.passed) color = `rgba(93,255,157,${0.25 + ring.flash * 0.7})`;
      else if (isNext) color = `rgba(255,200,87,${pulse})`;
      else color = 'rgba(94,234,212,0.55)';

      if (isNext) {
        const ground = project(ring.x, Math.max(terrainHeight(ring.x, ring.z, state.seed), 0), ring.z);
        if (ground) {
          context.strokeStyle = 'rgba(255,200,87,0.35)';
          context.lineWidth = clamp(radius * 0.14, 2, 10);
          context.beginPath();
          context.moveTo(p[0], p[1]);
          context.lineTo(ground[0], ground[1]);
          context.stroke();
        }
      }
      context.strokeStyle = color;
      context.lineWidth = clamp(radius * 0.09, 2, 12);
      context.beginPath();
      context.arc(p[0], p[1], radius, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(p[0], p[1], radius * 0.93, 0, Math.PI * 2);
      context.stroke();
      if (isNext && radius > 14) {
        text(`${i + 1}`, p[0], p[1] + radius + 22, 20, PALETTE.amber, 'center', MONO);
      }
    }
  }

  function drawClouds(state) {
    for (const cloud of state.clouds) {
      const p = project(cloud.x, cloud.y, cloud.z);
      if (!p || p[2] > 9500) continue;
      const w = (cloud.scale / p[2]) * FOCAL;
      if (w < 8) continue;
      const alpha = clamp(0.85 - p[2] / 11000, 0.08, 0.55);
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      for (let puff = 0; puff < 4; puff += 1) {
        const ox = (puff - 1.5) * w * 0.3;
        const oy = Math.sin(puff * 2.1 + cloud.x) * w * 0.05;
        context.beginPath();
        context.ellipse(p[0] + ox, p[1] + oy, w * 0.36, w * 0.14, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = `rgba(180,198,220,${alpha * 0.5})`;
      context.beginPath();
      context.ellipse(p[0], p[1] + w * 0.07, w * 0.55, w * 0.1, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawAircraft(state) {
    const plane = state.plane;
    // Ground shadow.
    const groundY = Math.max(terrainHeight(plane.x, plane.z, state.seed), 0);
    const shadow = project(plane.x, groundY + 1, plane.z);
    if (shadow) {
      const agl = Math.max(plane.y - groundY, 1);
      const r = clamp(2600 / agl, 6, 60);
      context.fillStyle = `rgba(10,20,10,${clamp(0.4 - agl / 1400, 0.05, 0.35)})`;
      context.beginPath();
      context.ellipse(shadow[0], shadow[1], r, r * 0.32, 0, 0, Math.PI * 2);
      context.fill();
    }

    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.63 - plane.pitch * 60;
    context.save();
    context.translate(cx, cy);
    context.rotate(plane.roll * 0.85);
    const s = 1 + plane.speed / 900;
    context.scale(s, s);

    // Propeller blur at the nose.
    context.fillStyle = 'rgba(220,230,240,0.28)';
    context.beginPath();
    context.ellipse(0, -86, 46, 9, 0, 0, Math.PI * 2);
    context.fill();

    // Main wing.
    context.fillStyle = '#dfe7ee';
    context.beginPath();
    context.moveTo(-118, 6);
    context.lineTo(-30, -14);
    context.lineTo(30, -14);
    context.lineTo(118, 6);
    context.lineTo(112, 20);
    context.lineTo(-112, 20);
    context.closePath();
    context.fill();
    context.fillStyle = '#c33d2e';
    context.fillRect(-118, 6, 18, 12);
    context.fillRect(100, 6, 18, 12);

    // Tailplane and fin.
    context.fillStyle = '#dfe7ee';
    context.beginPath();
    context.moveTo(-52, 66);
    context.lineTo(52, 66);
    context.lineTo(44, 78);
    context.lineTo(-44, 78);
    context.closePath();
    context.fill();
    context.fillStyle = '#c33d2e';
    context.beginPath();
    context.moveTo(-4, 40);
    context.lineTo(4, 40);
    context.lineTo(3, 76);
    context.lineTo(-3, 76);
    context.closePath();
    context.fill();

    // Fuselage, nose toward the horizon.
    const body = context.createLinearGradient(0, -92, 0, 78);
    body.addColorStop(0, '#f4f8fb');
    body.addColorStop(0.55, '#cfd9e2');
    body.addColorStop(1, '#9fb0bf');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(0, -94);
    context.bezierCurveTo(17, -70, 19, -20, 15, 30);
    context.bezierCurveTo(12, 58, 6, 74, 0, 78);
    context.bezierCurveTo(-6, 74, -12, 58, -15, 30);
    context.bezierCurveTo(-19, -20, -17, -70, 0, -94);
    context.fill();

    // Canopy with a sky highlight.
    context.fillStyle = '#1d3a55';
    context.beginPath();
    context.ellipse(0, -26, 10.5, 24, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(160,215,255,0.75)';
    context.beginPath();
    context.ellipse(-3, -34, 4, 12, -0.2, 0, Math.PI * 2);
    context.fill();

    // Wingtip navigation lights.
    const blink = Math.floor(state.elapsed * 1.6) % 2 === 0;
    context.fillStyle = blink ? '#ff4444' : '#7a1f1f';
    context.beginPath();
    context.arc(-116, 12, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = blink ? '#44ff77' : '#1f7a33';
    context.beginPath();
    context.arc(116, 12, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCockpit(state) {
    const plane = state.plane;
    // Nose.
    context.fillStyle = '#aebfcc';
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 46, FIELD.height);
    context.lineTo(FIELD.width / 2, FIELD.height - 150);
    context.lineTo(FIELD.width / 2 + 46, FIELD.height);
    context.closePath();
    context.fill();
    // Dashboard.
    context.fillStyle = '#141c28';
    context.fillRect(0, FIELD.height - 128, FIELD.width, 128);
    context.fillStyle = '#1d2839';
    context.fillRect(0, FIELD.height - 128, FIELD.width, 10);
    // Three round gauges: horizon, speed, altitude.
    drawGauge(430, FIELD.height - 62, 44, (cx, cy, r) => {
      context.save();
      context.beginPath();
      context.arc(cx, cy, r - 4, 0, Math.PI * 2);
      context.clip();
      context.translate(cx, cy);
      context.rotate(-plane.roll);
      context.fillStyle = '#3f7fbf';
      context.fillRect(-r, -r + plane.pitch * 30, r * 2, r * 2);
      context.fillStyle = '#7a5c38';
      context.fillRect(-r, plane.pitch * 30, r * 2, r * 2);
      context.restore();
      context.strokeStyle = PALETTE.amber;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(cx - 16, cy);
      context.lineTo(cx + 16, cy);
      context.stroke();
    });
    drawGauge(640, FIELD.height - 62, 44, (cx, cy, r) => {
      needle(cx, cy, r, -2.2 + (plane.speed / 110) * 4.4);
      text('KT', cx, cy + 26, 13, PALETTE.muted, 'center', MONO);
    });
    drawGauge(850, FIELD.height - 62, 44, (cx, cy, r) => {
      needle(cx, cy, r, -2.2 + ((plane.y * 3.281) % 1000) / 1000 * 4.4);
      text('ALT', cx, cy + 26, 13, PALETTE.muted, 'center', MONO);
    });
  }

  function drawGauge(cx, cy, r, inner) {
    context.fillStyle = '#0b111c';
    context.strokeStyle = '#3d4c63';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    inner(cx, cy, r);
  }

  function needle(cx, cy, r, angle) {
    context.strokeStyle = PALETTE.text;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.sin(angle) * (r - 10), cy - Math.cos(angle) * (r - 10));
    context.stroke();
  }

  function drawHud(state, screen) {
    const plane = state.plane;
    const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
    const knots = Math.round(plane.speed * 1.944);
    const feet = Math.round(plane.y * 3.281);
    const agl = Math.max(0, Math.round((plane.y - Math.max(terrainHeight(plane.x, plane.z, state.seed), 0)) * 3.281));

    context.textBaseline = 'middle';

    // Compass tape.
    panel(FIELD.width / 2 - 270, 14, 540, 52);
    context.save();
    context.beginPath();
    context.rect(FIELD.width / 2 - 262, 18, 524, 44);
    context.clip();
    for (let d = -60; d <= 60; d += 5) {
      const degFloat = headingDeg + d;
      const deg = Math.round(((degFloat % 360) + 360) % 360);
      const x = FIELD.width / 2 + d * 4.2;
      const toMajor = ((degFloat % 30) + 30) % 30;
      const major = toMajor < 2.5 || toMajor > 27.5;
      context.strokeStyle = PALETTE.hud;
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, 22);
      context.lineTo(x, major ? 36 : 30);
      context.stroke();
      if (major) {
        const nearest = Math.round(degFloat / 30) * 30;
        const labelDeg = ((nearest % 360) + 360) % 360;
        const label = labelDeg === 0 ? 'N' : labelDeg === 90 ? 'E' : labelDeg === 180 ? 'S' : labelDeg === 270 ? 'W' : String(labelDeg / 10);
        text(label, x, 50, 17, PALETTE.hud, 'center', MONO);
      }
    }
    context.restore();
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 8, 14);
    context.lineTo(FIELD.width / 2 + 8, 14);
    context.lineTo(FIELD.width / 2, 26);
    context.closePath();
    context.fill();
    text(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, FIELD.width / 2, 84, 20, PALETTE.amber, 'center', MONO);

    // Speed tape (left) and altitude tape (right).
    drawTape(18, 150, 104, 320, knots, 10, 40, 2, 'KT', PALETTE.hud);
    drawTape(FIELD.width - 122, 150, 104, 320, feet, 100, 40, 2, 'FT', PALETTE.hud);
    text(`AGL ${agl}`, FIELD.width - 70, 492, 16, PALETTE.muted, 'center', MONO);

    // Flight-path marker and pitch ladder.
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;
    context.strokeStyle = PALETTE.hud;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, 12, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - 34, cy);
    context.lineTo(cx - 14, cy);
    context.moveTo(cx + 14, cy);
    context.lineTo(cx + 34, cy);
    context.moveTo(cx, cy - 26);
    context.lineTo(cx, cy - 14);
    context.stroke();
    context.strokeStyle = PALETTE.hudDim;
    for (const deg of [-20, -10, 10, 20]) {
      const y = cy + (deg * Math.PI / 180 - plane.pitch) * 320;
      if (y < 110 || y > FIELD.height - 110) continue;
      context.beginPath();
      context.moveTo(cx - 70, y);
      context.lineTo(cx - 22, y);
      context.moveTo(cx + 22, y);
      context.lineTo(cx + 70, y);
      context.stroke();
      text(`${Math.abs(deg)}`, cx - 82, y, 13, PALETTE.hudDim, 'right', MONO);
    }

    // Score block.
    panel(18, FIELD.height - 132, 252, 114);
    text(`SCORE ${state.score}`, 34, FIELD.height - 108, 24, PALETTE.text, 'left', MONO);
    text(`RINGS ${state.ringsPassed}/${state.rings.length}`, 34, FIELD.height - 78, 19, PALETTE.hud, 'left', MONO);
    const mins = Math.floor(state.timeLeft / 60);
    const secs = Math.floor(state.timeLeft % 60);
    text(`TIME ${mins}:${String(secs).padStart(2, '0')}`, 34, FIELD.height - 50, 19, state.timeLeft < 30 ? PALETTE.danger : PALETTE.hud, 'left', MONO);
    // Throttle bar along the panel's bottom edge.
    text('THR', 34, FIELD.height - 27, 12, PALETTE.muted, 'left', MONO);
    context.fillStyle = 'rgba(255,255,255,0.14)';
    context.fillRect(78, FIELD.height - 32, 176, 10);
    context.fillStyle = PALETTE.amber;
    context.fillRect(78, FIELD.height - 32, 176 * plane.throttle, 10);

    // Artificial horizon mini-gauge.
    drawGauge(FIELD.width - 76, FIELD.height - 76, 46, (gx, gy, r) => {
      context.save();
      context.beginPath();
      context.arc(gx, gy, r - 4, 0, Math.PI * 2);
      context.clip();
      context.translate(gx, gy);
      context.rotate(-plane.roll);
      context.fillStyle = '#3f7fbf';
      context.fillRect(-r, -r + plane.pitch * 34, r * 2, r * 2);
      context.fillStyle = '#7a5c38';
      context.fillRect(-r, plane.pitch * 34, r * 2, r * 2);
      context.restore();
      context.strokeStyle = PALETTE.amber;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(gx - 15, gy);
      context.lineTo(gx + 15, gy);
      context.stroke();
    });

    // Next-ring guidance.
    const ring = state.ringIndex < state.rings.length ? state.rings[state.ringIndex] : null;
    const target = ring || { x: RUNWAY.x, y: 40, z: RUNWAY.z };
    const dist = Math.round(Math.hypot(target.x - plane.x, target.y - plane.y, target.z - plane.z));
    const p = project(target.x, target.y, target.z);
    const label = ring ? `RING ${state.ringIndex + 1} · ${dist}m` : `RUNWAY · ${dist}m`;
    if (p && p[0] > 60 && p[0] < FIELD.width - 60 && p[1] > 90 && p[1] < FIELD.height - 60) {
      context.strokeStyle = PALETTE.amber;
      context.lineWidth = 2;
      context.strokeRect(p[0] - 18, p[1] - 18, 36, 36);
      text(label, p[0], p[1] - 32, 16, PALETTE.amber, 'center', MONO);
    } else {
      const bearing = Math.atan2(target.x - plane.x, target.z - plane.z);
      let rel = bearing - plane.heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const ax = cx + Math.sin(rel) * 210;
      const ay = cy - Math.cos(rel) * 130;
      context.save();
      context.translate(ax, ay);
      context.rotate(rel);
      context.fillStyle = PALETTE.amber;
      context.beginPath();
      context.moveTo(0, -16);
      context.lineTo(11, 10);
      context.lineTo(-11, 10);
      context.closePath();
      context.fill();
      context.restore();
      text(label, ax, ay + 30, 16, PALETTE.amber, 'center', MONO);
    }

    // Warnings and transient messages.
    if (screen === SCREEN_PLAY) {
      if (plane.stalled && Math.floor(state.elapsed * 3) % 2 === 0) {
        text('STALL', cx, 128, 30, PALETTE.danger, 'center', MONO);
      } else if (agl < 220 && plane.verticalSpeed < -6) {
        text('PULL UP', cx, 128, 30, PALETTE.danger, 'center', MONO);
      }
      if (state.messageTime > 0 && state.message) {
        context.globalAlpha = clamp(state.messageTime, 0, 1);
        text(state.message, cx, 168, 26, PALETTE.good, 'center', FONT);
        context.globalAlpha = 1;
      }
    }
    text('W/S pitch · A/D roll · Shift/Ctrl throttle · mouse steers · C camera · P pause', cx, FIELD.height - 14, 13, 'rgba(238,246,255,0.6)', 'center', FONT);
  }

  function drawTape(x, y, w, h, value, step, pxPerStep, labelEvery, unit, color) {
    panel(x, y, w, h);
    context.save();
    context.beginPath();
    context.rect(x + 4, y + 4, w - 8, h - 8);
    context.clip();
    const centre = y + h / 2;
    const first = Math.floor((value - (h / 2 / pxPerStep) * step) / step) * step;
    for (let v = first; v <= value + (h / 2 / pxPerStep) * step + step; v += step) {
      if (v < 0) continue;
      const ty = centre - ((v - value) / step) * pxPerStep;
      const major = v % (step * labelEvery) === 0;
      context.strokeStyle = color;
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x + w - (major ? 34 : 22), ty);
      context.lineTo(x + w - 8, ty);
      context.stroke();
      if (major) text(`${v}`, x + 10, ty, 14, color, 'left', MONO);
    }
    context.restore();
    context.fillStyle = 'rgba(8,16,32,0.92)';
    context.fillRect(x + 6, centre - 17, w - 12, 34);
    context.strokeStyle = PALETTE.amber;
    context.lineWidth = 1.5;
    context.strokeRect(x + 6, centre - 17, w - 12, 34);
    text(`${value}`, x + w / 2, centre, 21, PALETTE.text, 'center', MONO);
    text(unit, x + w / 2, y + 16, 13, PALETTE.muted, 'center', MONO);
  }

  function drawTitlePanel(best) {
    const w = 680;
    const h = 430;
    const x = (FIELD.width - w) / 2;
    const y = 92;
    panel(x, y, w, h);
    context.textBaseline = 'middle';
    text('CLEAR RADIUS', FIELD.width / 2, y + 62, 58, PALETTE.text, 'center', FONT);
    text('Thread the rings. Bring her home.', FIELD.width / 2, y + 108, 22, PALETTE.amber, 'center', FONT);
    const lines = [
      'Fly the gold rings in order, then land on the home runway.',
      'Centre hits and a gentle touchdown earn the big points.',
      '',
      'W / S or ↑ ↓ — pitch        A / D or ← → — roll',
      'Shift / Ctrl — throttle      Mouse — steer',
      'C — cockpit view             P — pause      M — sound',
    ];
    lines.forEach((line, i) => {
      text(line, FIELD.width / 2, y + 152 + i * 30, 18, PALETTE.muted, 'center', FONT);
    });
    text(`Best ${best}`, FIELD.width / 2, y + h - 84, 20, PALETTE.hud, 'center', MONO);
    text('Press Space or click to fly', FIELD.width / 2, y + h - 42, 24, PALETTE.good, 'center', FONT);
  }

  function drawOverPanel(state, best) {
    const w = 620;
    const h = 360;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    panel(x, y, w, h);
    context.textBaseline = 'middle';
    const titles = { landed: 'Touchdown!', crashed: 'Down in the valley', timeout: 'Out of time' };
    const subs = {
      landed: 'Home safe. The valley applauds quietly.',
      crashed: 'The terrain always wins ties.',
      timeout: 'The light faded before the circuit closed.',
    };
    text(titles[state.outcome] || 'Flight over', FIELD.width / 2, y + 58, 44, PALETTE.text, 'center', FONT);
    text(subs[state.outcome] || '', FIELD.width / 2, y + 98, 18, PALETTE.muted, 'center', FONT);
    text(`Score ${state.score}`, FIELD.width / 2, y + 150, 30, PALETTE.amber, 'center', MONO);
    text(`Rings ${state.ringsPassed}/${state.rings.length}`, FIELD.width / 2, y + 192, 21, PALETTE.hud, 'center', MONO);
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    text(`Flight time ${mins}:${String(secs).padStart(2, '0')}`, FIELD.width / 2, y + 224, 21, PALETTE.hud, 'center', MONO);
    text(`Best ${best}`, FIELD.width / 2, y + 256, 21, PALETTE.muted, 'center', MONO);
    text('Press Space or click to fly again', FIELD.width / 2, y + h - 40, 22, PALETTE.good, 'center', FONT);
  }

  function drawPausedPanel() {
    const w = 460;
    const h = 190;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    panel(x, y, w, h);
    context.textBaseline = 'middle';
    text('Paused', FIELD.width / 2, y + 62, 40, PALETTE.text, 'center', FONT);
    text('The valley holds its breath.', FIELD.width / 2, y + 102, 18, PALETTE.muted, 'center', FONT);
    text('Press P to resume', FIELD.width / 2, y + h - 38, 21, PALETTE.good, 'center', FONT);
  }

  /** Paint one frame: scene, aircraft, HUD, then any panel for the screen. */
  function draw(state, screen, best, camera) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();

    setupCamera(state);
    // Bank the whole view a little with the aircraft.
    context.translate(FIELD.width / 2, FIELD.height / 2);
    context.rotate(-state.plane.roll * 0.32);
    context.translate(-FIELD.width / 2, -FIELD.height / 2);
    // Overscan so the banked view never shows the backdrop at the corners;
    // steeper banks need more of it.
    const overscan = 1.08 + Math.abs(state.plane.roll) * 0.16;
    context.translate(FIELD.width / 2, FIELD.height / 2);
    context.scale(overscan, overscan);
    context.translate(-FIELD.width / 2, -FIELD.height / 2);

    drawSky(state);
    drawTerrain(state);
    drawRunway(state);
    drawRings(state);
    drawClouds(state);
    if (camera !== CAMERA_COCKPIT) drawAircraft(state);
    context.restore();

    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();
    // The cockpit panel is fixed to the aircraft, so it stays unbanked
    // while the world rolls behind it.
    if (camera === CAMERA_COCKPIT) drawCockpit(state);
    if (screen === SCREEN_TITLE) {
      drawHud(state, screen);
      drawTitlePanel(best);
    } else {
      drawHud(state, screen);
      if (screen === SCREEN_PAUSED) drawPausedPanel();
      else if (screen === SCREEN_OVER) drawOverPanel(state, best);
    }
    context.restore();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
