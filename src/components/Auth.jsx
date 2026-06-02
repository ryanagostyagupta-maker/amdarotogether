import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth({ onAuthSuccess, showToast }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      showToast('Please fill in all fields.', 'error')
      return
    }

    setLoading(true)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        })
        if (error) throw error
        
        // Supabase sign up is successful
        if (data?.user) {
          if (data.session) {
            showToast('Account created & logged in!', 'success')
            onAuthSuccess(data.user)
          } else {
            showToast('Signup successful! Please check your email for confirmation.', 'success')
            setIsSignUp(false)
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        })
        if (error) throw error
        if (data?.user) {
          showToast('Welcome back!', 'success')
          onAuthSuccess(data.user)
        }
      }
    } catch (err) {
      console.error('Auth error:', err)
      showToast(err.message || 'Authentication failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ background: '#000', zIndex: 2000 }}>
      <div className="modal" style={{
        maxWidth: 380,
        background: 'rgba(10,10,12,0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.8)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <img src="/logo.svg" alt="Amdaro Logo" style={{ width: 64, height: 64 }} />
        </div>

        <h2 className="modal-title" style={{ textAlign: 'center', fontSize: 22 }}>
          {isSignUp ? 'Create an account' : 'Welcome back'}
        </h2>
        <p className="modal-desc" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
          {isSignUp ? 'Sign up to start collaborating' : 'Sign in to access your dashboard'}
        </p>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="modal-label">Email Address</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoFocus
              style={{ background: 'rgba(255,255,255,0.03)' }}
            />
          </div>

          <div>
            <label className="modal-label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{ background: 'rgba(255,255,255,0.03)' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              justifyContent: 'center',
              marginTop: 8,
              background: '#fff',
              color: '#000',
              fontWeight: 600
            }}
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <span
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </span>
        </div>
      </div>
    </div>
  )
}
