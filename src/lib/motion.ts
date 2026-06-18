import { useReducedMotion } from "motion/react";

export function useMotion() {
  const reducedMotion = useReducedMotion();
  return { shouldAnimate: !reducedMotion };
}

export const motionVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  press: {
    initial: { scale: 1 },
    press: { scale: 0.97 },
    release: { scale: 1 },
  },
};

export const motionTransitions = {
  instant: { duration: 0.1 },
  fast: { duration: 0.2 },
  normal: { duration: 0.3 },
  slow: { duration: 0.5 },
  deliberate: { duration: 0.7 },
};
