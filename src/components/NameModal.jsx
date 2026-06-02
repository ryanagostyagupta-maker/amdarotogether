import { useState } from 'react'

export default function NameModal({ pdfName, onSubmit, onBack }) {
  const [name, setName] = useState('')

  const handle = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <img src="/logo.svg" alt="Amdaro Logo" style={{ width: 64, height: 64, display: 'block', margin: '0 auto 16px' }} />
        <h2 className="modal-title" style={{ textAlign: 'center' }}>What's your name?</h2>
        <p className="modal-desc" style={{ textAlign: 'center' }}>
          {pdfName
            ? <>You're joining a session for <strong style={{ color: 'var(--accent-2)' }}>{pdfName}</strong>. Let your collaborators know who you are.</>
            : 'Let your collaborators know who you are.'}
        </p>

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="modal-label" htmlFor="username-input">Your display name</label>
            <input
              id="username-input"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex, Student 1…"
              autoFocus
              maxLength={24}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack} style={{ flex: 1 }}>
              ← Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim()}
              style={{ flex: 2, justifyContent: 'center' }}
            >
              Join Session →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
