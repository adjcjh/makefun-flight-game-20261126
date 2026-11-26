// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, game over.
//
// ?seed=N fixes the terrain and course. ?shot=start|play|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CRASHED, EVENT_LANDED, EVENT_RING, EVENT_STALL, EVENT_TIMEOUT } from './world.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { CAMERA_CHASE, CAMERA_COCKPIT, createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const camera = name === 'cockpit' ? CAMERA_COCKPIT : CAMERA_CHASE;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let camera = CAMERA_CHASE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.start();
    announce('Flying. Thread the gold rings, then land on the runway.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.setEngine(0, false);
    announce(`Flight over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CAMERA) {
      camera = camera === CAMERA_CHASE ? CAMERA_COCKPIT : CAMERA_CHASE;
    }
    if (actions & ACTION_MUTE) {
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function react(events) {
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring clear. Score ${world.state.score}.`);
    }
    if (events & EVENT_STALL) audio.stall();
    if (events & EVENT_LANDED) audio.landed();
    if (events & EVENT_CRASHED) audio.crashed();
    if (events & (EVENT_LANDED | EVENT_CRASHED | EVENT_TIMEOUT)) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += frameDt;
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // Attract mode: the aircraft cruises the valley behind the title.
      while (accumulator >= STEP) {
        const plane = world.state.plane;
        const ring = world.nextRing() || { x: 0, y: 220, z: 0 };
        const bearing = Math.atan2(ring.x - plane.x, ring.z - plane.z);
        let diff = bearing - plane.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        world.step(STEP, {
          pitch: Math.max(-0.5, Math.min(0.5, (240 - plane.y) / 200)),
          roll: Math.max(-0.8, Math.min(0.8, diff * 1.4)),
          throttle: 0,
        });
        if (world.state.outcome !== 'flying') world.reset();
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      const controls = input.controls(frameDt);
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        react(world.step(STEP, controls));
        accumulator -= STEP;
      }
      audio.setEngine(world.state.plane.throttle, screen === SCREEN_PLAY);
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, camera);
  }

  // Leaving the tab pauses a running flight rather than flying unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Clear Radius. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
