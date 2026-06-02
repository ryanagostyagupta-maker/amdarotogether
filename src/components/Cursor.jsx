import { MousePointer2 } from 'lucide-react'

export function Cursor({ style, color, name }) {
  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        transitionProperty: 'transform',
        transitionTimingFunction: 'linear',
        transitionDuration: '20ms',
        ...style,
      }}
    >
      <MousePointer2
        size={24}
        color={color}
        fill={color}
        style={{ filter: `drop-shadow(0 2px 4px ${color}66)` }}
      />
      <div
        style={{
          marginTop: 4,
          padding: '2px 8px',
          borderRadius: 99,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          color: 'white',
          backgroundColor: color,
          whiteSpace: 'nowrap',
          boxShadow: `0 2px 8px ${color}55`,
          display: 'inline-block',
        }}
      >
        {name}
      </div>
    </div>
  )
}
