import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  reminder_mode: string
  daily_digest_time: string
  preferences: Record<string, unknown>
  created_at: string
}

export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [reminderMode, setReminderMode] = useState('urgent')
  const [digestTime, setDigestTime] = useState('08:00')

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      alert('Error fetching profile: ' + error.message)
    } else if (data) {
      setProfile(data)
      setReminderMode(data.reminder_mode)
      // daily_digest_time comes as "HH:MM:SS" from Postgres, trim to "HH:MM"
      setDigestTime(data.daily_digest_time?.substring(0, 5) ?? '08:00')
    }
    setLoading(false)
  }

  async function saveSettings() {
    if (!profile) return
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        reminder_mode: reminderMode,
        daily_digest_time: digestTime,
      })
      .eq('id', profile.id)

    if (error) {
      alert('Save failed: ' + error.message)
    } else {
      alert('Settings saved!')
      fetchProfile()
    }
    setSaving(false)
  }

  if (loading) return <p>Loading settings...</p>
  if (!profile) return <p>No profile found.</p>

  return (
    <div>
      <h2>Settings</h2>

      <table cellPadding={6}>
        <tbody>
          <tr>
            <td><strong>Display Name:</strong></td>
            <td>{profile.display_name ?? '—'}</td>
          </tr>
          <tr>
            <td><strong>Email:</strong></td>
            <td>(from your Google account)</td>
          </tr>
          <tr>
            <td><strong>Timezone:</strong></td>
            <td>{profile.timezone} (auto-detected from browser)</td>
          </tr>
          <tr>
            <td><strong>Account Created:</strong></td>
            <td>{new Date(profile.created_at).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h3>Reminder Settings</h3>

      <div style={{ marginBottom: '10px' }}>
        <label>
          Reminder Mode:{' '}
          <select value={reminderMode} onChange={(e) => setReminderMode(e.target.value)}>
            <option value="urgent">Urgent (threshold-based: 48h, 24h, 2h, overdue)</option>
            <option value="daily">Daily Digest (one email per day)</option>
          </select>
        </label>
      </div>

      {reminderMode === 'daily' && (
        <div style={{ marginBottom: '10px' }}>
          <label>
            Daily Digest Time (your local time):{' '}
            <input
              type="time"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
            />
          </label>
        </div>
      )}

      <button onClick={saveSettings} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
