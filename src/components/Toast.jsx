export default function Toast({ msg, type = 'success' }) {
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'
  return (
    <div className={`toast toast-${type}`}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: type === 'success' ? 'rgba(16,185,129,0.2)' : type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(124,106,255,0.2)',
        color: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#7c6aff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0
      }}>{icon}</span>
      {msg}
    </div>
  )
}
