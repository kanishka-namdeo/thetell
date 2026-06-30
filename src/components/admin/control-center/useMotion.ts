import { useReducedMotion } from "motion/react";

export function useControlCenterMotion() {
  const reducedMotion = useReducedMotion();

  return {
    shouldAnimate: !reducedMotion,
    transitions: {
      instant: { duration: reducedMotion ? 0 : 0.1 },
      fast: { duration: reducedMotion ? 0 : 0.2 },
      normal: { duration: reducedMotion ? 0 : 0.3 },
    },
    variants: {
      successPulse: {
        initial: { scale: 1 },
        animate: { scale: [1, 1.05, 1] },
      },
      errorShake: {
        initial: { x: 0 },
        animate: { x: [0, -5, 5, -5, 0] },
      },
      fadeIn: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      },
      scaleIn: {
        initial: { scale: 0.95, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.95, opacity: 0 },
      },
      slideUp: {
        initial: { y: 20, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: -20, opacity: 0 },
      },
    },
  };
}
