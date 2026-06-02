import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import DrawingCanvas from './DrawingCanvas'
import { RealtimeCursors } from './RealtimeCursors'
import PdfVoteModal from './PdfVoteModal'

export default function Workspace({ roomData, userName, showToast, onLeave, user, onSignOut }) {
  const { roomId } = roomData
  const [socket, setSocket]           = useState(null)
  const [page, setPage]               = useState(1)
  const [totalPages, setTotalPages]   = useState(1)
  const [pdfUrl, setPdfUrl]           = useState(roomData.pdfUrl)
  const [pdfName, setPdfName]         = useState(roomData.pdfName)
  const [connected, setConnected]     = useState(false)
  const [proposal, setProposal]       = useState(null) // active vote proposal
  const [myId, setMyId]               = useState(null)
  const socketRef = useRef(null)

  // Connect socket
  useEffect(() => {
    const s = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = s
    setSocket(s)

    s.on('connect',       () => { setConnected(true); s.emit('join-room', { roomId, name: userName }) })
    s.on('disconnect',    () => setConnected(false))
    s.on('connect_error', () => showToast('Connection lost. Reconnecting…', 'error'))

    // PDF voting events
    s.on('room-state', (data) => {
      if (data.myId) setMyId(data.myId)
      if (data.proposal) setProposal(data.proposal)
    })

    s.on('pdf-proposal', (prop) => {
      setProposal(prop)
    })

    s.on('pdf-vote-update', (prop) => {
      setProposal(prop)
    })

    s.on('pdf-accepted', ({ pdfUrl: newUrl, pdfName: newName }) => {
      setPdfUrl(newUrl)
      setPdfName(newName)
      setProposal(null)
      setPage(1)
      showToast(`Switched to "${newName}"`, 'success')
    })

    s.on('pdf-rejected', () => {
      setProposal(null)
      showToast('Vote failed — keeping current PDF', 'error')
    })

    return () => s.disconnect()
  }, [roomId, userName])

  // Get total page count whenever pdfUrl changes
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

  const handleProposePdf = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      showToast('Please select a PDF file', 'error'); return
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('File too large. Max 50MB.', 'error'); return
    }
    const formData = new FormData()
    formData.append('pdf', file)
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const data = await res.json()
      socket?.emit('propose-pdf', {
        pdfUrl: data.pdfUrl,
        pdfName: file.name,
        proposer: userName,
      })
      showToast('Proposal sent — waiting for votes…', 'success')
    } catch {
      showToast('Upload failed. Try again.', 'error')
    }
  }

  const handleVote = (vote) => {
    socket?.emit('cast-vote', { vote })
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
      <RealtimeCursors roomName={roomId} username={userName} />

      {/* Leave button */}
      <button
        onClick={onLeave}
        className="btn btn-ghost"
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, padding: '5px 14px', fontSize: 12 }}
      >
        ✕ Leave
      </button>

      {socket && (
        <DrawingCanvas
          socket={socket}
          roomId={roomId}
          page={page}
          pdfUrl={pdfUrl}
          pdfName={pdfName}
          onPageChange={handlePageChange}
          totalPages={totalPages}
          showToast={showToast}
          user={user}
          onSignOut={onSignOut}
          onProposePdf={handleProposePdf}
          myId={myId}
        />
      )}

      {/* PDF Vote Modal */}
      {proposal && (
        <PdfVoteModal
          proposal={proposal}
          myId={myId}
          onVote={handleVote}
          onClose={() => setProposal(null)}
        />
      )}
    </div>
  )
}
