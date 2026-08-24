import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Task {
  id: string
  subject: string
  type: string
  title: string
  due_date: string
  due_time: string | null
  completed: boolean
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardTasks()
  }, [])

  async function fetchDashboardTasks() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // 1. Overdue tasks (due_date < today), ordered by due_date asc (closest to today first)
    const { data: overdue } = await supabase
      .from('tasks')
      .select('*')
      .eq('completed', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true })

    // 2. Upcoming tasks (due_date >= today), ordered by due_date asc
    const { data: upcoming } = await supabase
      .from('tasks')
      .select('*')
      .eq('completed', false)
      .gte('due_date', today)
      .order('due_date', { ascending: true })

    // 3. Concatenate and limit to 7
    const combined = [...(overdue ?? []), ...(upcoming ?? [])].slice(0, 7)
    setTasks(combined)
    setLoading(false)
  }

  if (loading) return <p>Loading dashboard...</p>

  return (
    <div>
      <h2>Dashboard — Near-Deadline Tasks</h2>
      {tasks.length === 0 ? (
        <p>No pending tasks. 🎉</p>
      ) : (
        <table border={1} cellPadding={6}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Due Date</th>
              <th>Due Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const today = new Date().toISOString().split('T')[0]
              const isOverdue = t.due_date < today
              return (
                <tr key={t.id} style={{ backgroundColor: isOverdue ? '#ffe0e0' : 'transparent' }}>
                  <td>{t.title}</td>
                  <td>{t.subject}</td>
                  <td>{t.type}</td>
                  <td>{t.due_date}</td>
                  <td>{t.due_time ?? '—'}</td>
                  <td>{isOverdue ? '⚠️ Overdue' : 'Upcoming'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
