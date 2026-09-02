import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface RadialSubMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  onDisabledAction?: () => void;
}

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action?: () => void;
  children?: RadialSubMenuItem[];
  disabled?: boolean;
  onDisabledAction?: () => void;
}

export interface RadialMenuProps {
  items: RadialMenuItem[];
  isOpen?: boolean;
  /** The anchor point (screen coordinates) where the menu is centered around. Defaults to viewport center. */
  anchor?: { x: number; y: number };
  /** Container square size. Default: 600 */
  size?: number;
  /** Radii for level-1 and level-2 rings. Defaults: { level1: 140, level2: 130 } */
  radii?: { level1?: number; level2?: number };
  className?: string;
  /** Called when the menu requests to close (ESC, click outside, or after an action). */
  onClose?: () => void;
}

/** Clock-hand style pointer line (thick at center, thin at target) */
const PointerLine: React.FC<{
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  id: string;
}> = ({ cx, cy, tx, ty, id }) => {
  const angle = Math.atan2(ty - cy, tx - cx);
  const perpX = Math.sin(angle);
  const perpY = -Math.cos(angle);
  const thickWidth = 5;
  const thinWidth = 1.5;
  const points = [
    [cx + perpX * thickWidth, cy + perpY * thickWidth],
    [cx - perpX * thickWidth, cy - perpY * thickWidth],
    [tx - perpX * thinWidth, ty - perpY * thinWidth],
    [tx + perpX * thinWidth, ty + perpY * thinWidth]
  ];
  const gradientId = `${id}-grad`;
  const glowId = `${id}-glow`;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1={cx} y1={cy} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0.6" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polygon points={points.map((p) => p.join(',')).join(' ')} fill={`url(#${gradientId})`} filter={`url(#${glowId})`} />
      <circle cx={cx} cy={cy} r={3} fill="white" />
    </g>
  );
};

/** Skill ring background effect */
const SkillRing: React.FC<{
  cx: number;
  cy: number;
  radius: number;
  itemCount: number;
  selectedIndex: number;
  id: string;
}> = ({ cx, cy, radius, itemCount, selectedIndex, id }) => {
  const ringId = `${id}-ring`;
  const glowId = `${id}-glow`;

  // Generate segment arcs
  const segments = useMemo(() => {
    if (itemCount === 0) return [];
    const segmentAngle = (2 * Math.PI) / itemCount;
    const gap = 0.08; // Gap between segments in radians

    return Array.from({ length: itemCount }, (_, i) => {
      const startAngle = i * segmentAngle - Math.PI / 2 + gap / 2;
      const endAngle = (i + 1) * segmentAngle - Math.PI / 2 - gap / 2;

      const innerRadius = radius - 28;
      const outerRadius = radius + 28;

      const x1 = cx + Math.cos(startAngle) * innerRadius;
      const y1 = cy + Math.sin(startAngle) * innerRadius;
      const x2 = cx + Math.cos(startAngle) * outerRadius;
      const y2 = cy + Math.sin(startAngle) * outerRadius;
      const x3 = cx + Math.cos(endAngle) * outerRadius;
      const y3 = cy + Math.sin(endAngle) * outerRadius;
      const x4 = cx + Math.cos(endAngle) * innerRadius;
      const y4 = cy + Math.sin(endAngle) * innerRadius;

      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

      return {
        index: i,
        path: `M ${x1} ${y1} L ${x2} ${y2} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1} Z`
      };
    });
  }, [cx, cy, radius, itemCount]);

  return (
    <g>
      <defs>
        {/* Radial gradient for ring glow */}
        <radialGradient id={ringId} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
        </radialGradient>
        {/* Filter for outer glow */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={radius + 35} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.1" />
      <circle cx={cx} cy={cy} r={radius - 35} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.1" />

      {/* Background fill */}
      <circle cx={cx} cy={cy} r={radius + 30} fill={`url(#${ringId})`} />

      {/* Segment arcs */}
      {segments.map((seg) => (
        <motion.path
          key={seg.index}
          d={seg.path}
          fill={seg.index === selectedIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}
          fillOpacity={seg.index === selectedIndex ? 0.25 : 0.08}
          stroke={seg.index === selectedIndex ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
          strokeWidth={seg.index === selectedIndex ? 2 : 1}
          strokeOpacity={seg.index === selectedIndex ? 0.8 : 0.3}
          filter={seg.index === selectedIndex ? `url(#${glowId})` : undefined}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{
            opacity: 1,
            scale: 1,
            fillOpacity: seg.index === selectedIndex ? 0.25 : 0.08
          }}
          transition={{ duration: 0.2 }}
        />
      ))}

      {/* Decorative tick marks */}
      {Array.from({ length: itemCount * 2 }, (_, i) => {
        const angle = (i * Math.PI) / itemCount - Math.PI / 2;
        const isMajor = i % 2 === 0;
        const innerR = radius + (isMajor ? 32 : 30);
        const outerR = radius + (isMajor ? 38 : 34);
        return (
          <line
            key={`tick-${i}`}
            x1={cx + Math.cos(angle) * innerR}
            y1={cy + Math.sin(angle) * innerR}
            x2={cx + Math.cos(angle) * outerR}
            y2={cy + Math.sin(angle) * outerR}
            stroke="hsl(var(--primary))"
            strokeWidth={isMajor ? 2 : 1}
            strokeOpacity={isMajor ? 0.4 : 0.2}
          />
        );
      })}
    </g>
  );
};

/** Center hub decoration */
const CenterHub: React.FC<{ cx: number; cy: number; id: string }> = ({ cx, cy, id }) => {
  const hubGradientId = `${id}-hub-grad`;

  return (
    <g>
      <defs>
        <radialGradient id={hubGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Outer glow */}
      <circle cx={cx} cy={cy} r={20} fill={`url(#${hubGradientId})`} />
      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={10} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.6" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" />
    </g>
  );
};

const defaultRadii = { level1: 140, level2: 130 } as const;

export const RadialMenu: React.FC<RadialMenuProps> = ({ items, isOpen = true, anchor, size = 600, radii, className, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const [activeParentIndex, setActiveParentIndex] = useState<number | null>(null);
  const [subSelectedIndex, setSubSelectedIndex] = useState(0);
  // When returning from level-2 to level-1, skip staggered entrance animation for level-1 items
  const [shouldSkipL1Stagger, setShouldSkipL1Stagger] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { level1, level2 } = { ...defaultRadii, ...(radii ?? {}) } as Required<typeof defaultRadii>;

  // Default anchor to viewport center so callers only need to provide items
  const resolvedAnchor = useMemo(() => {
    if (anchor) return anchor;
    // Safe fallback for environments where window might not be ready
    const w = typeof window !== 'undefined' ? window.innerWidth : size;
    const h = typeof window !== 'undefined' ? window.innerHeight : size;
    return { x: Math.round(w / 2), y: Math.round(h / 2) };
  }, [anchor, size]);

  // Keyboard navigation
  const runItemAction = React.useCallback(
    (item: RadialMenuItem, index: number): void => {
      if (item.disabled) {
        item.onDisabledAction?.();
        return;
      }

      if (item.children && item.children.length > 0) {
        setActiveParentIndex(index);
        setIsSubMenuOpen(true);
        setSubSelectedIndex(0);
        return;
      }

      if (!item.action) {
        return;
      }

      item.action();
      onClose?.();
    },
    [onClose]
  );

  const runChildAction = React.useCallback(
    (child: RadialSubMenuItem): void => {
      if (child.disabled) {
        child.onDisabledAction?.();
        return;
      }

      child.action();
      onClose?.();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // ESC to close / back
      if (e.key === 'Escape') {
        if (isSubMenuOpen) {
          setShouldSkipL1Stagger(true);
          setIsSubMenuOpen(false);
          setActiveParentIndex(null);
          return;
        }
        onClose?.();
        return;
      }

      // Number keys 1-9 to select
      const numKey = parseInt(e.key);
      if (!Number.isNaN(numKey)) {
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = items[activeParentIndex].children ?? [];
          if (numKey >= 1 && numKey <= 9 && numKey <= children.length) {
            e.preventDefault();
            runChildAction(children[numKey - 1]);
            return;
          }
        } else {
          if (numKey >= 1 && numKey <= 9 && numKey <= items.length) {
            e.preventDefault();
            runItemAction(items[numKey - 1], numKey - 1);
            return;
          }
        }
      }

      // Arrow navigation
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = items[activeParentIndex].children ?? [];
          setSubSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(children.length - 1, 0)));
        } else {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = items[activeParentIndex].children ?? [];
          setSubSelectedIndex((prev) => (prev < children.length - 1 ? prev + 1 : 0));
        } else {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = items[activeParentIndex].children ?? [];
          if (children.length > 0) {
            const child = children[subSelectedIndex];
            if (child) {
              runChildAction(child);
            }
          }
        } else {
          runItemAction(items[selectedIndex], selectedIndex);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeParentIndex, isSubMenuOpen, items, isOpen, runChildAction, runItemAction, selectedIndex, subSelectedIndex, onClose]);

  // Reset the one-shot flag after level-1 is shown again
  useEffect(() => {
    if (!isSubMenuOpen && shouldSkipL1Stagger) {
      const id = setTimeout(() => setShouldSkipL1Stagger(false), 0);
      return () => clearTimeout(id);
    }
  }, [isSubMenuOpen, shouldSkipL1Stagger]);

  const getItemPosition = (index: number, total: number, radius: number): { x: number; y: number } => {
    const angle = (index * 2 * Math.PI) / Math.max(total, 1) - Math.PI / 2; // start from top
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  const selectedPosition = getItemPosition(selectedIndex, items.length, level1);
  const activeChildren = activeParentIndex !== null ? (items[activeParentIndex].children ?? []) : [];
  const subSelectedPosition = isSubMenuOpen && activeChildren.length > 0 ? getItemPosition(subSelectedIndex, activeChildren.length, level2) : { x: 0, y: 0 };

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className={`fixed inset-0 z-[10000] bg-transparent ${className ?? ''}`}
        style={{
          left: resolvedAnchor.x - size / 2,
          top: resolvedAnchor.y - size / 2,
          width: size,
          height: size,
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isOpen ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: isOpen ? 0.2 : 0.35 }}
        onClick={() => {
          if (isSubMenuOpen) {
            setShouldSkipL1Stagger(true);
            setIsSubMenuOpen(false);
            setActiveParentIndex(null);
          } else {
            onClose?.();
          }
        }}
      >
        {/* background mask */}
        <motion.div
          className="absolute inset-0"
          onClick={() => {
            if (isSubMenuOpen) {
              setShouldSkipL1Stagger(true);
              setIsSubMenuOpen(false);
              setActiveParentIndex(null);
            } else {
              onClose?.();
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isOpen ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isOpen ? 0.2 : 0.35 }}
        />

        <LayoutGroup>
          <div className="relative w-full h-full">
            {/* SVG layer for skill ring, pointer line, and center hub */}
            {!isSubMenuOpen && (
              <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                {/* Skill ring background */}
                <SkillRing cx={size / 2} cy={size / 2} radius={level1} itemCount={items.length} selectedIndex={selectedIndex} id="l1" />
                {/* Clock-hand pointer */}
                <PointerLine cx={size / 2} cy={size / 2} tx={size / 2 + selectedPosition.x} ty={size / 2 + selectedPosition.y} id="l1-pointer" />
                {/* Center hub */}
                <CenterHub cx={size / 2} cy={size / 2} id="l1" />
              </svg>
            )}

            {isSubMenuOpen && (
              <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                {/* Skill ring background for submenu */}
                <SkillRing cx={size / 2} cy={size / 2} radius={level2} itemCount={activeChildren.length} selectedIndex={subSelectedIndex} id="l2" />
                {/* Clock-hand pointer */}
                <PointerLine cx={size / 2} cy={size / 2} tx={size / 2 + subSelectedPosition.x} ty={size / 2 + subSelectedPosition.y} id="l2-pointer" />
              </svg>
            )}

            {/* level 1 ring */}
            {!isSubMenuOpen && (
              <>
                {items.map((item, index) => {
                  const position = getItemPosition(index, items.length, level1);
                  const isSelected = index === selectedIndex;
                  return (
                    <motion.div
                      key={item.id}
                      layoutId={`menu-item-${item.id}`}
                      className={`
                        absolute flex items-center justify-center
                        select-none rounded-full
                        w-16 h-16
                        ${
                          item.disabled
                            ? 'cursor-not-allowed opacity-45 bg-card/70 text-muted-foreground border border-border/40'
                            : isSelected
                              ? 'cursor-pointer bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)] ring-2 ring-primary/50 z-10'
                              : 'cursor-pointer bg-card/90 text-foreground border border-border/50 hover:border-primary/30'
                        }
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={shouldSkipL1Stagger ? false : { x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      animate={isOpen ? { x: 0, y: 0, scale: isSelected ? 1.1 : 1, opacity: 1 } : { x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      exit={{ x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      transition={{
                        ...(isOpen ? { type: 'spring', stiffness: 400, damping: 25 } : { duration: 0.22, ease: 'easeInOut' }),
                        delay: shouldSkipL1Stagger ? 0 : index * 0.02,
                        layout: { duration: 0.2 }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        runItemAction(item, index);
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      title={typeof item.label === 'string' ? item.label : undefined}
                    >
                      {/* Glow effect for selected item */}
                      {isSelected && (
                        <motion.div
                          className="absolute inset-0 rounded-full bg-primary/20"
                          initial={{ scale: 1 }}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <div className="text-2xl relative z-10">{item.icon}</div>
                      {(item.label || item.shortcut) && (
                        <div
                          className={`
                          pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 
                          text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-1 rounded-md
                          ${isSelected ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-card/95 text-foreground border border-border/50'}
                          backdrop-blur-sm
                        `}
                        >
                          {item.label} {item.shortcut ? <span className="uppercase opacity-70">({item.shortcut})</span> : null}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </>
            )}

            {/* level 2 ring mode: show parent at center and children around */}
            {isSubMenuOpen && activeParentIndex !== null && (
              <>
                {/* center parent button: click to go back */}
                <motion.div
                  layoutId={`menu-item-${items[activeParentIndex].id}`}
                  className="absolute w-16 h-16 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-[0_0_25px_rgba(var(--primary-rgb),0.4)] ring-2 ring-primary/50 cursor-pointer select-none z-10"
                  style={{ left: 'calc(50% - 32px)', top: 'calc(50% - 32px)' }}
                  initial={false}
                  animate={{ opacity: 1, scale: 1.15 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25, layout: { duration: 0.2 } }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShouldSkipL1Stagger(true);
                    setIsSubMenuOpen(false);
                    setActiveParentIndex(null);
                  }}
                >
                  <div className="text-2xl">{items[activeParentIndex].icon}</div>
                  {items[activeParentIndex].label && (
                    <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-1 rounded-md bg-primary text-primary-foreground shadow-lg">
                      {items[activeParentIndex].label}
                    </div>
                  )}
                </motion.div>

                {/* children ring */}
                {activeChildren.map((child, index) => {
                  const position = getItemPosition(index, activeChildren.length, level2);
                  const isSelected = index === subSelectedIndex;
                  return (
                    <motion.div
                      key={child.id}
                      className={`
                        absolute flex items-center justify-center
                        select-none rounded-full
                        w-16 h-16
                        ${
                          child.disabled
                            ? 'cursor-not-allowed opacity-45 bg-card/70 text-muted-foreground border border-border/40'
                            : isSelected
                              ? 'cursor-pointer bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)] ring-2 ring-primary/50 z-10'
                              : 'cursor-pointer bg-card/90 text-foreground border border-border/50 hover:border-primary/30'
                        }
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={{ x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      animate={isOpen ? { x: 0, y: 0, scale: isSelected ? 1.1 : 1, opacity: 1 } : { x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      exit={{ x: -position.x, y: -position.y, scale: 0.25, opacity: 0 }}
                      transition={{
                        ...(isOpen ? { type: 'spring', stiffness: 400, damping: 25 } : { duration: 0.22, ease: 'easeInOut' }),
                        delay: index * 0.02
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        runChildAction(child);
                      }}
                      onMouseEnter={() => setSubSelectedIndex(index)}
                      title={typeof child.label === 'string' ? child.label : undefined}
                    >
                      {/* Glow effect for selected item */}
                      {isSelected && (
                        <motion.div
                          className="absolute inset-0 rounded-full bg-primary/20"
                          initial={{ scale: 1 }}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <div className="text-2xl relative z-10">{child.icon ?? '•'}</div>
                      {child.label && (
                        <div
                          className={`
                          pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 
                          text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-1 rounded-md
                          ${isSelected ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-card/95 text-foreground border border-border/50'}
                          backdrop-blur-sm
                        `}
                        >
                          {child.label}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </>
            )}
          </div>
        </LayoutGroup>
      </motion.div>
    </AnimatePresence>
  );
};

export default RadialMenu;
