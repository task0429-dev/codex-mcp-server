import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import React from 'react';

const springSnappy = { type: 'spring', stiffness: 400, damping: 30 } as const;
const springBouncy = { type: 'spring', stiffness: 300, damping: 20 } as const;

export function FadeUp({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(4px)' }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ ...springSnappy, duration: 0.5, delay }}
    >{children}</motion.div>
  );
}

export function ScaleIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ ...springBouncy, duration: 0.4, delay }}
    >{children}</motion.div>
  );
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >{children}</motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className}
      variants={{
        hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(3px)' },
        visible: reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' },
      }}
      transition={springSnappy}
    >{children}</motion.div>
  );
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div style={{ width: '100%', height: '100%' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >{children}</motion.div>
  );
}

export function StatusPulse({ active = true, color = 'var(--accent)', size = 8 }: { active?: boolean; color?: string; size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: active ? color : 'var(--surface-raised)',
      animation: active ? 'topnav-glow-pulse 3s ease-in-out infinite' : 'none',
      flexShrink: 0,
    }} />
  );
}

export { AnimatePresence };
