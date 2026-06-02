import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const EVENT_NAME = 'realtime-cursor-move'
const THROTTLE_MS = 50

const generateRandomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`
const generateRandomId = () => Math.floor(Math.random() * 1_000_000)

function useThrottleCallback(callback, delay) {
  const lastCall = useRef(0)
  const timeout = useRef(null)

  return useCallback(
    (...args) => {
      const now = Date.now()
      const remaining = delay - (now - lastCall.current)

      if (remaining <= 0) {
        if (timeout.current) {
          clearTimeout(timeout.current)
          timeout.current = null
        }
        lastCall.current = now
        callback(...args)
      } else if (!timeout.current) {
        timeout.current = setTimeout(() => {
          lastCall.current = Date.now()
          timeout.current = null
          callback(...args)
        }, remaining)
      }
    },
    [callback, delay]
  )
}

export function useRealtimeCursors({ roomName, username }) {
  const [color] = useState(generateRandomColor)
  const [userId] = useState(generateRandomId)
  const [cursors, setCursors] = useState({})
  const cursorPayload = useRef(null)
  const channelRef = useRef(null)

  const broadcast = useCallback(
    (event) => {
      const { clientX, clientY } = event
      const payload = {
        position: { x: clientX, y: clientY },
        user: { id: userId, name: username },
        color,
        timestamp: Date.now(),
      }
      cursorPayload.current = payload
      channelRef.current?.send({
        type: 'broadcast',
        event: EVENT_NAME,
        payload,
      })
    },
    [color, userId, username]
  )

  const handleMouseMove = useThrottleCallback(broadcast, THROTTLE_MS)

  useEffect(() => {
    if (!roomName) return

    const channel = supabase.channel(`cursors:${roomName}`)

    channel
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p) => {
          setCursors((prev) => {
            const next = { ...prev }
            delete next[p.key]
            return next
          })
        })
      })
      .on('presence', { event: 'join' }, () => {
        // Broadcast our position to new joiners
        if (cursorPayload.current) {
          channelRef.current?.send({
            type: 'broadcast',
            event: EVENT_NAME,
            payload: cursorPayload.current,
          })
        }
      })
      .on('broadcast', { event: EVENT_NAME }, ({ payload }) => {
        if (payload.user.id === userId) return  // skip own cursor
        setCursors((prev) => ({
          ...prev,
          [payload.user.id]: payload,
        }))
      })
      .subscribe(async (status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          await channel.track({ key: userId })
          channelRef.current = channel
        } else {
          setCursors({})
          channelRef.current = null
        }
      })

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [roomName, userId])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  return { cursors }
}
