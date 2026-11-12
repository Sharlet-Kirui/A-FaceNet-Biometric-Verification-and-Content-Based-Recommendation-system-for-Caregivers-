import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useApi } from '../hooks/useApi'
import { ErrorBox, Loading, Modal } from './ui'

export function CategoriesDialog({ onClose, onChanged }) {
  const { isSuperAdmin } = useAuth()
  const { data, error, loading, reload } = useApi(() => api.get('/admin/job-categories').then((r) => r.data.categories), 'categories')
  const [editing, setEditing] = useState(null) // { categoryId?, name, description }
  const [actionError, setActionError] = useState(null)

  async function run(fn) {
    setActionError(null)
    try {
      await fn()
      setEditing(null)
      reload()
      onChanged()
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }
  const save = () => run(() => (editing.categoryId
    ? api.put(`/admin/job-categories/${editing.categoryId}`, editing)
    : api.post('/admin/job-categories', editing)))
  const remove = (c) => run(() => api.delete(`/admin/job-categories/${c.categoryId}`))

  return (
    <Modal title="Job categories" onClose={onClose}>
      {!isSuperAdmin && <p className="note">Only a super administrator can add, rename or delete categories.</p>}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && <ErrorBox message={actionError} />}
      {data && (
        <table className="table compact">
          <thead><tr><th>Name</th><th className="num">Jobs</th>{isSuperAdmin && <th />}</tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.categoryId}>
                <td><strong>{c.name}</strong>{c.description && <div className="muted small">{c.description}</div>}</td>
                <td className="num">{c.jobCount}</td>
                {isSuperAdmin && (
                  <td className="actions">
                    <button className="btn small" onClick={() => setEditing({ categoryId: c.categoryId, name: c.name, description: c.description || '' })}>Edit</button>
                    <button className="btn small danger" disabled={c.jobCount > 0} title={c.jobCount ? 'Move its jobs first' : ''} onClick={() => remove(c)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isSuperAdmin && (editing ? (
        <form className="form inline-form" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input required minLength={2} placeholder="Category name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <input placeholder="Description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" type="submit">{editing.categoryId ? 'Save' : 'Add'}</button>
        </form>
      ) : (
        <button className="btn" onClick={() => setEditing({ name: '', description: '' })}>+ Add category</button>
      ))}
    </Modal>
  )
}
