// Keyboard and mouse input. Held keys and the pointer position give smooth
// flight controls; one-shot presses (start, pause, camera, mute) are queued
// as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MUTE = 8;

const CLIMB = new Set(['ArrowUp', 'KeyW']);
const DESCEND = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let mouseActive = false;
  let mouseIdle = 0;

  window.addEventListener('keydown', (event) => {
    if (CLIMB.has(event.code) || DESCEND.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyC') {
      if (!event.repeat) actions |= ACTION_CAMERA;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseActive = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width;
    mouseY = (event.clientY - rect.top) / rect.height;
    mouseActive = true;
    mouseIdle = 0;
  });
  canvas.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function any(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /**
     * Smooth flight controls for this frame: pitch and roll in [-1, 1],
     * throttle as a delta direction. Keyboard wins; the mouse steers when
     * it has moved recently and no steering key is held.
     */
    controls(dt) {
      mouseIdle += dt;
      if (mouseIdle > 2.5) mouseActive = false;
      let pitch = (any(CLIMB) ? 1 : 0) - (any(DESCEND) ? 1 : 0);
      let roll = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0);
      if (pitch === 0 && roll === 0 && mouseActive) {
        roll = Math.max(-1, Math.min(1, (mouseX - 0.5) * 2.4));
        pitch = Math.max(-1, Math.min(1, (0.5 - mouseY) * 2.2));
      }
      const throttle = (any(THROTTLE_UP) ? 1 : 0) - (any(THROTTLE_DOWN) ? 1 : 0);
      return { pitch, roll, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
