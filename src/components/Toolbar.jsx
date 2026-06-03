/**
 * Apple-inspired Drawing Toolbar
 * Clean, no gradients, SF-style
 */
import { Pencil, Highlighter, Eraser, Scissors, MoveUpRight, Square, Circle, Type, Undo2, Trash2, Link, Sun, Moon, Check, Hand } from 'lucide-react'
import { useState } from 'react'

const TOOLS = [
  { id: 'pen',           Icon: Pencil,      label: 'Pen'        },
  { id: 'highlighter',   Icon: Highlighter, label: 'Marker'     },
  { id: 'eraser',        Icon: Eraser,      label: 'Eraser'     },
  { id: 'stroke-eraser', Icon: Scissors,    label: 'Stroke Erase' },
  { id: 'arrow',         Icon: MoveUpRight, label: 'Arrow'      },
  { id: 'rectangle',     Icon: Square,      label: 'Rect'       },
  { id: 'circle',        Icon: Circle,      label: 'Circle'     },
  { id: 'text',          Icon: Type,        label: 'Text'       },
  { id: 'pan',           Icon: Hand,        label: 'Pan'        },
]

export function DrawingToolbar({ tool, onToolSelect, onUndo, onClear, onCopyLink, theme = 'dark', onToggleTheme }) {
  const [copied, setCopied] = useState(false)

  const isDark = theme === 'dark'

  const pill = {
    display: 'flex', alignItems: 'center', gap: 2,
    background: isDark ? 'rgba(28,28,30,0.94)' : 'rgba(255,255,255,0.94)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: isDark ? '0.5px solid rgba(255,255,255,0.1)' : '0.5px solid rgba(0,0,0,0.1)',
    borderRadius: 16,
    padding: '4px 6px',
    boxShadow: isDark
      ? '0 4px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset'
      : '0 4px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(255,255,255,0.8) inset',
  }

  const toolBtn = (id) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 9,
    border: 'none', cursor: 'pointer',
    background: tool === id
      ? isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)'
      : 'transparent',
    color: tool === id
      ? isDark ? '#fff' : '#1d1d1f'
      : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    transition: 'background 0.12s ease, color 0.12s ease',
    outline: 'none',
  })

  const actionBtn = (danger = false, active = false) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 9,
    border: 'none', cursor: 'pointer',
    background: active
      ? isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)'
      : 'transparent',
    color: danger
      ? 'rgba(239,68,68,0.7)'
      : active
        ? isDark ? '#fff' : '#1d1d1f'
        : isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)',
    transition: 'background 0.12s ease, color 0.12s ease',
    outline: 'none',
  })

  const divider = {
    width: 1, height: 20, flexShrink: 0, margin: '0 3px',
    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  }

  const handleCopy = () => {
    onCopyLink?.()
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div style={pill}>
      {/* ── Drawing tools ── */}
      {TOOLS.map(({ id, Icon, label }) => (
        <button
          key={id}
          onClick={() => onToolSelect?.(id)}
          title={label}
          style={toolBtn(id)}
          onMouseEnter={e => { if (tool !== id) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }}
          onMouseLeave={e => { if (tool !== id) e.currentTarget.style.background = 'transparent' }}
        >
          <Icon size={15} strokeWidth={tool === id ? 2.2 : 1.6} />
        </button>
      ))}

      <div style={divider} />

      {/* ── Actions ── */}
      <button
        onClick={onUndo}
        title="Undo (⌘Z)"
        style={actionBtn()}
        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Undo2 size={15} strokeWidth={1.6} />
      </button>

      <button
        onClick={onClear}
        title="Clear page"
        style={actionBtn(true)}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)' }}
      >
        <Trash2 size={15} strokeWidth={1.6} />
      </button>

      <div style={divider} />

      {/* ── Theme toggle ── */}
      <button
        onClick={onToggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={actionBtn()}
        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {isDark
          ? <Sun size={15} strokeWidth={1.6} />
          : <Moon size={15} strokeWidth={1.6} />
        }
      </button>

      {/* ── Share ── */}
      <button
        onClick={handleCopy}
        title="Copy share link"
        style={actionBtn(false, copied)}
        onMouseEnter={e => { if (!copied) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }}
        onMouseLeave={e => { if (!copied) e.currentTarget.style.background = 'transparent' }}
      >
        {copied
          ? <Check size={15} strokeWidth={2} style={{ color: '#34d399' }} />
          : <Link size={15} strokeWidth={1.6} />
        }
      </button>
    </div>
  )
}

export default DrawingToolbar
