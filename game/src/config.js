// Clear Radius — tuning constants. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule depends on screen size.

export const FIELD = { width: 1280, height: 720 };

/** Fixed simulation step (seconds): 60 updates per second at any display rate. */
export const STEP = 1 / 60;

/** Flight model limits, in metres and metres per second. */
export const PLANE = {
  minSpeed: 24,
  maxSpeed: 96,
  cruiseSpeed: 58,
  stallSpeed: 30,
  maxPitch: 0.62,
  maxRoll: 1.05,
  pitchRate: 1.15,
  rollRate: 2.1,
  turnRate: 0.62,
  startAltitude: 260,
};

/** Course: rings to thread, then land on the home runway. */
export const COURSE = {
  ringCount: 10,
  ringRadius: 62,
  ringPoints: 100,
  centreBonus: 50,
  landingPoints: 300,
  timeLimit: 240,
  worldRadius: 6500,
};

/** Home runway: a north-facing strip centred on the origin. */
export const RUNWAY = {
  x: 0,
  z: 0,
  length: 980,
  width: 64,
  heading: 0,
};

export const PALETTE = {
  backdrop: '#0b1020',
  hud: '#7fe7ff',
  hudDim: 'rgba(127,231,255,0.55)',
  amber: '#ffc857',
  panel: 'rgba(8,16,32,0.82)',
  panelEdge: 'rgba(127,231,255,0.35)',
  text: '#eef6ff',
  muted: '#9db4c8',
  danger: '#ff5d5d',
  good: '#5dff9d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'clear-radius.best';
