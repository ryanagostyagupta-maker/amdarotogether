import { useState, useRef } from 'react'

export default function PdfVoteModal({ proposal, myId, onVote, onClose }) {
  const [voted, setVoted] = useState(false)
  const fileInputRef = useRef()

  if (!proposal) return null

  const { proposer, pdfName, votes, totalUsers } = proposal
  const yesCount = votes?.yes?.length || 0
  const noCount  = votes?.no?.length  || 0
  const myVote   = votes?.yes?.includes(myId) ? 'yes' : votes?.no?.includes(myId) ? 'no' : null
  const needed   = Math.ceil(totalUsers / 2)
  const pct      = totalUsers > 0 ? Math.round((yesCount / totalUsers) * 100) : 0

  const cast = (v) => {
    if (voted || myVote) return
    setVoted(true)
    onVote(v)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'rgba(12,12,14,0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 28,
        width: 340,
        boxShadow: '0 40px 80px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              PDF Switch Proposal
            </p>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
              {proposer} wants to switch PDF
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, padding: 2 }}>✕</button>
        </div>

        {/* PDF name */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pdfName}
          </span>
        </div>

        {/* Vote progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{yesCount} in favour · {noCount} against</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{needed} needed</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Vote buttons */}
        {myVote ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
            You voted <strong style={{ color: myVote === 'yes' ? '#22c55e' : '#ef4444' }}>{myVote === 'yes' ? 'Switch ✓' : 'Keep ✗'}</strong> — waiting for others…
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => cast('no')}
              style={{
                flex: 1, padding: '11px', borderRadius: 99,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}
            >Keep current</button>
            <button
              onClick={() => cast('yes')}
              style={{
                flex: 1, padding: '11px', borderRadius: 99,
                border: 'none', background: '#fff',
                color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >Switch PDF →</button>
          </div>
        )}
      </div>
    </div>
  )
}
