import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ONBOARDING, ONBOARDING_ORDER, label, pct } from '../utils/format'
import { ErrorBox, Loading } from '../components/ui'

const BLUE = '#0049AC'
const GREEN = '#1E8E3E'
const AMBER = '#C77700'
const GREY = '#B8BFCC'

function Tile({ label: text, value, to, tone }) {
  const body = (
    <>
      <span className="tile-label">{text}</span>
      <span className={`tile-value ${tone || ''}`}>{value}</span>
    </>
  )
  return to ? <Link to={to} className="tile link">{body}</Link> : <div className="tile">{body}</div>
}

function Card({ title, note, children }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {note && <p className="muted small">{note}</p>}
      {children}
    </section>
  )
}

export function DashboardPage() {
  const { data: a, error, loading, reload } = useApi(() => api.get('/admin/analytics').then((r) => r.data), 'analytics')

  if (loading && !a) return <Loading />
  if (error && !a) return <ErrorBox message={error} onRetry={reload} />

  const funnel = ONBOARDING_ORDER.map((s) => ({ stage: label(ONBOARDING, s), count: a.funnel.find((f) => f.status === s)?.count || 0 }))
  const outcomes = [
    { name: 'Approved', count: a.submissions.approved ?? 0, fill: GREEN },
    { name: 'Needs review', count: a.submissions.flagged ?? 0, fill: AMBER },
    { name: 'Rejected', count: a.submissions.rejected ?? 0, fill: '#B3261E' },
    { name: 'In progress', count: (a.submissions.pending ?? 0) + (a.submissions.processing ?? 0), fill: GREY },
  ]
  const trust = a.trustDistribution.map((b) => ({ range: b.range, verified: b.verified, notVerified: b.count - b.verified }))
  const skills = a.skills.slice(0, 12)
  const scarce = a.skills.filter((s) => s.demand > 0).sort((x, y) => (y.pressure ?? 99) - (x.pressure ?? 99)).slice(0, 5)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <button className="btn small" onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="tiles">
        <Tile label="Caregivers" value={a.totals.caregivers} to="/caregivers" />
        <Tile label="Verified" value={a.totals.verified} tone="green" />
        <Tile label="Awaiting review" value={a.totals.awaitingReview} tone={a.totals.awaitingReview ? 'amber' : ''} to="/reviews" />
        <Tile label="Open jobs" value={a.totals.openJobs} to="/jobs" />
        <Tile label="Interests sent" value={a.totals.interests} />
        <Tile label="Avg trust (verified)" value={a.totals.avgVerifiedTrust == null ? '–' : pct(a.totals.avgVerifiedTrust)} />
      </div>

      <div className="cards">
        <Card title="Onboarding funnel" note="Caregivers at each stage now">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage" width={130} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Caregivers" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Trust score distribution" note="Latest trust score per caregiver, in bands of 0.1">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trust}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="verified" name="Verified" stackId="t" fill={GREEN} />
              <Bar dataKey="notVerified" name="Not verified" stackId="t" fill={GREY} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Verification outcomes"
          note={`All submissions by current status. Administrators have approved ${a.decisions.admin_approve ?? 0} and rejected ${a.decisions.admin_reject ?? 0} after review.`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={outcomes}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Submissions">
                {outcomes.map((o) => <Cell key={o.name} fill={o.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Skill supply vs demand" note="Open jobs needing each skill vs verified caregivers who have it (top 12 by demand)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={skills} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="skill" width={170} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="demand" name="Open jobs needing it" fill={BLUE} />
              <Bar dataKey="supply" name="Verified caregivers with it" fill={GREEN} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Skill gaps" note="Open jobs per verified caregiver with the skill; higher means scarcer. Useful for training priorities.">
          <table className="table compact">
            <thead><tr><th>Skill</th><th className="num">Jobs</th><th className="num">Caregivers</th><th className="num">Jobs per caregiver</th></tr></thead>
            <tbody>
              {scarce.map((s) => (
                <tr key={s.skill}>
                  <td>{s.skill}</td><td className="num">{s.demand}</td><td className="num">{s.supply}</td>
                  <td className="num"><strong>{s.pressure ?? 'none available'}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
