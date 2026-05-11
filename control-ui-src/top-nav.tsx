import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { NAV_ITEMS, type PageKey } from './types';
import { StatusPulse } from './motion-primitives';

interface TopNavProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  systemHealth?: number;
  onSearchOpen: () => void;
  onLock: () => void;
}

// Primary items: those with no section (section === "")
const PRIMARY_KEYS: PageKey[] = ['home', 'agents', 'voice', 'messages', 'models', 'c2'];

// Build overflow groups from NAV_ITEMS — unique section names, excluding empty-section items
function getOverflowGroups(): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const item of NAV_ITEMS) {
    if (item.section && !seen.has(item.section)) {
      seen.add(item.section);
      groups.push(item.section);
    }
  }
  return groups;
}

function HubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="3.5" fill="var(--accent)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={20 + 5 * Math.cos(rad)} y1={20 + 5 * Math.sin(rad)}
            x2={20 + 14 * Math.cos(rad)} y2={20 + 14 * Math.sin(rad)}
            stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function NavPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`topnav-pill${active ? ' topnav-pill-active' : ''}`}>
      {children}
    </button>
  );
}

function OverflowDropdown({ section, currentPage, onNavigate }: {
  section: string;
  currentPage: PageKey;
  onNavigate: (p: PageKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const items = NAV_ITEMS.filter((n) => n.section === section);
  const isActive = items.some((n) => n.key === currentPage);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [currentPage]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <NavPill active={isActive} onClick={() => setOpen((v) => !v)}>
        {section} <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>▾</span>
      </NavPill>
      <AnimatePresence>
        {open && (
          <motion.div className="topnav-dropdown"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                className={`topnav-dropdown-item${item.key === currentPage ? ' active' : ''}`}
                onClick={() => { onNavigate(item.key); setOpen(false); }}
              >
                {item.key === currentPage
                  ? <StatusPulse size={5} />
                  : <span style={{ width: 5, display: 'inline-block' }} />
                }
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopNav({ currentPage, onNavigate, systemHealth, onSearchOpen, onLock }: TopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() =>
      setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const primaryItems = NAV_ITEMS.filter((n) => PRIMARY_KEYS.includes(n.key));
  const groups = getOverflowGroups();

  return (
    <nav className={`topnav${scrolled ? ' topnav-scrolled' : ''}`}>
      {/* Brand */}
      <div className="topnav-brand">
        <HubMark />
        <span className="topnav-brand-text">Command Center</span>
      </div>
      <div className="topnav-divider" />

      {/* Primary + overflow */}
      <div className="topnav-links">
        {primaryItems.map((item) => (
          <NavPill key={item.key} active={currentPage === item.key} onClick={() => onNavigate(item.key)}>
            {item.label}
          </NavPill>
        ))}
        <div className="topnav-divider" style={{ margin: '0 6px' }} />
        {groups.map((section) => (
          <OverflowDropdown key={section} section={section} currentPage={currentPage} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Right controls */}
      <div className="topnav-controls">
        {systemHealth !== undefined && (
          <div className="topnav-health">
            <StatusPulse
              size={6}
              color={
                systemHealth >= 80 ? 'var(--green)' :
                systemHealth >= 50 ? 'var(--yellow)' :
                'var(--red)'
              }
            />
            <span>{systemHealth}%</span>
          </div>
        )}
        <span className="topnav-clock">{clock}</span>
        <button className="topnav-btn" onClick={onSearchOpen} aria-label="Search">⌘K</button>
        <button className="topnav-btn" onClick={onLock} aria-label="Lock">Lock</button>
      </div>
    </nav>
  );
}

export function BackendProofBar({ children }: { children: React.ReactNode }) {
  return <div className="topnav-proof-bar">{children}</div>;
}
