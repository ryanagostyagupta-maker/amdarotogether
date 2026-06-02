import { useState, useEffect } from 'react'
import LandingPage from './components/LandingPage'
import Workspace from './components/Workspace'
import NameModal from './components/NameModal'
import Toast from './components/Toast'
import Auth from './components/Auth'
import { supabase } from './lib/supabase'

export default function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('landing') // 'landing' | 'name-modal' | 'workspace'
  const [roomData, setRoomData] = useState(null)  // { roomId, pdfUrl, pdfName, inviteCode }
  const [userName, setUserName] = useState('')
  const [toast, setToast] = useState(null)

  // Listen to Supabase auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        // If the user's name metadata is set, pre-fill it
        const name = session.user.user_metadata?.display_name || session.user.email.split('@')[0]
        setUserName(name)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        const name = session.user.user_metadata?.display_name || session.user.email.split('@')[0]
        setUserName(name)
      } else {
        setUser(null)
        setRoomData(null)
        setView('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check if URL has a roomId param (direct link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomId = params.get('room')
    if (roomId) {
      fetch(`/api/rooms/${roomId}`)
        .then(r => r.json())
        .then(data => {
          if (data.pdfUrl) {
            setRoomData({ roomId, ...data })
            setView('name-modal')
          } else {
            showToast('Room not found or expired.', 'error')
            window.history.replaceState({}, '', '/')
          }
        })
        .catch(() => {
          showToast('Could not connect to server.', 'error')
          window.history.replaceState({}, '', '/')
        })
    }
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleRoomReady = (data) => {
    setRoomData(data)
    setView('name-modal')
  }

  const handleNameSubmit = (name) => {
    setUserName(name)
    setView('workspace')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRoomData(null)
    setView('landing')
    window.history.replaceState({}, '', '/')
    showToast('Signed out successfully.', 'success')
  }

  if (!user) {
    return (
      <>
        <Auth onAuthSuccess={setUser} showToast={showToast} />
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </>
    )
  }

  return (
    <>
      {view === 'landing' && (
        <LandingPage
          onRoomReady={handleRoomReady}
          showToast={showToast}
          user={user}
          onSignOut={handleSignOut}
        />
      )}
      {view === 'name-modal' && (
        <NameModal
          pdfName={roomData?.pdfName}
          onSubmit={handleNameSubmit}
          onBack={() => setView('landing')}
          defaultName={userName}
        />
      )}
      {view === 'workspace' && roomData && (
        <Workspace
          roomData={roomData}
          userName={userName}
          showToast={showToast}
          user={user}
          onSignOut={handleSignOut}
          onLeave={() => {
            setView('landing')
            setRoomData(null)
            window.history.replaceState({}, '', '/')
          }}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </>
  )
}
