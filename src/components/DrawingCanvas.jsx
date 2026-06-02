import { useEffect, useRef, useCallback, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { DrawingToolbar } from './Toolbar'
import ColorPicker from './ColorPicker'

import { version } from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

const COLORS = [
  '#ff6b6b', '#ff9f43', '#feca57', '#48dbfb',
  '#1dd1a1', '#7c6aff', '#f368e0', '#ffffff',
  '#54a0ff', '#ff4757', '#2ed573', '#eccc68',
]

export default function DrawingCanvas({
  socket, roomId, page, pdfUrl, pdfName: pdfNameProp, onPageChange, totalPages,
  showToast, user, onSignOut, onProposePdf, myId: myIdProp
}) {
  const pdfCanvasRef    = useRef()
  const staticCanvasRef = useRef()   // committed strokes layer
  const drawCanvasRef   = useRef()   // live / in-progress stroke layer
  const containerRef    = useRef()

  const [tool, setTool]               = useState('pen')
  const [color, setColor]             = useState('#7c6aff')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [opacity, setOpacity]         = useState(1)
  const [zoom, setZoom]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [users, setUsers]             = useState([])
  const [myId, setMyId]               = useState(myIdProp || null)
  const [inviteCode, setInviteCode]   = useState('')
  const [copied, setCopied]           = useState(false)
  const [pdfName, setPdfName]         = useState(pdfNameProp || '')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const proposeInputRef               = useRef()

  // Text tool state
  const [textPos, setTextPos]     = useState(null)   // {x, y} in canvas coords
  const [textVal, setTextVal]     = useState('')
  const textInputRef              = useRef()

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
      if (staticCanvasRef.current) {
        staticCanvasRef.current.width  = viewport.width
        staticCanvasRef.current.height = viewport.height
      }
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
      // Draw remote live stroke on the live canvas
      const ctx = drawCanvasRef.current?.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        Object.values(remotePaths.current).forEach(p =>
          drawStroke(ctx, { ...p, page: pageRef.current })
        )
      }
    })

    socket.on('draw-end', ({ userId, stroke }) => {
      // Commit remote stroke to static canvas
      if (stroke) {
        strokes.current.push(stroke)
        const ctx = staticCanvasRef.current?.getContext('2d')
        if (ctx) drawStroke(ctx, stroke)
      }
      delete remotePaths.current[userId]
      // Clear live canvas of this remote user's in-progress stroke
      const drawCtx = drawCanvasRef.current?.getContext('2d')
      if (drawCtx) {
        drawCtx.clearRect(0, 0, drawCtx.canvas.width, drawCtx.canvas.height)
        Object.values(remotePaths.current).forEach(p =>
          drawStroke(drawCtx, { ...p, page: pageRef.current })
        )
      }
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
  // Redraws all committed strokes onto the STATIC canvas (not called every frame)
  const redrawStrokes = useCallback(() => {
    const canvas = staticCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokes.current
      .filter(s => s.page === pageRef.current)
      .forEach(s => drawStroke(ctx, s))
    // Also clear the live canvas
    const live = drawCanvasRef.current
    if (live) live.getContext('2d').clearRect(0, 0, live.width, live.height)
  }, [])

  // ── GoodNotes-style smooth pen ──────────────────────
  const drawSmoothPen = (ctx, points, baseWidth, color, opacity) => {
    if (!points.length) return
    ctx.save()
    ctx.globalAlpha = opacity ?? 1
    ctx.fillStyle   = color
    ctx.globalCompositeOperation = 'source-over'

    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(points[0].x, points[0].y, baseWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }

    const n = points.length

    // Per-point width: simulate pressure via inverse speed
    const widths = new Array(n)
    widths[0]     = baseWidth * 0.3          // tapered start
    widths[n - 1] = baseWidth * 0.1          // tapered end
    for (let i = 1; i < n - 1; i++) {
      const dx    = points[i + 1].x - points[i - 1].x
      const dy    = points[i + 1].y - points[i - 1].y
      const speed = Math.sqrt(dx * dx + dy * dy)
      const t     = Math.min(1, speed / (baseWidth * 9 + 1))
      widths[i]   = baseWidth * Math.max(0.15, 1 - t * 0.65)
    }

    // Build left/right outline using segment normals
    const left  = []
    const right = []
    for (let i = 0; i < n - 1; i++) {
      const p1 = points[i], p2 = points[i + 1]
      const dx = p2.x - p1.x, dy = p2.y - p1.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / len, ny = dx / len
      const w1h = widths[i] / 2, w2h = widths[i + 1] / 2
      if (i === 0) {
        left.push({ x: p1.x + nx * w1h, y: p1.y + ny * w1h })
        right.push({ x: p1.x - nx * w1h, y: p1.y - ny * w1h })
      }
      left.push({ x: p2.x + nx * w2h, y: p2.y + ny * w2h })
      right.push({ x: p2.x - nx * w2h, y: p2.y - ny * w2h })
    }

    // Smooth the outline with quadratic Bezier midpoints
    const all = [...left, ...[...right].reverse()]
    ctx.beginPath()
    ctx.moveTo(all[0].x, all[0].y)
    for (let i = 1; i < all.length - 1; i++) {
      const mx = (all[i].x + all[i + 1].x) / 2
      const my = (all[i].y + all[i + 1].y) / 2
      ctx.quadraticCurveTo(all[i].x, all[i].y, mx, my)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  const drawStroke = (ctx, stroke) => {
    if (!stroke?.points?.length) return
    ctx.save()
    ctx.globalAlpha = stroke.opacity ?? 1

    // ── Text ──
    if (stroke.tool === 'text') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = stroke.color
      ctx.font = `${Math.max(12, stroke.width * 4)}px Inter, -apple-system, sans-serif`
      ctx.fillText(stroke.text || '', stroke.points[0].x, stroke.points[0].y)
      ctx.restore(); return
    }

    // ── Eraser ──
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath()
      stroke.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y))
      ctx.stroke()
      ctx.restore(); return
    }

    // ── Highlighter ──
    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width * 6
      ctx.lineCap = 'square'; ctx.lineJoin = 'round'
      ctx.beginPath()
      stroke.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y))
      ctx.stroke()
      ctx.restore(); return
    }

    // ── Rectangle ──
    if (stroke.tool === 'rectangle') {
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
    }

    // ── Arrow ──
    if (stroke.tool === 'arrow') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
      ctx.fillStyle   = stroke.color
      if (stroke.points.length >= 2) {
        const s = stroke.points[0]
        const e = stroke.points[stroke.points.length - 1]
        const angle = Math.atan2(e.y - s.y, e.x - s.x)
        const head  = 14 + stroke.width * 2
        ctx.lineWidth = stroke.width
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(e.x, e.y)
        ctx.lineTo(e.x - head * Math.cos(angle - 0.4), e.y - head * Math.sin(angle - 0.4))
        ctx.lineTo(e.x - head * Math.cos(angle + 0.4), e.y - head * Math.sin(angle + 0.4))
        ctx.closePath(); ctx.fill()
      }
      ctx.restore(); return
    }

    // ── Pen (GoodNotes style) ──
    ctx.restore()
    drawSmoothPen(ctx, stroke.points, stroke.width, stroke.color, stroke.opacity ?? 1)
  }

  // ── Pointer events ────────────────────────────────────
  // ── Native Pointer Events (low-latency, Apple Pencil aware) ──────────
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return

    const getCanvasPos = (e) => {
      const rect  = canvas.getBoundingClientRect()
      const scaleX = canvas.width  / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top)  * scaleY,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      }
    }

    const onDown = (e) => {
      if (toolRef.current === 'text') {
        const pos = getCanvasPos(e)
        setTextPos({ x: pos.x, y: pos.y })
        setTextVal('')
        setTimeout(() => textInputRef.current?.focus(), 0)
        return
      }
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      isDrawing.current = true
      const pos = getCanvasPos(e)
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

    const onMove = (e) => {
      if (!isDrawing.current) return
      e.preventDefault()
      const pos = getCanvasPos(e)
      currentPath.current.push(pos)

      // Batch renders with rAF — only one repaint per display refresh
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const liveCanvas = drawCanvasRef.current
        if (!liveCanvas) return
        const ctx = liveCanvas.getContext('2d')
        ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height)

        const pts = currentPath.current
        const w   = toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current
        const op  = toolRef.current === 'highlighter' ? 0.35 : opacityRef.current

        if (toolRef.current === 'pen') {
          // Fast live preview: smooth bezier, no variable width (committed stroke gets full GoodNotes render)
          if (pts.length >= 2) {
            ctx.save()
            ctx.globalAlpha = op
            ctx.strokeStyle = colorRef.current
            ctx.lineWidth   = w
            ctx.lineCap     = 'round'
            ctx.lineJoin    = 'round'
            ctx.beginPath()
            ctx.moveTo(pts[0].x, pts[0].y)
            for (let i = 1; i < pts.length - 1; i++) {
              ctx.quadraticCurveTo(
                pts[i].x, pts[i].y,
                (pts[i].x + pts[i+1].x) / 2,
                (pts[i].y + pts[i+1].y) / 2
              )
            }
            ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y)
            ctx.stroke()
            ctx.restore()
          }
        } else {
          drawStroke(ctx, {
            points: pts, tool: toolRef.current,
            color: colorRef.current, width: w, opacity: op, page: pageRef.current,
          })
        }
      })

      socket?.emit('draw-move', { x: pos.x, y: pos.y, page: pageRef.current })
    }

    const onUp = () => {
      if (!isDrawing.current) return
      isDrawing.current = false
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }

      // Clear live canvas
      const liveCtx = drawCanvasRef.current?.getContext('2d')
      if (liveCtx) liveCtx.clearRect(0, 0, liveCtx.canvas.width, liveCtx.canvas.height)

      const pts = currentPath.current
      if (!pts.length) return

      const stroke = {
        points:  pts,
        tool:    toolRef.current,
        color:   colorRef.current,
        width:   toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current,
        opacity: toolRef.current === 'highlighter' ? 0.35 : opacityRef.current,
        page:    pageRef.current,
      }

      strokes.current.push(stroke)
      undoStack.current.push(stroke)

      // Commit to static canvas with full GoodNotes render
      const staticCtx = staticCanvasRef.current?.getContext('2d')
      if (staticCtx) drawStroke(staticCtx, stroke)

      socket?.emit('draw-end', { stroke, page: pageRef.current })
      currentPath.current = []
    }

    canvas.addEventListener('pointerdown',   onDown, { passive: false })
    canvas.addEventListener('pointermove',   onMove, { passive: false })
    canvas.addEventListener('pointerup',     onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave',  onUp)

    return () => {
      canvas.removeEventListener('pointerdown',   onDown)
      canvas.removeEventListener('pointermove',   onMove)
      canvas.removeEventListener('pointerup',     onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave',  onUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

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

  // Commit text to canvas + sync
  const commitText = () => {
    if (!textPos || !textVal.trim()) { setTextPos(null); return }
    const ctx = drawCanvasRef.current?.getContext('2d')
    if (!ctx) { setTextPos(null); return }
    const stroke = {
      tool: 'text',
      points: [textPos],
      text: textVal.trim(),
      color: colorRef.current,
      width: widthRef.current,
      opacity: opacityRef.current,
      page: pageRef.current,
    }
    strokes.current.push(stroke)
    undoStack.current.push(stroke)
    drawStroke(ctx, stroke)
    socket?.emit('draw-end', { stroke, page: pageRef.current })
    setTextPos(null)
    setTextVal('')
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

        {/* Header */}
        <div className="sb-row" style={{ justifyContent: 'space-between', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.svg" alt="Amdaro" style={{ width: 16, height: 16, opacity: 0.9 }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.3px', color: 'rgba(255,255,255,0.9)' }}>amdaro</span>
          </div>
          <button className="sb-icon-btn" onClick={() => setSidebarOpen(false)} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* PDF name */}
        {pdfName && (
          <div className="sb-row" style={{ gap: 6 }}>
            <span style={{ fontSize: 10, opacity: 0.4 }}>📄</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pdfName}>
              {pdfName}
            </span>
          </div>
        )}

        {/* Colour picker */}
        <div className="sb-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sb-label">Colour</span>
            <ColorPicker color={color} onChange={setColor} />
          </div>
        </div>

        {/* Stroke size */}
        <div className="sb-row" style={{ gap: 10 }}>
          <span className="sb-label" style={{ minWidth: 30 }}>{strokeWidth}px</span>
          <input
            type="range" min="1" max="30" value={strokeWidth}
            className="sb-slider"
            onChange={e => setStrokeWidth(+e.target.value)}
            style={{ flex: 1, accentColor: color }}
          />
        </div>

        {/* Opacity */}
        {tool !== 'highlighter' && tool !== 'eraser' && (
          <div className="sb-row" style={{ gap: 10 }}>
            <span className="sb-label" style={{ minWidth: 30 }}>{Math.round(opacity * 100)}%</span>
            <input
              type="range" min="10" max="100"
              value={Math.round(opacity * 100)}
              className="sb-slider"
              onChange={e => setOpacity(e.target.value / 100)}
              style={{ flex: 1, accentColor: color }}
            />
          </div>
        )}

        {/* Session code */}
        <div className="sb-row" style={{ justifyContent: 'space-between' }}>
          <span className="sb-code">{inviteCode || '— — — — — —'}</span>
          <button
            className="sb-icon-btn"
            onClick={copyInviteCode}
            title="Copy session code"
            style={{ color: copied ? '#22c55e' : undefined }}
          >
            {copied
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="1" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5v8h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            }
          </button>
        </div>

        {/* Online users */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 6px' }}>
          <div className="sb-label" style={{ marginBottom: 10 }}>Online · {users.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="sb-user-dot" style={{ background: u.color, color: u.color }} />
                <span style={{
                  fontSize: 12, color: 'rgba(255,255,255,0.6)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: u.id === myId ? 500 : 400,
                }}>
                  {u.name}{u.id === myId ? <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}> you</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Propose PDF */}
        {onProposePdf && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button className="sb-propose-btn" onClick={() => proposeInputRef.current?.click()}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v8M2.5 5l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Propose PDF
            </button>
            <input ref={proposeInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => { onProposePdf(e.target.files[0]); e.target.value = '' }}
            />
          </div>
        )}

        {/* Sign out */}
        {user && (
          <div className="sb-row" style={{ justifyContent: 'space-between', padding: '10px 14px' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={user.email}>
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = '#ef4444'}
              onMouseLeave={e => e.target.style.color = 'rgba(239,68,68,0.7)'}
            >
              Sign out
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
            {/* Static canvas — holds all committed strokes, never cleared during live drawing */}
            <canvas ref={staticCanvasRef} id="static-canvas" style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, pointerEvents: 'none' }} />
            {/* Live canvas — only the in-progress stroke, cleared each rAF */}
            <canvas ref={drawCanvasRef} id="draw-canvas" />

            {/* Text tool input overlay */}
            {textPos && (() => {
              const canvas = drawCanvasRef.current
              const rect   = canvas?.getBoundingClientRect()
              const scaleX = rect ? canvas.width  / rect.width  : 1
              const scaleY = rect ? canvas.height / rect.height : 1
              const left   = rect ? rect.left + textPos.x / scaleX : textPos.x
              const top    = rect ? rect.top  + textPos.y / scaleY : textPos.y
              const fontSize = Math.max(12, strokeWidth * 4)
              return (
                <textarea
                  ref={textInputRef}
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setTextPos(null); setTextVal('') }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
                  }}
                  onBlur={commitText}
                  style={{
                    position: 'fixed',
                    left, top,
                    minWidth: 120,
                    maxWidth: 400,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${color}44`,
                    borderRadius: 6,
                    color,
                    fontSize,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    padding: '4px 8px',
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    lineHeight: 1.4,
                    zIndex: 1000,
                    boxShadow: `0 0 0 2px ${color}33`,
                    rows: 1,
                  }}
                  rows={1}
                  placeholder="Type text…"
                />
              )
            })()}
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
