import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

// The BranchIcon is replaced by our brand logo.svg

export default function LandingPage({ onRoomReady, showToast, user, onSignOut }) {
  const [mode, setMode] = useState('home')   // 'home' | 'join' | 'uploading'
  const [dragging, setDragging]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [inviteCode, setInviteCode]   = useState('')
  const [joining, setJoining]         = useState(false)
  const fileInputRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { showToast('Please upload a PDF file.', 'error'); return }
    if (file.size > 50 * 1024 * 1024)   { showToast('File too large. Max 50MB.',  'error'); return }

    setMode('uploading')
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('pdf', file)

    try {
      const tick = setInterval(() => setUploadProgress(p => Math.min(p + 6, 88)), 120)
      const res  = await fetch('/api/upload', { method: 'POST', body: formData })
      clearInterval(tick)
      setUploadProgress(100)
      if (!res.ok) throw new Error()
      const data = await res.json()
      window.history.replaceState({}, '', `?room=${data.roomId}`)
      setTimeout(() => onRoomReady({ ...data, pdfName: file.name }), 350)
    } catch {
      showToast('Upload failed. Is the server running?', 'error')
      setMode('home')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    setJoining(true)
    try {
      const res  = await fetch(`/api/room/${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Not found')
      window.history.replaceState({}, '', `?room=${data.roomId}`)
      onRoomReady(data)
    } catch (err) {
      showToast(err.message || 'Invalid invite code.', 'error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Top-left icon */}
      <div style={{
        position: 'fixed', top: 20, left: 24,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
      }}>
        <img src="/logo.svg" alt="Amdaro Logo" style={{ width: 24, height: 24 }} />
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, letterSpacing: '-0.3px' }}>amdaro</span>
      </div>

      {/* Top-right User Profile / Sign Out */}
      {user && (
        <div style={{
          position: 'fixed', top: 20, right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 100,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 500 }}>
            {user.email}
          </span>
          <button
            onClick={onSignOut}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            Sign Out
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <AnimatePresence mode="wait">

        {/* HOME */}
        {mode === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}
          >
            {/* Icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <img src="/logo.svg" alt="Amdaro Logo" style={{ width: 80, height: 80 }} />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{
                color: '#fff',
                fontSize: 'clamp(24px, 4vw, 34px)',
                fontWeight: 700,
                textAlign: 'center',
                lineHeight: 1.25,
                letterSpacing: '-0.5px',
                margin: 0,
                maxWidth: 380,
              }}
            >
              Collaborate on PDFs,<br />in real-time.
            </motion.h1>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              style={{ display: 'flex', gap: 10 }}
            >
              {/* Join Session (outlined) */}
              <motion.button
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode('join')}
                style={{
                  padding: '10px 26px',
                  borderRadius: 99,
                  border: '1px solid rgba(255,255,255,0.22)',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                Join Session
              </motion.button>

              {/* Upload PDF (solid white) */}
              <motion.button
                whileHover={{ backgroundColor: '#e8e8e8' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                  padding: '10px 26px',
                  borderRadius: 99,
                  border: 'none',
                  background: dragging ? '#e0e0e0' : '#fff',
                  color: '#000',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
                }}
              >
                {dragging ? 'Drop PDF →' : 'Upload PDF'}
              </motion.button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
            </motion.div>

            {/* Sub-link */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.4 }}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: 0 }}
            >
              Drop a PDF anywhere on this page to start instantly
            </motion.p>
          </motion.div>
        )}

        {/* JOIN */}
        {mode === 'join' && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 20, width: 360,
            }}
          >
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.4px' }}>
              Enter invite code
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Ask the session host for their 9-character code
            </p>

            <form onSubmit={handleJoin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="ABC-DEF-GHI"
                autoFocus
                maxLength={11}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: 99,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', 'Inter', monospace",
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  outline: 'none',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setMode('home')}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 99,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: 'rgba(255,255,255,0.6)',
                    fontSize: 14, fontWeight: 500, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >← Back</motion.button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={!inviteCode.trim() || joining}
                  style={{
                    flex: 2, padding: '11px', borderRadius: 99,
                    border: 'none',
                    background: inviteCode.trim() ? '#fff' : 'rgba(255,255,255,0.15)',
                    color: inviteCode.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                    fontSize: 14, fontWeight: 600, cursor: inviteCode.trim() ? 'pointer' : 'default',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.2s',
                  }}
                >
                  {joining ? '…' : 'Join →'}
                </motion.button>
              </div>
            </form>

            {/* Also offer upload */}
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, margin: 0 }}>
              or{' '}
              <span
                onClick={() => fileInputRef.current?.click()}
                style={{ color: 'rgba(255,255,255,0.5)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                upload a new PDF
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
            </p>
          </motion.div>
        )}

        {/* UPLOADING */}
        {mode === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: 320 }}
          >
            {/* Animated icon */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
              style={{ fontSize: 36, color: '#fff' }}
            >
              ✳
            </motion.div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>
                Uploading PDF…
              </p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
                Setting up your collaboration room
              </p>
            </div>

            {/* Progress bar */}
            <div style={{
              width: '100%', height: 2,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 99, overflow: 'hidden',
            }}>
              <motion.div
                style={{
                  height: '100%',
                  background: '#fff',
                  borderRadius: 99,
                }}
                animate={{ width: `${uploadProgress}%` }}
                transition={{ ease: 'easeOut', duration: 0.3 }}
              />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: 0 }}>
              {uploadProgress}%
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      <div style={{
        position: 'fixed', bottom: 20, right: 24,
        display: 'flex', gap: 20,
        color: 'rgba(255,255,255,0.3)', fontSize: 12,
      }}>
        {['FAQ', 'About', 'Pricing', 'Dashboard'].map(link => (
          <span key={link} style={{ cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}
          >{link}</span>
        ))}
      </div>

    </div>
  )
}
