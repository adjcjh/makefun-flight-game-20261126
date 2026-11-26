// Clear Radius rules and state, with no drawing and no browser in it: the
// aircraft, the terrain it flies over, the ring course, the home runway,
// scoring, and the landing / crash / timeout endings. step() advances one
// fixed step from a control input and returns event flags, so the caller can
// react (sound, announcements) without the world knowing about screens.
import { COURSE, PLANE, RUNWAY } from './config.js';
import { createRandom, valueNoise } from './random.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_TIMEOUT = 8;
export const EVENT_STALL = 16;

export const OUTCOME_FLYING = 'flying';
export const OUTCOME_LANDED = 'landed';
export const OUTCOME_CRASHED = 'crashed';
export const OUTCOME_TIMEOUT = 'timeout';

const LAKE = { x: 1500, z: 2100, radius: 780 };

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Terrain height in metres at world (x, z): rolling hills and two ridge
 * lines from layered value noise, a lake basin pressed below water level,
 * and a flat apron around the home runway so landings have somewhere to go.
 */
export function terrainHeight(x, z, seed) {
  const broad = valueNoise(x / 1400, z / 1400, seed);
  const detail = valueNoise(x / 420, z / 420, seed + 7);
  const ridge = Math.abs(valueNoise(x / 2600 + 9, z / 2600, seed + 13) - 0.5) * 2;
  let h = 14 + broad * 82 + detail * 22 + Math.pow(1 - ridge, 3) * 165;

  const distOrigin = Math.hypot(x, z);
  const rim = smoothstep(4300, 6400, distOrigin);
  h += rim * 260;

  const lakeDist = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lakeBlend = smoothstep(LAKE.radius, LAKE.radius * 0.55, lakeDist);
  h = lerp(h, -6, lakeBlend);

  const runwayBlend = smoothstep(1150, 620, Math.hypot(x - RUNWAY.x, z - RUNWAY.z));
  h = lerp(h, 8, runwayBlend);
  return h;
}

export function isWater(x, z, seed) {
  return terrainHeight(x, z, seed) < 0.5;
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const rings = [];
  const clouds = [];

  // A gentle circuit: out over the lake, along the ridge, home to the runway.
  const waypoints = [
    [0, 900], [700, 1600], [1500, 2300], [2300, 1900], [2600, 900],
    [1900, 100], [1100, -500], [300, -900], [-700, -500], [-500, 300],
  ];
  for (let i = 0; i < COURSE.ringCount; i += 1) {
    const [wx, wz] = waypoints[i % waypoints.length];
    const x = wx + (random() - 0.5) * 160;
    const z = wz + (random() - 0.5) * 160;
    const ground = Math.max(terrainHeight(x, z, seed), 0);
    const y = ground + 150 + random() * 130;
    const next = waypoints[(i + 1) % waypoints.length];
    const heading = Math.atan2(next[0] - wx, next[1] - wz);
    rings.push({ x, y, z, heading, passed: false, flash: 0 });
  }

  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: (random() - 0.5) * 11000,
      z: (random() - 0.5) * 11000,
      y: 420 + random() * 320,
      scale: 130 + random() * 260,
      drift: 2 + random() * 3,
    });
  }

  const plane = {
    x: 0, y: PLANE.startAltitude, z: -1500,
    heading: 0, pitch: 0, roll: 0,
    speed: PLANE.cruiseSpeed, throttle: 0.62,
    verticalSpeed: 0, stalled: false,
  };

  const state = {
    seed,
    plane,
    rings,
    clouds,
    score: 0,
    ringIndex: 0,
    ringsPassed: 0,
    elapsed: 0,
    timeLeft: COURSE.timeLimit,
    outcome: OUTCOME_FLYING,
    lastRingBonus: 0,
    message: '',
    messageTime: 0,
  };

  function reset() {
    plane.x = 0;
    plane.y = PLANE.startAltitude;
    plane.z = -1500;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = PLANE.cruiseSpeed;
    plane.throttle = 0.62;
    plane.verticalSpeed = 0;
    plane.stalled = false;
    for (const ring of rings) {
      ring.passed = false;
      ring.flash = 0;
    }
    state.score = 0;
    state.ringIndex = 0;
    state.ringsPassed = 0;
    state.elapsed = 0;
    state.timeLeft = COURSE.timeLimit;
    state.outcome = OUTCOME_FLYING;
    state.lastRingBonus = 0;
    state.message = '';
    state.messageTime = 0;
  }

  function nextRing() {
    return state.ringIndex < rings.length ? rings[state.ringIndex] : null;
  }

  function onRunway() {
    const dx = plane.x - RUNWAY.x;
    const dz = plane.z - RUNWAY.z;
    return Math.abs(dx) <= RUNWAY.width / 2 && Math.abs(dz) <= RUNWAY.length / 2;
  }

  function checkRing(events) {
    const ring = nextRing();
    if (!ring) return events;
    // Distance from the ring centre in the ring's own plane: the ring faces
    // along its course heading, so project the offset onto its right axis.
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const along = dx * Math.sin(ring.heading) + dz * Math.cos(ring.heading);
    const side = dx * Math.cos(ring.heading) - dz * Math.sin(ring.heading);
    if (Math.abs(along) < plane.speed * STEP_GUARD && Math.hypot(side, dy) <= COURSE.ringRadius) {
      const centre = 1 - Math.hypot(side, dy) / COURSE.ringRadius;
      const bonus = Math.round(COURSE.centreBonus * centre);
      state.lastRingBonus = bonus;
      state.score += COURSE.ringPoints + bonus;
      state.ringsPassed += 1;
      state.ringIndex += 1;
      ring.passed = true;
      ring.flash = 1;
      state.message = bonus >= 40 ? 'Dead centre!' : 'Ring clear';
      state.messageTime = 1.6;
      return events | EVENT_RING;
    }
    return events;
  }

  const STEP_GUARD = 1 / 60;

  /**
   * One fixed step. controls: { pitch, roll, throttle } each in [-1, 1]
   * (throttle is a delta: +1 raises it). Returns EVENT_* flags.
   */
  function step(dt, controls) {
    if (state.outcome !== OUTCOME_FLYING) return 0;
    let events = 0;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, COURSE.timeLimit - state.elapsed);
    if (state.messageTime > 0) state.messageTime = Math.max(0, state.messageTime - dt);
    for (const ring of rings) if (ring.flash > 0) ring.flash = Math.max(0, ring.flash - dt * 0.8);
    for (const cloud of clouds) cloud.x += cloud.drift * dt;

    plane.throttle = clamp(plane.throttle + controls.throttle * dt * 0.55, 0, 1);
    const targetSpeed = lerp(PLANE.minSpeed, PLANE.maxSpeed, plane.throttle);
    plane.speed += (targetSpeed - plane.speed) * Math.min(1, dt * 0.7);
    plane.speed -= Math.sin(plane.pitch) * dt * 9;
    plane.speed = clamp(plane.speed, 12, PLANE.maxSpeed + 12);

    const wasStalled = plane.stalled;
    plane.stalled = plane.speed < PLANE.stallSpeed;
    if (plane.stalled && !wasStalled) events |= EVENT_STALL;

    const pitchTarget = plane.stalled ? -0.3 : controls.pitch * PLANE.maxPitch;
    plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    const rollTarget = controls.roll * PLANE.maxRoll;
    plane.roll += clamp(rollTarget - plane.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    plane.heading += Math.sin(plane.roll) * PLANE.turnRate * dt * clamp(plane.speed / 45, 0.5, 1.3);

    const prevX = plane.x;
    const prevZ = plane.z;
    plane.verticalSpeed = plane.speed * Math.sin(plane.pitch);
    plane.x += Math.sin(plane.heading) * Math.cos(plane.pitch) * plane.speed * dt;
    plane.z += Math.cos(plane.heading) * Math.cos(plane.pitch) * plane.speed * dt;
    plane.y += plane.verticalSpeed * dt;
    plane.y = Math.min(plane.y, 1400);

    const distOrigin = Math.hypot(plane.x, plane.z);
    if (distOrigin > COURSE.worldRadius) {
      const pull = Math.atan2(-plane.x, -plane.z);
      let diff = pull - plane.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      plane.heading += diff * dt * 0.8;
      state.message = 'Turning back to the valley';
      state.messageTime = 0.4;
    }

    events = checkRing(events);

    const ground = Math.max(terrainHeight(plane.x, plane.z, seed), 0);
    if (plane.y <= ground + 3) {
      plane.y = ground + 3;
      const gentle = plane.verticalSpeed > -7 && Math.abs(plane.roll) < 0.35;
      if (onRunway() && gentle && plane.speed < 78) {
        state.outcome = OUTCOME_LANDED;
        const timeBonus = Math.round(state.timeLeft) * 2;
        const courseBonus = state.ringsPassed === rings.length ? 250 : 0;
        state.score += COURSE.landingPoints + timeBonus + courseBonus;
        events |= EVENT_LANDED;
      } else {
        state.outcome = OUTCOME_CRASHED;
        events |= EVENT_CRASHED;
      }
      return events;
    }

    if (state.timeLeft <= 0) {
      state.outcome = OUTCOME_TIMEOUT;
      events |= EVENT_TIMEOUT;
    }

    void prevX;
    void prevZ;
    return events;
  }

  reset();
  return { state, reset, step, nextRing };
}
