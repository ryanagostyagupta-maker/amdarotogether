import { useEffect, useRef, useCallback, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { DrawingToolbar } from './Toolbar'

import { version } from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

const COLORS = [
  '#ff6b6b', '#ff9f43', '#feca57', '#48dbfb',
  '#1dd1a1', '#7c6aff', '#f368e0', '#ffffff',
  '#54a0ff', '#ff4757', '#2ed573', '#eccc68',
]

export default function DrawingCanvas({
  socket, roomId, page, pdfUrl, onPageChange, totalPages, showToast, user, onSignOut
}) {
  const pdfCanvasRef = useRef()
  const drawCanvasRef = useRef()
  const containerRef = useRef()

  const [tool, setTool]               = useState('pen')
  const [color, setColor]             = useState('#7c6aff')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [opacity, setOpacity]         = useState(1)
  const [zoom, setZoom]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [users, setUsers]             = useState([])
  const [myId, setMyId]               = useState(null)
  const [inviteCode, setInviteCode]   = useState('')
  const [copied, setCopied]           = useState(false)
  const [pdfName, setPdfName]         = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const pdfDocRef   = useRef(null)
  const isDrawing   = useRef(false)
  const currentPath = useRef([])
  const strokes     = useRef([])
  const remotePaths = useRef({})
  const undoStack   = useRef([])
  const pageRef     = useRef(page)
  const toolRef     = useRef(tool)
  const colorRef    = useRef(color)
  const widthRef    = useRef(strokeWidth)
  const opacityRef  = useRef(opacity)

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { widthRef.current = strokeWidth }, [strokeWidth])
  useEffect(() => { opacityRef.current = opacity }, [opacity])
  useEffect(() => { pageRef.current = page }, [page])

  const renderTaskRef = useRef(null)

  // ── Load PDF ──────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) return
    setLoading(true)
    pdfjsLib.getDocument({ url: pdfUrl }).promise.then(doc => {
      pdfDocRef.current = doc
      renderPage(page)
    }).catch(() => showToast('Failed to load PDF', 'error'))
  }, [pdfUrl])

  useEffect(() => {
    if (pdfDocRef.current) renderPage(page)
  }, [page, zoom])

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDocRef.current) return

    // Cancel any active rendering task to prevent concurrency exceptions
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel()
      } catch (err) {
        console.warn("PDF render cancel warning:", err)
      }
    }

    setLoading(true)
    try {
      const pdfPage = await pdfDocRef.current.getPage(pageNum)
      const viewport = pdfPage.getViewport({ scale: zoom * 1.5 })

      const pdfCanvas  = pdfCanvasRef.current
      const drawCanvas = drawCanvasRef.current
      if (!pdfCanvas) return

      pdfCanvas.width  = viewport.width
      pdfCanvas.height = viewport.height
      drawCanvas.width  = viewport.width
      drawCanvas.height = viewport.height

      const ctx = pdfCanvas.getContext('2d')
      const renderTask = pdfPage.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = renderTask

      await renderTask.promise
      redrawStrokes()
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error("PDF page render error:", err)
        showToast('Failed to load PDF page', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [zoom])

  // ── Socket events ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    socket.on('room-state', (data) => {
      strokes.current = data.strokes || []
      setUsers(data.users || [])
      setMyId(data.myId)
      setInviteCode(data.inviteCode || '')
      setPdfName(data.pdfName || '')
      redrawStrokes()
    })

    socket.on('users-updated', (list) => setUsers(list))

    socket.on('draw-start', ({ userId, x, y, tool, color, width, opacity: op }) => {
      remotePaths.current[userId] = { tool, color, width, opacity: op, points: [{ x, y }] }
    })

    socket.on('draw-move', ({ userId, x, y }) => {
      const path = remotePaths.current[userId]
      if (!path) return
      path.points.push({ x, y })
      redrawStrokes()
      const ctx = drawCanvasRef.current?.getContext('2d')
      if (ctx) drawStroke(ctx, { ...path, page: pageRef.current })
    })

    socket.on('draw-end', ({ userId, stroke }) => {
      if (stroke) strokes.current.push(stroke)
      delete remotePaths.current[userId]
      redrawStrokes()
    })

    socket.on('page-change', ({ page: newPage }) => onPageChange(newPage))

    socket.on('clear-page', ({ page: p }) => {
      if (p === pageRef.current) {
        strokes.current = strokes.current.filter(s => s.page !== p)
        redrawStrokes()
      }
    })

    socket.on('sync-strokes', ({ strokes: s }) => {
      strokes.current = s
      redrawStrokes()
    })

    socket.on('user-left', ({ id }) => {
      delete remotePaths.current[id]
    })

    return () => {
      socket.off('room-state')
      socket.off('users-updated')
      socket.off('draw-start')
      socket.off('draw-move')
      socket.off('draw-end')
      socket.off('page-change')
      socket.off('clear-page')
      socket.off('sync-strokes')
      socket.off('user-left')
    }
  }, [socket, onPageChange])

  // ── Drawing helpers ───────────────────────────────────
  const redrawStrokes = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokes.current
      .filter(s => s.page === pageRef.current)
      .forEach(s => drawStroke(ctx, s))
  }, [])

  const drawStroke = (ctx, stroke) => {
    if (!stroke?.points?.length) return
    ctx.save()
    ctx.globalAlpha = stroke.opacity ?? 1

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
      ctx.globalAlpha = 0.35
    } else if (stroke.tool === 'rectangle') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
      ctx.fillStyle   = stroke.color + '22'
      if (stroke.points.length >= 2) {
        const s = stroke.points[0]
        const e = stroke.points[stroke.points.length - 1]
        ctx.lineWidth = stroke.width
        ctx.beginPath()
        ctx.roundRect(s.x, s.y, e.x - s.x, e.y - s.y, 4)
        ctx.fill(); ctx.stroke()
      }
      ctx.restore(); return
    } else if (stroke.tool === 'arrow') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
      ctx.fillStyle   = stroke.color
      if (stroke.points.length >= 2) {
        const s = stroke.points[0]
        const e = stroke.points[stroke.points.length - 1]
        const angle = Math.atan2(e.y - s.y, e.x - s.x)
        const head  = 14 + stroke.width * 2
        ctx.lineWidth = stroke.width
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(e.x, e.y)
        ctx.lineTo(e.x - head * Math.cos(angle - 0.4), e.y - head * Math.sin(angle - 0.4))
        ctx.lineTo(e.x - head * Math.cos(angle + 0.4), e.y - head * Math.sin(angle + 0.4))
        ctx.closePath(); ctx.fill()
      }
      ctx.restore(); return
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
    }

    ctx.lineWidth = stroke.width
    ctx.lineCap   = 'round'
    ctx.lineJoin  = 'round'
    ctx.beginPath()
    stroke.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y))
    ctx.stroke()
    ctx.restore()
  }

  // ── Pointer events ────────────────────────────────────
  const getPos = (e) => {
    const canvas = drawCanvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY }
  }

  const onPointerDown = (e) => {
    if (toolRef.current === 'text') return
    e.preventDefault()
    isDrawing.current = true
    const pos = getPos(e)
    currentPath.current = [pos]
    socket?.emit('draw-start', {
      x: pos.x, y: pos.y,
      tool: toolRef.current,
      color: colorRef.current,
      width: toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current,
      opacity: toolRef.current === 'highlighter' ? 0.35 : opacityRef.current,
      page: pageRef.current,
    })
  }

  const onPointerMove = (e) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const pos = getPos(e)
    currentPath.current.push(pos)

    const canvas = drawCanvasRef.current
    const ctx    = canvas.getContext('2d')
    redrawStrokes()
    drawStroke(ctx, {
      points:  currentPath.current,
      tool:    toolRef.current,
      color:   colorRef.current,
      width:   toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current,
      opacity: toolRef.current === 'highlighter' ? 0.35 : opacityRef.current,
      page:    pageRef.current,
    })
    socket?.emit('draw-move', { x: pos.x, y: pos.y, page: pageRef.current })
  }

  const onPointerUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const stroke = {
      points:  currentPath.current,
      tool:    toolRef.current,
      color:   colorRef.current,
      width:   toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current,
      opacity: toolRef.current === 'highlighter' ? 0.35 : opacityRef.current,
      page:    pageRef.current,
    }
    strokes.current.push(stroke)
    undoStack.current.push(stroke)
    redrawStrokes()
    socket?.emit('draw-end', { stroke, page: pageRef.current })
    currentPath.current = []
  }

  // ── Toolbar actions ───────────────────────────────────
  const handleUndo = () => {
    if (!undoStack.current.length) return
    const last = undoStack.current.pop()
    strokes.current = strokes.current.filter(s => s !== last)
    redrawStrokes()
    socket?.emit('undo')
  }

  const handleClearPage = () => {
    strokes.current = strokes.current.filter(s => s.page !== pageRef.current)
    redrawStrokes()
    socket?.emit('clear-page', { page: pageRef.current })
    showToast('Page cleared', 'success')
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}?room=${roomId}`
    navigator.clipboard.writeText(url)
    showToast('Share link copied!', 'success')
  }

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    showToast('Invite code copied!', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  const getCursor = () => {
    if (tool === 'eraser')    return 'cell'
    if (tool === 'text')      return 'text'
    if (tool === 'rectangle') return 'crosshair'
    return 'crosshair'
  }

  return (
    <div className="workspace">
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.svg" alt="Amdaro Logo" style={{ width: 20, height: 20 }} />
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>Amdaro</span>
            </div>
            {pdfName && (
              <div className="sidebar-pdf-name" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }} title={pdfName}>
                {pdfName}
              </div>
            )}
          </div>
          <button className="copy-btn" onClick={() => setSidebarOpen(false)} style={{ fontSize: 14 }} title="Close">✕</button>
        </div>

        {/* Color Palette */}
        <div className="sidebar-section" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="sidebar-section-title" style={{ fontSize: 10, marginBottom: 8 }}>Color</div>
          <div className="color-palette" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {COLORS.slice(0, 8).map(c => (
              <div
                key={c}
                className={`color-swatch ${color === c ? 'active' : ''}`}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  transform: color === c ? 'scale(1.1)' : 'none',
                  transition: 'all var(--transition)'
                }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
            <label className="color-input-wrap" style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              fontSize: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }} title="Custom color">
              🎨
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
            </label>
          </div>
        </div>

        {/* Stroke controls */}
        <div className="sidebar-section" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="sidebar-section-title" style={{ fontSize: 10, marginBottom: 8 }}>Stroke</div>
          <div className="stroke-controls" style={{ gap: 8 }}>
            <div className="stroke-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Size</span>
              <input
                type="range" min="1" max="30" value={strokeWidth}
                onChange={e => setStrokeWidth(+e.target.value)}
                className="stroke-slider"
                style={{ flex: 1, margin: '0 8px', height: 2 }}
              />
              <span style={{ color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{strokeWidth}px</span>
            </div>
            {tool !== 'highlighter' && tool !== 'eraser' && (
              <div className="stroke-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Opacity</span>
                <input
                  type="range" min="10" max="100"
                  value={Math.round(opacity * 100)}
                  onChange={e => setOpacity(e.target.value / 100)}
                  className="stroke-slider"
                  style={{ flex: 1, margin: '0 8px', height: 2 }}
                />
                <span style={{ color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{Math.round(opacity * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Room Invite Code */}
        <div className="sidebar-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Session Code</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#ffffff', fontWeight: 600 }}>{inviteCode || '------'}</span>
            <button
              onClick={copyInviteCode}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
              title="Copy"
            >
              {copied ? '✓' : '⎘'}
            </button>
          </div>
        </div>

        {/* Online Users */}
        <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div className="sidebar-section-title" style={{ fontSize: 10, marginBottom: 8 }}>Online ({users.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.color }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{u.name}</span>
                {u.id === myId && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(You)</span>}
              </div>
            ))}
          </div>
        </div>

        {/* User Account / Sign Out */}
        {user && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.01)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maxWidth: 160
            }} title={user.email}>
              {user.email}
            </div>
            <button
              onClick={onSignOut}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                textDecoration: 'underline'
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* ── PDF Canvas Area ── */}
      <div className="pdf-area">
        {/* Top bar */}
        <div className="top-bar">
          {!sidebarOpen && (
            <button
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: 13 }}
              onClick={() => setSidebarOpen(true)}
            >☰</button>
          )}

          <div className="page-controls">
            <button
              className="page-btn"
              onClick={() => { onPageChange(page - 1); socket?.emit('page-change', { page: page - 1 }) }}
              disabled={page <= 1}
            >‹</button>
            <span className="page-info">Page {page} / {totalPages}</span>
            <button
              className="page-btn"
              onClick={() => { onPageChange(page + 1); socket?.emit('page-change', { page: page + 1 }) }}
              disabled={page >= totalPages}
            >›</button>
          </div>

          <div className="zoom-controls">
            <button className="page-btn" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}>−</button>
            <span className="zoom-badge">{Math.round(zoom * 100)}%</span>
            <button className="page-btn" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>+</button>
            <button className="page-btn" onClick={() => setZoom(1)} style={{ fontSize: 11 }}>⊡</button>
          </div>
        </div>

        {/* PDF scroll */}
        <div className="pdf-scroll" ref={containerRef}>
          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <p className="loading-text">Rendering PDF…</p>
            </div>
          )}
          <div className="canvas-container" style={{ cursor: getCursor() }}>
            <canvas ref={pdfCanvasRef} id="pdf-canvas" />
            <canvas
              ref={drawCanvasRef}
              id="draw-canvas"
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            />
          </div>
        </div>

        {/* ── Floating Toolbar (KokonutUI) ── */}
        <div style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
        }}>
          <DrawingToolbar
            tool={tool}
            onToolSelect={setTool}
            onUndo={handleUndo}
            onClear={handleClearPage}
            onCopyLink={handleCopyLink}
          />
        </div>
      </div>
    </div>
  )
}
