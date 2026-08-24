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
  custom_color: string | null
  custom_icon: string | null
  created_at: string
}

const EMPTY_FORM = {
  subject: '',
  type: '',
  title: '',
  due_date: '',
  due_time: '',
  custom_color: '',
  custom_icon: '',
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Filters
  const [filterSubject, setFilterSubject] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCompleted, setFilterCompleted] = useState<string>('all')

  // Suggestion lists
  const [subjects, setSubjects] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])

  useEffect(() => {
    fetchTasks()
    fetchSuggestions()
  }, [filterSubject, filterType, filterCompleted])

  async function fetchSuggestions() {
    const { data: subjectData } = await supabase
      .from('tasks')
      .select('subject')

    const { data: typeData } = await supabase
      .from('tasks')
      .select('type')

    if (subjectData) {
      const unique = [...new Set(subjectData.map((r) => r.subject))].sort()
      setSubjects(unique)
    }
    if (typeData) {
      const unique = [...new Set(typeData.map((r) => r.type))].sort()
      setTypes(unique)
    }
  }

  async function fetchTasks() {
    setLoading(true)
    let query = supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true })

    if (filterSubject) query = query.eq('subject', filterSubject)
    if (filterType) query = query.eq('type', filterType)
    if (filterCompleted === 'true') query = query.eq('completed', true)
    if (filterCompleted === 'false') query = query.eq('completed', false)

    const { data, error } = await query
    if (error) {
      alert('Error fetching tasks: ' + error.message)
    } else {
      setTasks(data ?? [])
    }
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      subject: form.subject,
      type: form.type,
      title: form.title,
      due_date: form.due_date,
      due_time: form.due_time || null,
      custom_color: form.custom_color || null,
      custom_icon: form.custom_icon || null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', editingId)
      if (error) return alert('Update failed: ' + error.message)
    } else {
      const { error } = await supabase
        .from('tasks')
        .insert(payload)
      if (error) return alert('Insert failed: ' + error.message)
    }

    setForm(EMPTY_FORM)
    setEditingId(null)
    fetchTasks()
    fetchSuggestions()
  }

  async function toggleCompleted(task: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
    if (error) return alert('Toggle failed: ' + error.message)
    fetchTasks()
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return alert('Delete failed: ' + error.message)
    fetchTasks()
    fetchSuggestions()
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setForm({
      subject: task.subject,
      type: task.type,
      title: task.title,
      due_date: task.due_date,
      due_time: task.due_time ?? '',
      custom_color: task.custom_color ?? '',
      custom_icon: task.custom_icon ?? '',
    })
  }

  return (
    <div>
      <h2>Tasks</h2>

      {/* Filters */}
      <fieldset style={{ marginBottom: '16px' }}>
        <legend>Filters</legend>
        <label>
          Subject:{' '}
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="">All</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          Type:{' '}
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          Status:{' '}
          <select value={filterCompleted} onChange={(e) => setFilterCompleted(e.target.value)}>
            <option value="all">All</option>
            <option value="false">Incomplete</option>
            <option value="true">Completed</option>
          </select>
        </label>
      </fieldset>

      {/* Add/Edit Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
        <fieldset>
          <legend>{editingId ? 'Edit Task' : 'Add Task'}</legend>
          <div>
            <label>Title: <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          </div>
          <div>
            <label>Subject: <input required list="subjects-list" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
            <datalist id="subjects-list">
              {subjects.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label>Type: <input required list="types-list" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></label>
            <datalist id="types-list">
              {types.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label>Due Date: <input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          </div>
          <div>
            <label>Due Time: <input type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} /></label>
          </div>
          <div>
            <label>Custom Color: <input placeholder="#ff0000" value={form.custom_color} onChange={(e) => setForm({ ...form, custom_color: e.target.value })} /></label>
          </div>
          <div>
            <label>Custom Icon: <input value={form.custom_icon} onChange={(e) => setForm({ ...form, custom_icon: e.target.value })} /></label>
          </div>
          <button type="submit">{editingId ? 'Save' : 'Add'}</button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>
              Cancel
            </button>
          )}
        </fieldset>
      </form>

      {/* Task List */}
      {loading ? (
        <p>Loading...</p>
      ) : tasks.length === 0 ? (
        <p>No tasks found.</p>
      ) : (
        <table border={1} cellPadding={6}>
          <thead>
            <tr>
              <th>Done</th>
              <th>Title</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Due Date</th>
              <th>Due Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ textDecoration: t.completed ? 'line-through' : 'none' }}>
                <td>
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => toggleCompleted(t)}
                  />
                </td>
                <td>{t.title}</td>
                <td>{t.subject}</td>
                <td>{t.type}</td>
                <td>{t.due_date}</td>
                <td>{t.due_time ?? '—'}</td>
                <td>
                  <button onClick={() => startEdit(t)}>Edit</button>{' '}
                  <button onClick={() => deleteTask(t.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
