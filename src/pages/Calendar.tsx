import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Task {
  id: string
  title: string
  subject: string
  type: string
  due_date: string
  due_time: string | null
  completed: boolean
}

interface RoutineEntry {
  id: string
  subject: string
  start_time: string
  end_time: string | null
  location: string | null
  notes: string | null
  day_of_week: number
}

interface DayBackground {
  id: string
  image_url: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()) // 0-indexed

  // Day view popup state
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayTasks, setDayTasks] = useState<Task[]>([])
  const [dayRoutine, setDayRoutine] = useState<RoutineEntry[]>([])
  const [dayBg, setDayBg] = useState<DayBackground | null>(null)
  const [bgUrl, setBgUrl] = useState('')

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  async function selectDate(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)

    const dow = new Date(year, month, day).getDay()

    // 1. Tasks due that date
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('due_date', dateStr)
      .order('due_time', { ascending: true })

    // 2. Routine entries for that day-of-week
    const { data: routine } = await supabase
      .from('routine_entries')
      .select('*')
      .eq('day_of_week', dow)
      .order('start_time', { ascending: true })

    // 3. Day background
    const { data: bg } = await supabase
      .from('day_backgrounds')
      .select('*')
      .eq('date', dateStr)
      .limit(1)
      .maybeSingle()

    setDayTasks(tasks ?? [])
    setDayRoutine(routine ?? [])
    setDayBg(bg)
    setBgUrl(bg?.image_url ?? '')
  }

  async function saveDayBackground() {
    if (!selectedDate) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!bgUrl.trim()) {
      // Delete existing
      if (dayBg) {
        await supabase.from('day_backgrounds').delete().eq('id', dayBg.id)
        setDayBg(null)
      }
      return
    }

    // Upsert (unique on user_id, date)
    const { data, error } = await supabase
      .from('day_backgrounds')
      .upsert(
        { user_id: user.id, date: selectedDate, image_url: bgUrl.trim() },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single()

    if (error) {
      alert('Failed to save background: ' + error.message)
    } else {
      setDayBg(data)
    }
  }

  return (
    <div>
      <h2>Calendar</h2>

      {/* Month navigation */}
      <div style={{ marginBottom: '10px' }}>
        <button onClick={prevMonth}>← Prev</button>{' '}
        <strong>{new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>{' '}
        <button onClick={nextMonth}>Next →</button>
      </div>

      {/* Calendar grid */}
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {DAYS.map((d) => (
              <th key={d} style={{ width: '60px' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) => (
            <tr key={week}>
              {cells.slice(week * 7, week * 7 + 7).map((day, i) => (
                <td
                  key={i}
                  style={{
                    cursor: day ? 'pointer' : 'default',
                    textAlign: 'center',
                    backgroundColor: day && selectedDate === `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? '#ddf' : 'transparent',
                  }}
                  onClick={() => day && selectDate(day)}
                >
                  {day ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Day view popup */}
      {selectedDate && (
        <div style={{ marginTop: '20px', border: '2px solid #333', padding: '16px', maxWidth: '600px' }}>
          <h3>
            {selectedDate}
            <button onClick={() => setSelectedDate(null)} style={{ marginLeft: '10px' }}>Close</button>
          </h3>

          {/* Background preview */}
          {dayBg && (
            <div style={{ marginBottom: '10px' }}>
              <img src={dayBg.image_url} alt="Day background" style={{ maxWidth: '200px', maxHeight: '120px' }} />
            </div>
          )}

          {/* Tasks */}
          <h4>Tasks Due</h4>
          {dayTasks.length === 0 ? (
            <p>No tasks due this day.</p>
          ) : (
            <ul>
              {dayTasks.map((t) => (
                <li key={t.id}>
                  {t.completed ? '✅' : '⬜'} {t.title} ({t.subject}) {t.due_time ? `at ${t.due_time}` : ''}
                </li>
              ))}
            </ul>
          )}

          {/* Routine */}
          <h4>Class Schedule</h4>
          {dayRoutine.length === 0 ? (
            <p>No classes scheduled.</p>
          ) : (
            <ul>
              {dayRoutine.map((r) => (
                <li key={r.id}>
                  {r.start_time}{r.end_time ? `–${r.end_time}` : ''}: {r.subject}
                  {r.location ? ` (${r.location})` : ''}
                  {r.notes ? ` — ${r.notes}` : ''}
                </li>
              ))}
            </ul>
          )}

          {/* Set day background */}
          <h4>Day Background</h4>
          <input
            placeholder="Paste image URL"
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
            style={{ width: '300px' }}
          />{' '}
          <button onClick={saveDayBackground}>Save</button>
        </div>
      )}
    </div>
  )
}
