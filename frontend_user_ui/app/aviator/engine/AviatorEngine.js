/**
 * AviatorEngine — Core game state machine & multiplier logic.
 *
 * States: WAITING → STARTING → RUNNING → CRASHED → RESULT → WAITING
 *
 * The engine is framework-agnostic; it emits callbacks that React
 * components subscribe to via AviatorStore.
 */

export const GAME_STATES = {
  WAITING: 'WAITING',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  CRASHED: 'CRASHED',
  RESULT: 'RESULT',
};

// Durations (ms)
const WAITING_DURATION = 8000;
const STARTING_DURATION = 3000;
const RESULT_DURATION = 4000;

// Multiplier physics
const GROWTH_RATE = 0.06; // controls exponential steepness
const TICK_INTERVAL = 50; // ms between multiplier updates

/**
 * Generate a random crash point weighted toward lower values.
 * Distribution: P(crash ≤ x) ≈ 1 − 1/x  (house-edge style)
 */
function generateCrashPoint() {
  const r = Math.random();
  // Avoid division-by-zero; clamp minimum crash at 1.01
  const raw = 1 / (1 - r);
  const crash = Math.max(1.01, Math.min(raw, 100));
  return Math.round(crash * 100) / 100;
}

export default class AviatorEngine {
  constructor() {
    this.state = GAME_STATES.WAITING;
    this.roundId = 0;
    this.multiplier = 1.0;
    this.crashPoint = 0;
    this.elapsed = 0; // ms into the RUNNING phase
    this.countdown = 0;
    this.history = [];

    this._tickTimer = null;
    this._phaseTimer = null;
    this._listeners = new Set();
    this._running = false;
  }

  /* ── Public API ─────────────────────────────────────────── */

  start() {
    if (this._running) return;
    this._running = true;
    // Seed a few history entries
    for (let i = 0; i < 15; i++) {
      this.history.unshift({
        roundId: this.roundId++,
        crashPoint: generateCrashPoint(),
      });
    }
    this._enterWaiting();
  }

  stop() {
    this._running = false;
    clearTimeout(this._phaseTimer);
    clearInterval(this._tickTimer);
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getSnapshot() {
    return {
      state: this.state,
      roundId: this.roundId,
      multiplier: this.multiplier,
      crashPoint: this.crashPoint,
      countdown: this.countdown,
      elapsed: this.elapsed,
      history: this.history,
    };
  }

  /* ── State transitions ──────────────────────────────────── */

  _emit() {
    const snap = this.getSnapshot();
    this._listeners.forEach((fn) => fn(snap));
  }

  _enterWaiting() {
    this.state = GAME_STATES.WAITING;
    this.multiplier = 1.0;
    this.elapsed = 0;
    this.countdown = WAITING_DURATION / 1000;
    this._emit();

    let remaining = WAITING_DURATION;
    clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => {
      remaining -= 100;
      this.countdown = Math.max(0, Math.ceil(remaining / 1000));
      this._emit();
    }, 100);

    this._phaseTimer = setTimeout(() => {
      clearInterval(this._tickTimer);
      if (this._running) this._enterStarting();
    }, WAITING_DURATION);
  }

  _enterStarting() {
    this.state = GAME_STATES.STARTING;
    this.roundId += 1;
    this.crashPoint = generateCrashPoint();
    this.countdown = Math.ceil(STARTING_DURATION / 1000);
    this._emit();

    let remaining = STARTING_DURATION;
    clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => {
      remaining -= 100;
      this.countdown = Math.max(0, Math.ceil(remaining / 1000));
      this._emit();
    }, 100);

    this._phaseTimer = setTimeout(() => {
      clearInterval(this._tickTimer);
      if (this._running) this._enterRunning();
    }, STARTING_DURATION);
  }

  _enterRunning() {
    this.state = GAME_STATES.RUNNING;
    this.multiplier = 1.0;
    this.elapsed = 0;
    this._emit();

    clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => {
      this.elapsed += TICK_INTERVAL;
      const t = this.elapsed / 1000; // seconds
      this.multiplier =
        Math.round(Math.exp(GROWTH_RATE * t) * 100) / 100;

      if (this.multiplier >= this.crashPoint) {
        this.multiplier = this.crashPoint;
        clearInterval(this._tickTimer);
        this._emit();
        if (this._running) this._enterCrashed();
        return;
      }

      this._emit();
    }, TICK_INTERVAL);
  }

  _enterCrashed() {
    this.state = GAME_STATES.CRASHED;
    this.history.unshift({
      roundId: this.roundId,
      crashPoint: this.crashPoint,
    });
    if (this.history.length > 30) this.history.pop();
    this._emit();

    this._phaseTimer = setTimeout(() => {
      if (this._running) this._enterResult();
    }, 1200);
  }

  _enterResult() {
    this.state = GAME_STATES.RESULT;
    this._emit();

    this._phaseTimer = setTimeout(() => {
      if (this._running) this._enterWaiting();
    }, RESULT_DURATION);
  }
}
