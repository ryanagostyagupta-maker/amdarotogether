/**
 * Adapted from KokonutUI Toolbar by @dorianbaffier
 * https://kokonutui.com — MIT License
 * Ported to JSX + CSS variables (no Tailwind) for this project.
 */

import {
  Pencil,
  Highlighter,
  Eraser,
  MoveUpRight,
  Square,
  Type,
  Undo2,
  Trash2,
  Lock,
  Unlock,
  Link,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, useCallback } from 'react'
import { cn } from '../lib/utils'

const DRAWING_TOOLS = [
  { id: 'pen',         title: 'Pen',       icon: Pencil      },
  { id: 'highlighter', title: 'Highlight', icon: Highlighter },
  { id: 'eraser',      title: 'Eraser',    icon: Eraser      },
  { id: 'arrow',       title: 'Arrow',     icon: MoveUpRight },
  { id: 'rectangle',   title: 'Rect',      icon: Square      },
  { id: 'text',        title: 'Text',      icon: Type        },
  { id: 'undo',        title: 'Undo',      icon: Undo2       },
  { id: 'clear',       title: 'Clear',     icon: Trash2      },
]

const buttonVariants = {
  initial: { gap: 0, paddingLeft: '0.5rem', paddingRight: '0.5rem' },
  animate: (isSelected) => ({
    gap: isSelected ? '0.4rem' : 0,
    paddingLeft:  isSelected ? '0.85rem' : '0.5rem',
    paddingRight: isSelected ? '0.85rem' : '0.5rem',
  }),
}

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: 'auto', opacity: 1 },
  exit:    { width: 0, opacity: 0 },
}

const notifVariants = {
  initial: { opacity: 0, y: 10  },
  animate: { opacity: 1, y: -12 },
  exit:    { opacity: 0, y: -22 },
}

const lineVariants = {
  initial: { scaleX: 0, x: '-50%' },
  animate: { scaleX: 1, x: '0%', transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { scaleX: 0, x: '50%', transition: { duration: 0.2, ease: 'easeIn'  } },
}

const spring = { type: 'spring', bounce: 0, duration: 0.4 }

export function DrawingToolbar({ onToolSelect, onUndo, onClear, onCopyLink, tool: activeTool }) {
  const [locked, setLocked]   = useState(false)
  const [notif, setNotif]     = useState(null)

  const handleItem = useCallback((item) => {
    if (locked && item.id !== 'undo' && item.id !== 'clear') return

    setNotif(item.id)
    setTimeout(() => setNotif(null), 1200)

    if (item.id === 'undo')  { onUndo?.();  return }
    if (item.id === 'clear') { onClear?.(); return }
    onToolSelect?.(item.id)
  }, [locked, onUndo, onClear, onToolSelect])

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* Floating notification above toolbar */}
      <AnimatePresence>
        {notif && (
          <motion.div
            key={notif}
            variants={notifVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25 }}
            style={{
              position: 'absolute',
              top: -32,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 50,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              background: 'var(--accent-1)',
              color: 'white',
              borderRadius: 99,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap',
            }}>
              {DRAWING_TOOLS.find(t => t.id === notif)?.title || notif}
            </div>
            <motion.div
              variants={lineVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{
                position: 'absolute',
                bottom: -3,
                left: '50%',
                height: 2,
                width: '100%',
                background: 'var(--accent-1)',
                borderRadius: 99,
                originX: 0,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
      }}>

        {/* Drawing tool buttons */}
        {DRAWING_TOOLS.map((item) => {
          const Icon = item.icon
          const isSelected = activeTool === item.id
          const isDanger = item.id === 'clear'

          return (
            <motion.button
              key={item.id}
              custom={isSelected}
              initial={false}
              animate="animate"
              variants={buttonVariants}
              transition={spring}
              onClick={() => handleItem(item)}
              title={item.title}
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 10,
                height: 36,
                border: 'none',
                cursor: locked && item.id !== 'undo' && item.id !== 'clear' ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 500,
                transition: 'background 0.2s, color 0.2s',
                background: isSelected
                  ? 'var(--accent-gradient)'
                  : isDanger
                    ? 'rgba(239,68,68,0.1)'
                    : 'transparent',
                color: isSelected
                  ? 'white'
                  : isDanger
                    ? '#ef4444'
                    : 'var(--text-secondary)',
                boxShadow: isSelected ? 'var(--accent-glow)' : 'none',
                opacity: locked && item.id !== 'undo' && item.id !== 'clear' ? 0.4 : 1,
              }}
            >
              <Icon size={15} />
              <AnimatePresence initial={false}>
                {isSelected && (
                  <motion.span
                    variants={spanVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={spring}
                    style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                  >
                    {item.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}

        {/* Divider */}
        <div style={{
          width: 1, height: 24,
          background: 'var(--border)',
          margin: '0 4px',
          flexShrink: 0,
        }} />

        {/* Share link button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { onCopyLink?.(); setNotif('link'); setTimeout(() => setNotif(null), 1200) }}
          title="Copy share link"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            height: 36,
            borderRadius: 10,
            border: '1px solid var(--border-accent)',
            background: 'rgba(124,106,255,0.1)',
            color: 'var(--accent-2)',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Link size={13} />
          Share
        </motion.button>

        {/* Lock/unlock drawing */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setLocked(l => !l)}
          title={locked ? 'Unlock drawing' : 'Lock drawing'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            height: 36,
            borderRadius: 10,
            border: `1px solid ${locked ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
            background: locked ? 'rgba(239,68,68,0.12)' : 'var(--bg-glass)',
            color: locked ? '#ef4444' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {locked ? <Lock size={13} /> : <Unlock size={13} />}
          {locked ? 'Locked' : 'Unlocked'}
        </motion.button>
      </div>
    </div>
  )
}

export default DrawingToolbar
