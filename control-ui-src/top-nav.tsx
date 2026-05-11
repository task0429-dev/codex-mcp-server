import React, { useState, useEffect, useRef } from 'react';
import { NAV_ITEMS, type PageKey } from './types';
import { StatusPulse } from './motion-primitives';

interface TopNavProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  systemHealth?: number;
  onSearchOpen: () => void;
  onLock: () => void;
}

// Ordered nav: first 7 pinned, then remaining grouped by section
const PINNED: PageKey[] = ['home', 'agents', 'voice', 'messages', 'models', 'memories', 'monitoring'];

const ORDERED_NAV = [
  // Pinned first 7
  ...PINNED.map(k => NAV_ITEMS.find(n => n.key === k)!).filter(Boolean),
  // Then remaining items grouped by section order from NAV_ITEMS
  ...NAV_ITEMS.filter(n => !PINNED.includes(n.key)),
];

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


export function TopNav({ currentPage, onNavigate, systemHealth, onSearchOpen, onLock }: TopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
  const linksRef = useRef<HTMLDivElement>(null);

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

  // Scroll active tab into view when page changes
  useEffect(() => {
    const el = linksRef.current?.querySelector('.topnav-pill-active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentPage]);

  return (
    <nav className={`topnav${scrolled ? ' topnav-scrolled' : ''}`}>
      {/* Brand */}
      <div className="topnav-brand">
        <HubMark />
        <span className="topnav-brand-text">C2</span>
      </div>
      <div className="topnav-divider" />

      {/* All tabs — single scrollable row, two-finger swipe to pan */}
      <div className="topnav-links" ref={linksRef}>
        {ORDERED_NAV.map((item, i) => {
          // Divider after the 7th pinned item, and between section changes after that
          const prev = ORDERED_NAV[i - 1];
          const showDivider = i === PINNED.length ||
            (i > PINNED.length && prev && item.section !== prev.section && item.section !== '');
          return (
            <React.Fragment key={item.key}>
              {showDivider && <div className="topnav-divider" style={{ margin: '0 6px', flexShrink: 0 }} />}
              <NavPill active={currentPage === item.key} onClick={() => onNavigate(item.key)}>
                {item.label}
              </NavPill>
            </React.Fragment>
          );
        })}
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
