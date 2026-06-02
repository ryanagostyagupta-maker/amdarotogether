import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import DrawingCanvas from './DrawingCanvas'
import { RealtimeCursors } from './RealtimeCursors'

export default function Workspace({ roomData, userName, showToast, onLeave, user, onSignOut }) {
  const { roomId, pdfUrl, pdfName } = roomData
  const [socket, setSocket]           = useState(null)
  const [page, setPage]               = useState(1)
  const [totalPages, setTotalPages]   = useState(1)
  const [connected, setConnected]     = useState(false)
  const socketRef = useRef(null)

  // Connect socket
  useEffect(() => {
    const s = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = s
    setSocket(s)

    s.on('connect',        () => { setConnected(true);  s.emit('join-room', { roomId, name: userName }) })
    s.on('disconnect',     () => setConnected(false))
    s.on('connect_error',  () => showToast('Connection lost. Reconnecting…', 'error'))

    return () => s.disconnect()
  }, [roomId, userName])

  // Get total page count
  useEffect(() => {
    if (!pdfUrl) return
    import('pdfjs-dist').then(pdfjsLib => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      pdfjsLib.getDocument({ url: pdfUrl }).promise.then(doc => setTotalPages(doc.numPages))
    })
  }, [pdfUrl])

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>

      {/* ── Supabase Realtime Cursors overlay (full window) ── */}
      <RealtimeCursors roomName={roomId} username={userName} />



      {/* Leave button */}
      <button
        onClick={onLeave}
        className="btn btn-ghost"
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 9999,
          padding: '5px 14px', fontSize: 12,
        }}
      >
        ✕ Leave
      </button>

      {socket && (
        <DrawingCanvas
          socket={socket}
          roomId={roomId}
          page={page}
          pdfUrl={pdfUrl}
          onPageChange={handlePageChange}
          totalPages={totalPages}
          showToast={showToast}
          user={user}
          onSignOut={onSignOut}
        />
      )}
    </div>
  )
}
