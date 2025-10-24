import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

export interface RadialSubMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  children?: RadialSubMenuItem[];
}

export interface RadialMenuProps {
  items: RadialMenuItem[];
  open?: boolean;
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

const defaultRadii = { level1: 140, level2: 130 } as const;

export const RadialMenu: React.FC<RadialMenuProps> = ({ items, open = true, anchor, size = 600, radii, className, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const [activeParentIndex, setActiveParentIndex] = useState<number | null>(null);
  const [subSelectedIndex, setSubSelectedIndex] = useState(0);
  // When returning from level-2 to level-1, skip staggered entrance animation for level-1 items
  const [skipL1Stagger, setSkipL1Stagger] = useState(false);
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
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // ESC to close / back
      if (e.key === 'Escape') {
        if (isSubMenuOpen) {
          setSkipL1Stagger(true);
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
            children[numKey - 1].action();
            onClose?.();
            return;
          }
        } else {
          if (numKey >= 1 && numKey <= 9 && numKey <= items.length) {
            e.preventDefault();
            const item = items[numKey - 1];
            if (item.children && item.children.length > 0) {
              setActiveParentIndex(numKey - 1);
              setIsSubMenuOpen(true);
              setSubSelectedIndex(0);
            } else {
              item.action();
              onClose?.();
            }
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
            children[subSelectedIndex]?.action();
            onClose?.();
          }
        } else {
          const item = items[selectedIndex];
          if (item.children && item.children.length > 0) {
            setActiveParentIndex(selectedIndex);
            setIsSubMenuOpen(true);
            setSubSelectedIndex(0);
          } else {
            item.action();
            onClose?.();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, subSelectedIndex, isSubMenuOpen, activeParentIndex, items, onClose]);

  // Reset the one-shot flag after level-1 is shown again
  useEffect(() => {
    if (!isSubMenuOpen && skipL1Stagger) {
      const id = setTimeout(() => setSkipL1Stagger(false), 0);
      return () => clearTimeout(id);
    }
  }, [isSubMenuOpen, skipL1Stagger]);

  const getItemPosition = (index: number, total: number, radius: number): { x: number; y: number } => {
    const angle = (index * 2 * Math.PI) / Math.max(total, 1) - Math.PI / 2; // start from top
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  const selectedPosition = getItemPosition(selectedIndex, items.length, level1);
  const activeChildren = activeParentIndex !== null ? (items[activeParentIndex].children ?? []) : [];
  const subSelectedPosition = isSubMenuOpen && activeChildren.length > 0 ? getItemPosition(subSelectedIndex, activeChildren.length, level2) : { x: 0, y: 0 };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className={`fixed inset-0 pointer-events-auto z-[10000] bg-transparent ${className ?? ''}`}
        style={{
          left: resolvedAnchor.x - size / 2,
          top: resolvedAnchor.y - size / 2,
          width: size,
          height: size
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => {
          if (isSubMenuOpen) {
            setSkipL1Stagger(true);
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
              setSkipL1Stagger(true);
              setIsSubMenuOpen(false);
              setActiveParentIndex(null);
            } else {
              onClose?.();
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />

        <LayoutGroup>
          <div className="relative w-full h-full">
            {/* connector line (level 1 or 2) */}
            {!isSubMenuOpen && (
              <svg className="absolute inset-0 text-primary" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                <line x1={size / 2} y1={size / 2} x2={size / 2 + selectedPosition.x} y2={size / 2 + selectedPosition.y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx={size / 2} cy={size / 2} r={6} fill="currentColor" />
                <circle cx={size / 2 + selectedPosition.x} cy={size / 2 + selectedPosition.y} r={3} fill="currentColor" />
              </svg>
            )}

            {isSubMenuOpen && (
              <svg className="absolute inset-0 text-primary" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                <line x1={size / 2} y1={size / 2} x2={size / 2 + subSelectedPosition.x} y2={size / 2 + subSelectedPosition.y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx={size / 2} cy={size / 2} r={6} fill="currentColor" />
                <circle cx={size / 2 + subSelectedPosition.x} cy={size / 2 + subSelectedPosition.y} r={3} fill="currentColor" />
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
                      layout
                      layoutId={`menu-item-${item.id}`}
                      className={`
                        absolute w-16 h-16 rounded-full flex items-center justify-center
                        cursor-pointer select-none
                        ${isSelected ? 'bg-muted text-muted-foreground shadow-xl ring-2' : 'bg-foreground text-background'}
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      // Skip staggered delay when returning from level-2 to level-1
                      transition={{ type: 'spring', delay: skipL1Stagger ? 0 : index * 0.06, duration: 0.5, layout: { duration: 0.35 } }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.children && item.children.length > 0) {
                          setActiveParentIndex(index);
                          setIsSubMenuOpen(true);
                          setSubSelectedIndex(0);
                        } else {
                          item.action();
                          onClose?.();
                        }
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      title={typeof item.label === 'string' ? item.label : undefined}
                    >
                      <div className="text-2xl">{item.icon}</div>
                      {(item.label || item.shortcut) && (
                        <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
                          {item.label} {item.shortcut ? <span className="uppercase opacity-80">({item.shortcut})</span> : null}
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
                  layout
                  layoutId={`menu-item-${items[activeParentIndex].id}`}
                  className="absolute w-20 h-20 rounded-full flex items-center justify-center bg-foreground text-background shadow-xl ring-2 cursor-pointer select-none"
                  style={{ left: 'calc(50% - 40px)', top: 'calc(50% - 40px)' }}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', duration: 0.4, layout: { duration: 0.35 } }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSkipL1Stagger(true);
                    setIsSubMenuOpen(false);
                    setActiveParentIndex(null);
                  }}
                >
                  <div className="text-2xl">{items[activeParentIndex].icon}</div>
                  {items[activeParentIndex].label && (
                    <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
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
                        absolute w-16 h-16 rounded-full flex items-center justify-center
                        cursor-pointer select-none
                        ${isSelected ? 'bg-muted text-muted-foreground shadow-xl ring-2' : 'bg-foreground text-background'}
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', delay: index * 0.06, duration: 0.5 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        child.action();
                        onClose?.();
                      }}
                      onMouseEnter={() => setSubSelectedIndex(index)}
                      title={typeof child.label === 'string' ? child.label : undefined}
                    >
                      <div className="text-2xl">{child.icon ?? '•'}</div>
                      {child.label && (
                        <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
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
