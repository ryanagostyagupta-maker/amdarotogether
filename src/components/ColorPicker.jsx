import { useState, useRef, useEffect, useCallback } from 'react'

// ─── HSV ↔ HEX ───────────────────────────────────────────────
function hsvToHex(h, s, v) {
  s /= 100; v /= 100
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  let [r, g, b] =
    h < 60  ? [c,x,0] : h < 120 ? [x,c,0] :
    h < 180 ? [0,c,x] : h < 240 ? [0,x,c] :
    h < 300 ? [x,0,c] : [c,0,x]
  const hex = n => Math.round((n+m)*255).toString(16).padStart(2,'0')
  return '#' + hex(r) + hex(g) + hex(b)
}
function hexToHsv(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [270, 58, 100]
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
  let h=0; const s=max===0?0:d/max, v=max
  if(d){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h=Math.round(h*60); if(h<0)h+=360 }
  return [h, Math.round(s*100), Math.round(v*100)]
}

const PRESETS = ['#ff6b6b','#ff9f43','#feca57','#2ed573','#48dbfb','#7c6aff','#f368e0','#ffffff']

export default function ColorPicker({ color, onChange }) {
  const [open, setOpen]         = useState(false)
  const [hue, setHue]           = useState(() => hexToHsv(color)[0])
  const [sat, setSat]           = useState(() => hexToHsv(color)[1])
  const [val, setVal]           = useState(() => hexToHsv(color)[2])
  const [hexInput, setHexInput] = useState(color)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })

  const triggerRef = useRef()
  const panelRef   = useRef()
  const svRef      = useRef()
  const dragging   = useRef(false)

  // Sync from parent
  useEffect(() => {
    const [h,s,v] = hexToHsv(color)
    setHue(h); setSat(s); setVal(v); setHexInput(color)
  }, [color])

  // Draw SV gradient
  useEffect(() => {
    const canvas = svRef.current
    if (!canvas || !open) return
    const ctx = canvas.getContext('2d')
    const { width: w, height: h } = canvas
    const gx = ctx.createLinearGradient(0,0,w,0)
    gx.addColorStop(0,'#fff'); gx.addColorStop(1,`hsl(${hue},100%,50%)`)
    ctx.fillStyle = gx; ctx.fillRect(0,0,w,h)
    const gy = ctx.createLinearGradient(0,0,0,h)
    gy.addColorStop(0,'transparent'); gy.addColorStop(1,'#000')
    ctx.fillStyle = gy; ctx.fillRect(0,0,w,h)
  }, [hue, open])

  // Position panel using fixed coords from trigger
  const openPicker = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Place below trigger, aligned to right edge
    setPanelPos({
      top:  rect.bottom + 8,
      left: Math.max(8, rect.right - 224),
    })
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const emit = useCallback((h,s,v) => {
    const hex = hsvToHex(h,s,v); setHexInput(hex); onChange(hex)
  }, [onChange])

  const getSV = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const cx = e.touches?.[0]?.clientX ?? e.clientX
    const cy = e.touches?.[0]?.clientY ?? e.clientY
    return [
      Math.round(Math.max(0, Math.min(100, ((cx-rect.left)/rect.width)*100))),
      Math.round(Math.max(0, Math.min(100, 100-((cy-rect.top)/rect.height)*100))),
    ]
  }
  const onSVDown = e => { e.preventDefault(); dragging.current=true; const [s,v]=getSV(e,svRef.current); setSat(s);setVal(v);emit(hue,s,v) }
  const onSVMove = e => { if(!dragging.current)return; const [s,v]=getSV(e,svRef.current); setSat(s);setVal(v);emit(hue,s,v) }
  const onSVUp   = () => { dragging.current=false }

  const curHex = hsvToHex(hue, sat, val)

  return (
    <>
      {/* Swatch trigger */}
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openPicker()}
        style={{
          width: 26, height: 26, borderRadius: 7, padding: 0,
          background: color, border: 'none', cursor: 'pointer', flexShrink: 0,
          boxShadow: open
            ? `0 0 0 2px rgba(255,255,255,0.5), 0 0 0 4px ${color}40`
            : `0 0 0 1.5px rgba(255,255,255,0.15), 0 2px 8px ${color}60`,
          transition: 'box-shadow 0.2s',
        }}
      />

      {/* Panel — fixed so it escapes overflow:hidden */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            zIndex: 9999,
            width: 224,
            background: 'rgba(22,22,26,0.98)',
            backdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 14,
            boxShadow: '0 24px 60px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
            display: 'flex', flexDirection: 'column', gap: 12,
            animation: 'picker-in 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* SV picker */}
          <div
            style={{ position:'relative', borderRadius:10, overflow:'hidden', cursor:'crosshair', userSelect:'none' }}
            onMouseDown={onSVDown} onMouseMove={onSVMove} onMouseUp={onSVUp} onMouseLeave={onSVUp}
          >
            <canvas ref={svRef} width={196} height={124}
              style={{ display:'block', width:'100%', borderRadius:10 }}
            />
            <div style={{
              position:'absolute',
              left:`${sat}%`, top:`${100-val}%`,
              transform:'translate(-50%,-50%)',
              width:14, height:14, borderRadius:'50%',
              border:'2.5px solid #fff',
              boxShadow:'0 0 0 1.5px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)',
              background: curHex, pointerEvents:'none',
            }}/>
          </div>

          {/* Hue slider */}
          <div style={{ position:'relative', height:10, borderRadius:99, overflow:'hidden',
            background:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
            boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}>
            <input type="range" min="0" max="360" value={hue}
              onChange={e => { const h=+e.target.value; setHue(h); emit(h,sat,val) }}
              style={{ position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer',margin:0 }}
            />
            <div style={{
              position:'absolute', top:'50%', left:`${(hue/360)*100}%`,
              transform:'translate(-50%,-50%)',
              width:16, height:16, borderRadius:'50%',
              background:`hsl(${hue},100%,50%)`,
              border:'2.5px solid #fff',
              boxShadow:'0 0 0 1px rgba(0,0,0,0.4)',
              pointerEvents:'none',
            }}/>
          </div>

          {/* Preset chips */}
          <div style={{ display:'flex', gap:5 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => { const [h,s,v]=hexToHsv(p); setHue(h);setSat(s);setVal(v);setHexInput(p);onChange(p) }}
                style={{
                  flex:1, height:18, borderRadius:5, padding:0, border:'none',
                  background:p, cursor:'pointer',
                  outline: curHex.toLowerCase()===p.toLowerCase() ? '2px solid rgba(255,255,255,0.8)' : '1.5px solid rgba(255,255,255,0.1)',
                  outlineOffset: curHex.toLowerCase()===p.toLowerCase() ? 1 : 0,
                  transition:'outline 0.12s',
                }}
              />
            ))}
          </div>

          {/* Hex input */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:6, background:curHex, border:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }}/>
            <input
              value={hexInput}
              onChange={e => {
                const v=e.target.value; setHexInput(v)
                if(/^#[0-9a-f]{6}$/i.test(v)){ const [h,s,val2]=hexToHsv(v); setHue(h);setSat(s);setVal(val2);onChange(v) }
              }}
              style={{
                flex:1, background:'rgba(255,255,255,0.05)',
                border:'1px solid rgba(255,255,255,0.08)', borderRadius:8,
                padding:'5px 10px', color:'rgba(255,255,255,0.8)',
                fontSize:12, fontFamily:'monospace', outline:'none', letterSpacing:'0.5px',
              }}
              placeholder="#7c6aff"
            />
          </div>
        </div>
      )}

      <style>{`@keyframes picker-in { from { opacity:0; transform:scale(0.95) translateY(-4px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>
    </>
  )
}
