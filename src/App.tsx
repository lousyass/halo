import { useState, useEffect } from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Calendar from './pages/Calendar'
import Routine from './pages/Routine'
import Settings from './pages/Settings'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) syncTimezone()
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session) syncTimezone()
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <p>Loading...</p>

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <div>
      <nav style={{ padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <Link to="/">Dashboard</Link>{' | '}
        <Link to="/tasks">Tasks</Link>{' | '}
        <Link to="/calendar">Calendar</Link>{' | '}
        <Link to="/routine">Routine</Link>{' | '}
        <Link to="/settings">Settings</Link>{' | '}
        <button onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </nav>
      <div style={{ padding: '0 20px' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/routine" element={<Routine />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}

/** Detect browser timezone and upsert to profiles on every login */
async function syncTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({ timezone: tz })
    .eq('id', user.id)
}
