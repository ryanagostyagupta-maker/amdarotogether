import { useEffect, useRef, useCallback, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { DrawingToolbar } from './Toolbar'
import ColorPicker from './ColorPicker'
import gsap from 'gsap'

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
  const pdfCanvasRef       = useRef()
  const staticCanvasRef    = useRef()   // committed strokes layer
  const drawCanvasRef      = useRef()   // live / in-progress stroke layer
  const containerRef       = useRef()
  const canvasContainerRef = useRef()   // for CSS transform during pinch

  const [tool, setTool]               = useState('pen')
  const [color, setColor]             = useState('#7c6aff')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [opacity, setOpacity]         = useState(1)
  const [zoom, setZoom]               = useState(1)
  const [loading, setLoading]         = useState(false)
  const [users, setUsers]             = useState([])
  const [myId, setMyId]               = useState(myIdProp || null)
  const [inviteCode, setInviteCode]   = useState('')
  const [copied, setCopied]           = useState(false)
  const [pdfName, setPdfName]         = useState(pdfNameProp || '')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [theme, setTheme]             = useState(() => localStorage.getItem('amdaro-theme') || 'dark')
  const proposeInputRef               = useRef()

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('amdaro-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

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
  const zoomRef     = useRef(zoom)

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { widthRef.current = strokeWidth }, [strokeWidth])
  useEffect(() => { opacityRef.current = opacity }, [opacity])
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

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

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch {}
    }

    // Optimistic: don't show spinner — keep old page visible until render completes
    try {
      const pdfPage = await pdfDocRef.current.getPage(pageNum)
      const viewport = pdfPage.getViewport({ scale: zoomRef.current * 1.5 })

      const pdfCanvas  = pdfCanvasRef.current
      const drawCanvas = drawCanvasRef.current
      if (!pdfCanvas || !drawCanvas) return

      // Reset any CSS pinch-zoom transform
      if (canvasContainerRef.current) canvasContainerRef.current.style.transform = ''

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
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF render error:', err)
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
      ctx.font = `${Math.max(12, stroke.width * 4)}px "Plus Jakarta Sans", -apple-system, sans-serif`
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

    // ── Circle ──
    if (stroke.tool === 'circle') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
      ctx.fillStyle   = stroke.color + '18'
      if (stroke.points.length >= 2) {
        const s = stroke.points[0]
        const e = stroke.points[stroke.points.length - 1]
        const cx = (s.x + e.x) / 2, cy = (s.y + e.y) / 2
        const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2
        ctx.lineWidth = stroke.width
        ctx.beginPath(); ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      }
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

  const isSpaceHeld     = useRef(false)
  const [spacePan, setSpacePan] = useState(false)
  const isPanning       = useRef(false)
  const lastPanPos      = useRef({ x: 0, y: 0 })

  const rafRef          = useRef(null)
  const activePointers  = useRef(new Map())
  const pinchStartDist  = useRef(null)
  const pinchStartZoom  = useRef(1)
  const pendingZoom     = useRef(null)

  // Wheel / trackpad pinch zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(z => Math.max(0.4, Math.min(4, z * factor)))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    let isSharpening = false
    let holdTimer = null

    const getCanvasPos = (e) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      }
    }
    const getPinchDist = () => {
      if (activePointers.current.size < 2) return null
      const pts = Array.from(activePointers.current.values())
      return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    }

    const onDown = (e) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // Two fingers → start pinch
      if (activePointers.current.size === 2) {
        if (isDrawing.current) {
          isDrawing.current = false
          currentPath.current = []
          const liveCtx = drawCanvasRef.current?.getContext('2d')
          if (liveCtx) liveCtx.clearRect(0, 0, liveCtx.canvas.width, liveCtx.canvas.height)
        }
        pinchStartDist.current = getPinchDist()
        pinchStartZoom.current = zoomRef.current
        return
      }

      // ── Pan tool or Spacebar ──
      // Handled natively via pointer-events: none on the canvas container
      if (toolRef.current === 'pan' || isSpaceHeld.current) {
        return
      }

      // ── Text tool ──
      if (toolRef.current === 'text') {
        const pos = getCanvasPos(e)
        setTextPos({ x: pos.x, y: pos.y })
        setTextVal('')
        setTimeout(() => textInputRef.current?.focus(), 0)
        return
      }

      // ── Stroke eraser (handled in onMove for swipe deletion) ──
      if (toolRef.current === 'stroke-eraser') {
        e.preventDefault()
        canvas.setPointerCapture(e.pointerId)
        isDrawing.current = true
        return
      }

      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      isDrawing.current = true
      holdTimer = setTimeout(() => {
        // Shape sharpening activates after 600ms hold
        if (['rectangle', 'circle', 'arrow', 'pen'].includes(toolRef.current)) {
          let wasSharpened = false

          // Pen-to-shape recognition
          if (toolRef.current === 'pen') {
            const pts = currentPath.current
            if (pts.length > 10) {
              const s = pts[0], e = pts[pts.length - 1]
              const dist = Math.hypot(e.x - s.x, e.y - s.y)
              let pathLen = 0
              for(let i=1; i<pts.length; i++) pathLen += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y)
              
              if (dist < 40) {
                 // Closed shape (Circle or Rectangle)
                 let minX = s.x, maxX = s.x, minY = s.y, maxY = s.y
                 pts.forEach(p => { 
                   minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
                   minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) 
                 })
                 const w = maxX - minX, h = maxY - minY
                 if (Math.abs(w - h) < Math.max(w, h) * 0.35) {
                   toolRef.current = 'circle'
                 } else {
                   toolRef.current = 'rectangle'
                 }
                 currentPath.current = [{x: minX, y: minY}, {x: maxX, y: maxY}]
                 wasSharpened = true
              } else if (dist > pathLen * 0.85) {
                 // Straight Line
                 currentPath.current = [s, e]
                 wasSharpened = true
              }
            }
          }

          if (wasSharpened || ['rectangle', 'circle', 'arrow'].includes(toolRef.current)) {
            isSharpening = true
            // Visual pulse feedback
            const cc = canvasContainerRef.current
            if (cc) {
              cc.style.outline = '2px solid rgba(124,106,255,0.7)'
              cc.style.outlineOffset = '2px'
              setTimeout(() => { if (cc) { cc.style.outline = ''; cc.style.outlineOffset = '' } }, 400)
            }
            // Force redraw of live canvas
            const liveCanvas = drawCanvasRef.current
            if (liveCanvas) {
              const ctx = liveCanvas.getContext('2d')
              ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height)
              drawStroke(ctx, { points: currentPath.current, tool: toolRef.current, color: colorRef.current, width: widthRef.current, opacity: opacityRef.current, page: pageRef.current })
            }
          }
        }
      }, 600)
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
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      // Pinch zoom in progress
      if (activePointers.current.size >= 2 && pinchStartDist.current) {
        const dist = getPinchDist()
        if (!dist) return
        const scale   = dist / pinchStartDist.current
        const newZoom = Math.max(0.4, Math.min(4, pinchStartZoom.current * scale))
        if (canvasContainerRef.current) {
          const ratio = newZoom / zoomRef.current
          canvasContainerRef.current.style.transform = `scale(${ratio})`
          canvasContainerRef.current.style.transformOrigin = 'center center'
        }
        pendingZoom.current = newZoom
        return
      }

      // ── Pan Tool ──
      // Handled natively via pointer-events: none on the canvas container
      if (toolRef.current === 'pan' || isSpaceHeld.current) {
        return
      }

      if (!isDrawing.current) return
      e.preventDefault()

      // ── Stroke Eraser Swipe ──
      if (toolRef.current === 'stroke-eraser') {
        const pos = getCanvasPos(e)
        const scale = drawCanvasRef.current ? drawCanvasRef.current.width / drawCanvasRef.current.getBoundingClientRect().width : 1
        const TOLERANCE = 18 * scale
        let hitIdx = -1
        for (let i = strokes.current.length - 1; i >= 0; i--) {
          const s = strokes.current[i]
          if (s.page !== pageRef.current) continue
          const hit = s.points.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) < TOLERANCE)
          if (hit) { hitIdx = i; break }
        }
        if (hitIdx >= 0) {
          const removed = strokes.current.splice(hitIdx, 1)[0]
          redrawStrokes()
          socket?.emit('sync-strokes', { strokes: strokes.current })
          undoStack.current.push({ type: 'delete', stroke: removed, index: hitIdx })
        }
        return
      }

      // ✨ getCoalescedEvents — Apple Pencil reports at 120–240 Hz but
      // browsers only fire pointermove once per rAF. Coalesced events give us
      // ALL the intermediate points, making lines smooth instead of dotted.
      const events = (e.getCoalescedEvents ? e.getCoalescedEvents() : null)
      if (events && events.length > 0) {
        for (const ce of events) {
          currentPath.current.push(getCanvasPos(ce))
        }
      } else {
        currentPath.current.push(getCanvasPos(e))
      }

      // One render per display frame — but we’ve already collected every point above
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
          if (pts.length >= 2) {
            ctx.save()
            ctx.globalAlpha = op
            ctx.strokeStyle = colorRef.current
            ctx.lineWidth   = w
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'
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
            ctx.stroke(); ctx.restore()
          }
        } else {
          drawStroke(ctx, { points: pts, tool: toolRef.current, color: colorRef.current, width: w, opacity: op, page: pageRef.current })
        }
      })

      // Emit only the latest position (network efficiency)
      const last = currentPath.current[currentPath.current.length - 1]
      socket?.emit('draw-move', { x: last.x, y: last.y, page: pageRef.current })
    }

    const onUp = (e) => {
      activePointers.current.delete(e.pointerId)
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }

      // Pinch ended — apply zoom
      if (pendingZoom.current !== null && activePointers.current.size < 2) {
        const finalZoom = pendingZoom.current
        pendingZoom.current = null
        pinchStartDist.current = null
        if (canvasContainerRef.current) canvasContainerRef.current.style.transform = ''
        setZoom(finalZoom)
        return
      }

      if (!isDrawing.current) return
      isDrawing.current = false
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }

      const liveCtx = drawCanvasRef.current?.getContext('2d')
      if (liveCtx) liveCtx.clearRect(0, 0, liveCtx.canvas.width, liveCtx.canvas.height)

      let pts = currentPath.current
      if (!pts.length) { isSharpening = false; return }

      // ── Shape sharpening — snap to perfect form after hold ──
      if (isSharpening && pts.length >= 2) {
        const s = pts[0], last = pts[pts.length - 1]
        if (toolRef.current === 'circle') {
          // Snap to perfect circle
          const cx = (s.x + last.x) / 2, cy = (s.y + last.y) / 2
          const r  = Math.min(Math.abs(last.x - s.x), Math.abs(last.y - s.y)) / 2
          pts = [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }]
        } else if (toolRef.current === 'rectangle') {
          // Snap to square if nearly square (within 20%)
          const w = Math.abs(last.x - s.x), h = Math.abs(last.y - s.y)
          const side = Math.max(w, h)
          pts = [
            s,
            { x: s.x + (last.x > s.x ? side : -side), y: s.y + (last.y > s.y ? side : -side) }
          ]
        } else if (toolRef.current === 'arrow') {
          // Snap to nearest 15° increment
          const angle = Math.atan2(last.y - s.y, last.x - s.x)
          const snap  = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12)
          const dist  = Math.hypot(last.x - s.x, last.y - s.y)
          pts = [s, { x: s.x + dist * Math.cos(snap), y: s.y + dist * Math.sin(snap) }]
        }
        currentPath.current = pts
        isSharpening = false
      }

      const stroke = {
        id:      Math.random().toString(36).slice(2),
        points:  currentPath.current,
        tool:    toolRef.current,
        color:   colorRef.current,
        width:   toolRef.current === 'eraser' ? widthRef.current * 4 : widthRef.current,
        opacity: toolRef.current === 'highlighter' ? 0.35 : opacityRef.current,
        page:    pageRef.current,
      }

      strokes.current.push(stroke)
      undoStack.current.push(stroke)
      const staticCtx = staticCanvasRef.current?.getContext('2d')
      if (staticCtx) drawStroke(staticCtx, stroke)
      socket?.emit('draw-end', { stroke, page: pageRef.current })
      currentPath.current = []
    }

    canvas.addEventListener('pointerdown',   onDown, { passive: false })
    canvas.addEventListener('pointermove',   onMove, { passive: false })
    canvas.addEventListener('pointerup',     onUp)
    canvas.addEventListener('pointercancel', onUp)
    // pointerleave: only commit for mouse/touch — NOT for pen.
    // Apple Pencil constantly triggers leave/enter at low pressure, which
    // fragments strokes into dots. setPointerCapture already keeps pen
    // events flowing even outside the canvas.
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'pen') return
      onUp(e)
    })

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

  // ── Keyboard Shortcuts (Undo, Pan) ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'z') {
          e.preventDefault()
          handleUndo()
        }
      }

      if (e.code === 'Space') {
        isSpaceHeld.current = e.type === 'keydown'
        if (e.type === 'keydown') e.preventDefault()
        setSpacePan(e.type === 'keydown')
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

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

  // Commit text → static canvas (bug fix: was using drawCanvasRef)
  const commitText = () => {
    if (!textPos || !textVal.trim()) { setTextPos(null); return }
    const ctx = staticCanvasRef.current?.getContext('2d')   // ← fixed
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
    if (isSpaceHeld.current || tool === 'pan') return 'grab'
    if (tool === 'eraser')    return 'cell'
    if (tool === 'text')      return 'text'
    if (tool === 'rectangle') return 'crosshair'
    return 'crosshair'
  }

  const sidebarRef = useRef()

  // ── GSAP Sidebar Animation ──
  useEffect(() => {
    if (!sidebarRef.current) return
    if (sidebarOpen) {
      gsap.to(sidebarRef.current, {
        x: 0,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'transform' // Let CSS handle base state
      })
    } else {
      gsap.to(sidebarRef.current, {
        x: -280,
        opacity: 0,
        scale: 0.96,
        duration: 0.35,
        ease: 'power3.in'
      })
    }
  }, [sidebarOpen])

  return (
    <div className="workspace">
      {/* ── Sidebar ── */}
      <aside
        className="sidebar"
        ref={sidebarRef}
        style={{
          transform: sidebarOpen ? 'translateX(0) scale(1)' : 'translateX(-280px) scale(0.96)',
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
        }}
      >

        {/* ── Header ── */}
        <div className="sb-row" style={{ justifyContent: 'space-between', minHeight: 52, padding: '0 12px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.svg" alt="" style={{ width: 18, height: 18, opacity: 0.85 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.2px' }}>
              amdaro
            </span>
          </div>
          <button className="sb-icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── PDF name ── */}
        {pdfName && (
          <div className="sb-row" style={{ minHeight: 36, gap: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.3 }}>PDF</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pdfName}>
              {pdfName}
            </span>
          </div>
        )}

        {/* ── Colour ── */}
        <div className="sb-row" style={{ justifyContent: 'space-between' }}>
          <span className="sb-label">Colour</span>
          <ColorPicker color={color} onChange={setColor} />
        </div>

        {/* ── Size ── */}
        <div className="sb-row" style={{ gap: 12 }}>
          <span className="sb-label" style={{ width: 32 }}>{strokeWidth}px</span>
          <input
            type="range" min="1" max="30"
            value={strokeWidth}
            className="sb-slider"
            onChange={e => setStrokeWidth(+e.target.value)}
          />
        </div>

        {/* ── Opacity ── */}
        {tool !== 'highlighter' && tool !== 'eraser' && (
          <div className="sb-row" style={{ gap: 12 }}>
            <span className="sb-label" style={{ width: 32 }}>{Math.round(opacity * 100)}%</span>
            <input
              type="range" min="10" max="100"
              value={Math.round(opacity * 100)}
              className="sb-slider"
              onChange={e => setOpacity(e.target.value / 100)}
            />
          </div>
        )}

        {/* ── Session code ── */}
        <div className="sb-row" style={{ justifyContent: 'space-between' }}>
          <span className="sb-code">{inviteCode || '– – – – – –'}</span>
          <button
            className="sb-icon-btn"
            onClick={copyInviteCode}
            title="Copy"
            style={{ color: copied ? '#34d399' : undefined, transition: 'color 0.2s' }}
          >
            {copied
              ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4.5" y="1" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 4.5v7.5h7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            }
          </button>
        </div>

        {/* ── Online users ── */}
        <div style={{ overflowY: 'auto', padding: '12px 16px 8px' }}>
          <div className="sb-label" style={{ marginBottom: 10 }}>
            In room · {users.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div className="sb-user-dot" style={{ background: u.color, color: u.color }} />
                <span style={{
                  fontSize: 13,
                  color: u.id === myId ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: u.id === myId ? 500 : 400,
                }}>
                  {u.name}
                  {u.id === myId && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginLeft: 4 }}>you</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Propose PDF ── */}
        {onProposePdf && (
          <div style={{ padding: '8px 12px' }}>
            <button className="sb-propose-btn" onClick={() => proposeInputRef.current?.click()}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M2 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Propose PDF
            </button>
            <input ref={proposeInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => { onProposePdf(e.target.files[0]); e.target.value = '' }}
            />
          </div>
        )}

        {/* ── Account ── */}
        {user && (
          <div className="sb-row" style={{ justifyContent: 'space-between', minHeight: 48, borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 148 }} title={user.email}>
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s', padding: '4px 0 4px 8px' }}
              onMouseEnter={e => e.target.style.color = '#f87171'}
              onMouseLeave={e => e.target.style.color = 'rgba(239,68,68,0.6)'}
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

        {/* PDF scroll — touch-action:pan-xy allows two-finger pan but we intercept pinch */}
        <div className="pdf-scroll" ref={containerRef} style={{ touchAction: 'pan-x pan-y' }}>
          {/* Subtle loading indicator — doesn't hide content */}
          {loading && (
            <div style={{
              position: 'absolute', top: 12, right: 12, zIndex: 50,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
              borderRadius: 8, padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: '#fff',
                animation: 'spin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Rendering…</span>
            </div>
          )}
          <div
            ref={canvasContainerRef}
            className="canvas-container"
            style={{ 
              cursor: getCursor(), 
              transition: 'transform 0.05s',
              pointerEvents: (tool === 'pan' || spacePan) ? 'none' : 'auto'
            }}
          >
            <canvas ref={pdfCanvasRef} id="pdf-canvas" style={{ pointerEvents: 'none' }} />
            <canvas ref={staticCanvasRef} id="static-canvas" style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, pointerEvents: 'none' }} />
            <canvas ref={drawCanvasRef} id="draw-canvas" />

            {/* Text tool overlay */}
            {textPos && (() => {
              const canvas = drawCanvasRef.current
              const rect   = canvas?.getBoundingClientRect()
              const scaleX = rect ? canvas.width  / rect.width  : 1
              const scaleY = rect ? canvas.height / rect.height : 1
              const left   = rect ? rect.left + textPos.x / scaleX : textPos.x
              const top    = rect ? rect.top  + textPos.y / scaleY : textPos.y
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
                  rows={1}
                  placeholder="Type…"
                  style={{
                    position: 'fixed', left, top,
                    minWidth: 100, maxWidth: 400,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(12px)',
                    border: `1.5px solid ${color}55`,
                    borderRadius: 8, color,
                    fontSize: Math.max(13, strokeWidth * 4),
                    fontFamily: '"Plus Jakarta Sans", -apple-system, sans-serif',
                    padding: '5px 10px', outline: 'none',
                    resize: 'none', overflow: 'hidden',
                    lineHeight: 1.45, zIndex: 1000,
                    boxShadow: `0 0 0 3px ${color}22, 0 8px 24px rgba(0,0,0,0.4)`,
                  }}
                />
              )
            })()}
          </div>
        </div>

        {/* Floating toolbar */}
        <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>
          <DrawingToolbar
            tool={tool} onToolSelect={setTool}
            onUndo={handleUndo} onClear={handleClearPage} onCopyLink={handleCopyLink}
          />
        </div>

        {/* Zoom badge — tap to reset */}
        <button
          onClick={() => setZoom(1)}
          title="Reset zoom"
          style={{
            position: 'absolute', bottom: 28, right: 16, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '5px 10px',
            color: zoom === 1 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            transition: 'color 0.15s',
            fontFamily: 'SF Mono, Fira Code, monospace',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </div>
  )
}
