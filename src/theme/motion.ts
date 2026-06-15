// Motion design tokens (Apple-calm). Durations for timing, springs for
// interactive/natural motion. Shared by Moti components and Reanimated.

export const duration = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const spring = {
  /** Default for sheets / cards — gentle settle. */
  soft: { damping: 18, stiffness: 180, mass: 1 },
  /** Smoother, slightly slower — large surfaces. */
  smooth: { damping: 20, stiffness: 150, mass: 1 },
  /** A touch of overshoot — success / playful accents. */
  bounce: { damping: 12, stiffness: 200, mass: 1 },
} as const;

// ── Moti transition presets ──────────────────────────────────────────────
export const transitions = {
  springSoft: { type: 'spring' as const, ...spring.soft },
  springSmooth: { type: 'spring' as const, ...spring.smooth },
  springBounce: { type: 'spring' as const, ...spring.bounce },
  timingFast: { type: 'timing' as const, duration: duration.fast },
  timingNormal: { type: 'timing' as const, duration: duration.normal },
  timingSlow: { type: 'timing' as const, duration: duration.slow },
};

// ── Moti enter/exit presets ──────────────────────────────────────────────
/** Card / content appear: fade + rise. */
export const fadeRise = {
  from: { opacity: 0, translateY: 15 },
  animate: { opacity: 1, translateY: 0 },
  transition: { type: 'timing' as const, duration: duration.normal },
};

/** Screen-level: subtle fade + small slide. */
export const fadeSlide = {
  from: { opacity: 0, translateY: 8 },
  animate: { opacity: 1, translateY: 0 },
  transition: transitions.springSmooth,
};

/** Press feedback scale. */
export const pressScale = 0.96;

/** Stagger delay per list item (ms). */
export const staggerStep = 40;
