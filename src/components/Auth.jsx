import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import gsap from 'gsap'

export default function Auth({ onAuthSuccess, showToast }) {
  const [mode, setMode]           = useState('signin') // 'signin' | 'signup' | 'confirm'
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError]         = useState('')

  const clearError = () => setError('')

  const handleAuth = async (e) => {
    e.preventDefault()
    clearError()
    const em = email.trim()
    const pw = password.trim()
    if (!em || !pw) { setError('Please fill in all fields.'); return }
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email: em, password: pw })
        if (signUpErr) throw signUpErr

        if (data?.session) {
          // Email confirm disabled — logged in immediately
          showToast('Account created!', 'success')
          onAuthSuccess(data.user)
          return
        }

        // Email confirm enabled — try sign-in anyway (works if user already confirmed)
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: em, password: pw })
        if (!signInErr && signInData?.session) {
          showToast('Welcome!', 'success')
          onAuthSuccess(signInData.user)
          return
        }

        // Still needs confirmation
        setMode('confirm')

      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: em, password: pw })

        if (signInErr) {
          // Specific helpful messages
          if (signInErr.message?.toLowerCase().includes('email not confirmed')) {
            setMode('confirm')
            return
          }
          if (signInErr.message?.toLowerCase().includes('invalid login')) {
            throw new Error('Wrong email or password.')
          }
          throw signInErr
        }

        if (data?.user) {
          showToast('Welcome back!', 'success')
          onAuthSuccess(data.user)
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const resendConfirmation = async () => {
    setResending(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (error) throw error
      showToast('Confirmation email resent!', 'success')
    } catch (err) {
      setError(err.message || 'Failed to resend.')
    } finally {
      setResending(false)
    }
  }

  const confirmCardRef = useRef()

  useEffect(() => {
    if (mode === 'confirm' && confirmCardRef.current) {
      gsap.fromTo(confirmCardRef.current, 
        { y: 30, opacity: 0, scale: 0.96 }, 
        { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }
      )
    }
  }, [mode])

  // ── Confirmation waiting screen ─────────────────────────────
  if (mode === 'confirm') {
    return (
      <div style={overlayStyle}>
        <div ref={confirmCardRef} style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <h2 style={titleStyle}>Check your email</h2>
            <p style={descStyle}>
              We sent a confirmation link to<br />
              <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{email}</strong>
            </p>
          </div>

          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: 20 }}>
            After clicking the link, come back and sign in.
          </p>

          <button style={primaryBtnStyle} onClick={() => { setMode('signin'); clearError() }}>
            Back to Sign In
          </button>

          <button
            onClick={resendConfirmation}
            disabled={resending}
            style={{ ...ghostBtnStyle, marginTop: 10 }}
          >
            {resending ? 'Sending…' : 'Resend confirmation email'}
          </button>
        </div>
      </div>
    )
  }

  // ── Sign In / Sign Up form ──────────────────────────────────
  const authCardRef = useRef()

  useEffect(() => {
    if (mode !== 'confirm' && authCardRef.current) {
      gsap.fromTo(authCardRef.current, 
        { y: 30, opacity: 0, scale: 0.96 }, 
        { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }
      )
    }
  }, [mode])

  return (
    <div style={overlayStyle}>
      <div ref={authCardRef} style={cardStyle}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <img src="/logo.svg" alt="Amdaro" style={{ width: 52, height: 52 }} />
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.04)',
          borderRadius: 10, padding: 3, marginBottom: 24, gap: 3,
        }}>
          {['signin','signup'].map(m => (
            <button key={m}
              onClick={() => { setMode(m); clearError() }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearError() }}
              placeholder="name@example.com"
              required
              autoFocus
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); clearError() }}
              placeholder="••••••••"
              required
              minLength={6}
              style={inputStyle}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '10px 14px',
              color: '#f87171', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, marginTop: 4 }}>
            {loading ? 'Processing…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {mode === 'signin' && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            No account?{' '}
            <span onClick={() => { setMode('signup'); clearError() }}
              style={{ color: 'rgba(255,255,255,0.5)', cursor: 'pointer', textDecoration: 'underline' }}>
              Sign up
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

// ── Shared styles ───────────────────────────────────────────
const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: '#050507',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const cardStyle = {
  width: '100%', maxWidth: 360,
  background: 'rgba(12,12,16,0.9)',
  backdropFilter: 'blur(32px)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 20,
  padding: '28px 28px 24px',
  boxShadow: '0 40px 80px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
}

const titleStyle = {
  fontSize: 20, fontWeight: 700, color: '#fff',
  margin: '0 0 8px', letterSpacing: '-0.3px',
}

const descStyle = {
  fontSize: 13, color: 'rgba(255,255,255,0.4)',
  lineHeight: 1.6, margin: 0,
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'rgba(255,255,255,0.35)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, padding: '11px 14px',
  color: '#fff', fontSize: 14,
  outline: 'none', transition: 'border-color 0.15s',
  fontFamily: 'inherit',
}

const primaryBtnStyle = {
  width: '100%', padding: '12px 0',
  borderRadius: 10, border: 'none',
  background: '#fff', color: '#000',
  fontSize: 14, fontWeight: 600,
  cursor: 'pointer', transition: 'opacity 0.15s',
  fontFamily: 'inherit',
}

const ghostBtnStyle = {
  width: '100%', padding: '10px 0',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'transparent', color: 'rgba(255,255,255,0.4)',
  fontSize: 13, fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
  fontFamily: 'inherit',
}
