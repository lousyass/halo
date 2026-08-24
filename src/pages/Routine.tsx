import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface RoutineEntry {
  id: string
  day_of_week: number
  subject: string
  start_time: string
  end_time: string | null
  location: string | null
  notes: string | null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const EMPTY_FORM = {
  day_of_week: 0,
  subject: '',
  start_time: '',
  end_time: '',
  location: '',
  notes: '',
}

export default function Routine() {
  const [entries, setEntries] = useState<RoutineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    fetchEntries()
  }, [])

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('routine_entries')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) alert('Error: ' + error.message)
    else setEntries(data ?? [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      day_of_week: Number(form.day_of_week),
      subject: form.subject,
      start_time: form.start_time,
      end_time: form.end_time || null,
      location: form.location || null,
      notes: form.notes || null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('routine_entries')
        .update(payload)
        .eq('id', editingId)
      if (error) return alert('Update failed: ' + error.message)
    } else {
      const { error } = await supabase
        .from('routine_entries')
        .insert(payload)
      if (error) return alert('Insert failed: ' + error.message)
    }

    setForm(EMPTY_FORM)
    setEditingId(null)
    fetchEntries()
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return
    const { error } = await supabase.from('routine_entries').delete().eq('id', id)
    if (error) return alert('Delete failed: ' + error.message)
    fetchEntries()
  }

  function startEdit(entry: RoutineEntry) {
    setEditingId(entry.id)
    setForm({
      day_of_week: entry.day_of_week,
      subject: entry.subject,
      start_time: entry.start_time,
      end_time: entry.end_time ?? '',
      location: entry.location ?? '',
      notes: entry.notes ?? '',
    })
  }

  // Group by day
  const grouped = new Map<number, RoutineEntry[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.day_of_week) ?? []
    list.push(entry)
    grouped.set(entry.day_of_week, list)
  }

  return (
    <div>
      <h2>Class Routine</h2>

      {/* Add/Edit Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
        <fieldset>
          <legend>{editingId ? 'Edit Entry' : 'Add Entry'}</legend>
          <div>
            <label>
              Day:{' '}
              <select
                value={form.day_of_week}
                onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>Subject: <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          </div>
          <div>
            <label>Start Time: <input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
          </div>
          <div>
            <label>End Time: <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></label>
          </div>
          <div>
            <label>Location: <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          </div>
          <div>
            <label>Notes: <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <button type="submit">{editingId ? 'Save' : 'Add'}</button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>
              Cancel
            </button>
          )}
        </fieldset>
      </form>

      {/* Entries grouped by day */}
      {loading ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p>No routine entries yet.</p>
      ) : (
        DAY_NAMES.map((dayName, dow) => {
          const dayEntries = grouped.get(dow)
          if (!dayEntries || dayEntries.length === 0) return null
          return (
            <div key={dow} style={{ marginBottom: '16px' }}>
              <h3>{dayName}</h3>
              <table border={1} cellPadding={6}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Subject</th>
                    <th>Location</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dayEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.start_time}{e.end_time ? `–${e.end_time}` : ''}</td>
                      <td>{e.subject}</td>
                      <td>{e.location ?? '—'}</td>
                      <td>{e.notes ?? '—'}</td>
                      <td>
                        <button onClick={() => startEdit(e)}>Edit</button>{' '}
                        <button onClick={() => deleteEntry(e.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })
      )}
    </div>
  )
}
