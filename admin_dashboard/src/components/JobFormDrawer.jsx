import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { JOB_STATUS, JOB_TYPE, SHIFT } from '../utils/format'
import { Drawer, ErrorBox, Loading, Section } from './ui'

const COUNTIES = ['Nairobi', 'Kiambu', 'Mombasa', 'Nakuru', 'Kisumu', 'Uasin Gishu', 'Machakos', 'Kajiado', 'Nyeri']

const blank = {
  title: '', description: '', categoryId: '', county: 'Nairobi', locationDetail: '', jobType: 'full_time',
  shift: 'morning', minExperienceYears: 0, salaryMinKes: '', salaryMaxKes: '', status: 'open', requirements: [],
}

function fromJob(job) {
  if (!job) return blank
  return {
    ...blank, ...job,
    description: job.description || '', locationDetail: job.locationDetail || '',
    salaryMinKes: job.salaryMinKes ?? '', salaryMaxKes: job.salaryMaxKes ?? '',
    requirements: job.requirements.map((r) => ({ skillTagId: r.skillTagId, importance: r.importance, requiredProficiency: r.requiredProficiency })),
  }
}

/** Create (job = null) or edit a job with its required skills. */
export function JobFormDrawer({ job, onClose, onSaved }) {
  const [form, setForm] = useState(() => fromJob(job))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const lists = useApi(() => Promise.all([
    api.get('/admin/job-categories').then((r) => r.data.categories),
    api.get('/admin/skill-tags').then((r) => r.data.skillTags),
  ]), 'job-form-lists')
  const [categories, skills] = lists.data || [[], []]

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setReq = (i, key, value) => setForm((f) => ({
    ...f, requirements: f.requirements.map((r, j) => (j === i ? { ...r, [key]: value } : r)),
  }))
  const used = new Set(form.requirements.map((r) => r.skillTagId))
  const unused = skills.filter((s) => !used.has(s.skillTagId))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      ...form,
      minExperienceYears: Number(form.minExperienceYears),
      salaryMinKes: form.salaryMinKes === '' ? null : Number(form.salaryMinKes),
      salaryMaxKes: form.salaryMaxKes === '' ? null : Number(form.salaryMaxKes),
      requirements: form.requirements.map((r) => ({ ...r, importance: Number(r.importance), requiredProficiency: Number(r.requiredProficiency) })),
    }
    try {
      const { data } = job ? await api.put(`/admin/jobs/${job.jobId}`, body) : await api.post('/admin/jobs', body)
      onSaved(data)
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Drawer
      title={job ? 'Edit job' : 'New job'}
      onClose={onClose}
      footer={(
        <div className="row gap spread">
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn primary" form="job-form" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save job'}</button>
        </div>
      )}
    >
      {lists.loading && !lists.data && <Loading />}
      {lists.error && <ErrorBox message={lists.error} onRetry={lists.reload} />}
      {error && <ErrorBox message={error} />}
      <form id="job-form" className="form" onSubmit={save}>
        <label>Title<input required minLength={3} maxLength={150} value={form.title} onChange={set('title')} /></label>
        <div className="grid2">
          <label>Category
            <select required value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={form.status} onChange={set('status')}>
              {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>County
            <select value={form.county} onChange={set('county')}>
              {[...new Set([...COUNTIES, form.county])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Area / estate<input value={form.locationDetail} onChange={set('locationDetail')} placeholder="e.g. Kilimani" /></label>
          <label>Job type
            <select value={form.jobType} onChange={set('jobType')}>
              {Object.entries(JOB_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Shift
            <select value={form.shift} onChange={set('shift')}>
              {Object.entries(SHIFT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Minimum experience (years)<input type="number" min={0} max={60} value={form.minExperienceYears} onChange={set('minExperienceYears')} /></label>
          <span />
          <label>Pay from (KES / month)<input type="number" min={0} step={500} value={form.salaryMinKes} onChange={set('salaryMinKes')} /></label>
          <label>Pay to (KES / month)<input type="number" min={0} step={500} value={form.salaryMaxKes} onChange={set('salaryMaxKes')} /></label>
        </div>
        <label>Description<textarea rows={4} value={form.description} onChange={set('description')} /></label>

        <Section title="Required skills" aside={<span className="muted small">Matching uses these. Importance 0–1 weights the variant method.</span>}>
          {form.requirements.map((r, i) => {
            const skill = skills.find((s) => s.skillTagId === r.skillTagId)
            return (
              <div key={r.skillTagId} className="req-row">
                <span className="req-name">{skill ? skill.name : 'Unknown skill'}</span>
                <label className="small">Importance
                  <input type="number" min={0} max={1} step="any" value={r.importance} onChange={(e) => setReq(i, 'importance', e.target.value)} />
                </label>
                <label className="small">Min. level
                  <input type="number" min={1} max={5} value={r.requiredProficiency} onChange={(e) => setReq(i, 'requiredProficiency', e.target.value)} />
                </label>
                <button type="button" className="icon-btn" aria-label="Remove skill"
                  onClick={() => setForm((f) => ({ ...f, requirements: f.requirements.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            )
          })}
          <select value="" onChange={(e) => e.target.value && setForm((f) => ({
            ...f, requirements: [...f.requirements, { skillTagId: e.target.value, importance: 1, requiredProficiency: 3 }],
          }))}>
            <option value="">+ Add a required skill…</option>
            {['specialization', 'technical', 'certification', 'language'].map((cat) => (
              <optgroup key={cat} label={cat}>
                {unused.filter((s) => s.category === cat).map((s) => <option key={s.skillTagId} value={s.skillTagId}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Section>
      </form>
    </Drawer>
  )
}
