// Screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a staged state with a simple autopilot (steer toward
// the next ring, hold a safe altitude, flare for the runway), so the frame
// is what a real flight looks like and the same seed always gives the same
// frame.
import { STEP } from './config.js';
import { EVENT_LANDED, OUTCOME_FLYING, OUTCOME_LANDED, terrainHeight } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Steer toward a point: bank for heading, pitch for altitude, ease speed. */
function autopilot(state, target, cruiseSpeed) {
  const plane = state.plane;
  const bearing = Math.atan2(target.x - plane.x, target.z - plane.z);
  const roll = clamp(angleDiff(bearing, plane.heading) * 1.6, -1, 1);
  const ground = Math.max(terrainHeight(plane.x, plane.z, state.seed), 0);
  const safeY = Math.max(target.y, ground + 90);
  const pitch = clamp((safeY - plane.y) / 160, -0.8, 0.8);
  const throttle = plane.speed < cruiseSpeed - 3 ? 1 : plane.speed > cruiseSpeed + 3 ? -1 : 0;
  return { pitch, roll, throttle };
}

function flyTo(world, target, seconds, cruiseSpeed) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const events = world.step(STEP, autopilot(world.state, target, cruiseSpeed));
    if (events & EVENT_LANDED) break;
    if (world.state.outcome !== 'flying') break;
  }
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const plane = state.plane;

  if (name === 'play' || name === 'cockpit') {
    // Mid-circuit: two rings banked, banking toward the third over the lake.
    state.rings[0].passed = true;
    state.rings[1].passed = true;
    state.ringIndex = 2;
    state.ringsPassed = 2;
    state.score = 275;
    state.elapsed = 52;
    state.timeLeft = 188;
    const ring = state.rings[2];
    plane.x = ring.x - 190;
    plane.z = ring.z - 980;
    plane.y = ring.y + 55;
    plane.heading = Math.atan2(ring.x - plane.x, ring.z - plane.z) - 0.38;
    plane.speed = 64;
    plane.throttle = 0.68;
    flyTo(world, ring, 2.6, 64);
    return { screen: SCREEN_PLAY, best: 640 };
  }

  if (name === 'end') {
    // Final approach: most rings banked, flaring onto the home runway.
    for (let i = 0; i < 8; i += 1) state.rings[i].passed = true;
    state.ringIndex = 8;
    state.ringsPassed = 8;
    state.score = 980;
    state.elapsed = 164;
    state.timeLeft = 76;
    plane.x = -14;
    plane.z = -1250;
    plane.y = 165;
    plane.heading = 0.03;
    plane.speed = 52;
    plane.throttle = 0.3;
    // Descend toward the threshold on a shallow profile, then flare: the
    // pitch stays gentle enough for the real landing check to accept.
    for (let i = 0; i < 30 / STEP; i += 1) {
      const targetY = plane.z < -650 ? 92 : plane.z < -250 ? 34 : 9;
      const controls = {
        pitch: clamp((targetY - plane.y) / 150, -0.22, 0.35),
        roll: clamp(-plane.x / 60 - plane.heading * 2, -0.5, 0.5),
        throttle: plane.speed > 46 ? -1 : plane.speed < 40 ? 1 : 0,
      };
      const events = world.step(STEP, controls);
      if (events & EVENT_LANDED) break;
      if (state.outcome !== 'flying') break;
    }
    if (state.outcome !== OUTCOME_LANDED) {
      // Fall back to a clean touchdown state if the flare missed.
      state.outcome = OUTCOME_FLYING;
      plane.x = 0;
      plane.z = -180;
      plane.y = 10;
      plane.pitch = 0.02;
      plane.roll = 0;
      plane.speed = 44;
      plane.verticalSpeed = -2;
      world.step(STEP, { pitch: 0, roll: 0, throttle: 0 });
    }
    return { screen: SCREEN_OVER, best: state.score };
  }

  // start: the title over a gentle valley flight toward the first ring.
  plane.x = -260;
  plane.z = -1650;
  plane.y = 300;
  plane.heading = 0.12;
  flyTo(world, state.rings[0], 4.5, 58);
  return { screen: SCREEN_TITLE, best: 640 };
}
