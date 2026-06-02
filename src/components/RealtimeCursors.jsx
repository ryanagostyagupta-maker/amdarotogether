import { Cursor } from './Cursor'
import { useRealtimeCursors } from '../hooks/useRealtimeCursors'

/**
 * Renders all remote users' cursors as fixed overlays on the full window.
 * Uses Supabase Realtime Broadcast — mirrors the official Supabase UI pattern.
 */
export function RealtimeCursors({ roomName, username }) {
  const { cursors } = useRealtimeCursors({ roomName, username })

  return (
    <>
      {Object.entries(cursors).map(([id, data]) => (
        <Cursor
          key={id}
          color={data.color}
          name={data.user.name}
          style={{
            transform: `translate(${data.position.x}px, ${data.position.y}px)`,
          }}
        />
      ))}
    </>
  )
}
