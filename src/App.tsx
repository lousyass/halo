import { useState, useEffect } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import StudyDen from './StudyDen'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) syncTimezone(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) syncTimezone(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #FDF2F6 0%, #F7E4EE 50%, #EFE2F7 100%)', fontFamily: 'Quicksand, sans-serif' }}>
        <p style={{ color: '#5B4B6D', fontSize: '1.1rem' }}>Loading your den... 🦌</p>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return <StudyDen session={session} />
}

function LoginScreen() {
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      alert('Login failed: ' + error.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #FDF2F6 0%, #F7E4EE 50%, #EFE2F7 100%)',
      fontFamily: 'Quicksand, sans-serif',
      padding: '2rem',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
      <div style={{
        background: 'rgba(255,255,255,0.85)',
        borderRadius: '2rem',
        padding: '3rem',
        boxShadow: '0 8px 32px rgba(120,90,130,0.15)',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
      }}>
        <h1 style={{ fontFamily: 'Fredoka, sans-serif', color: '#5B4B6D', fontSize: '2.2rem', marginBottom: '0.25rem' }}>
          Halo 🌸
        </h1>
        <p style={{ color: '#9B8BAD', fontSize: '0.95rem', marginBottom: '2rem' }}>your cozy deadline tracker</p>
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            borderRadius: '1rem',
            border: 'none',
            background: loading ? '#C9B6E4AA' : '#C9B6E4',
            color: 'white',
            fontFamily: 'Fredoka, sans-serif',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          {loading ? 'Redirecting...' : '✨ Sign in with Google'}
        </button>
      </div>
    </div>
  )
}

async function syncTimezone(userId: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  await supabase.from('profiles').update({ timezone: tz }).eq('id', userId)
}
