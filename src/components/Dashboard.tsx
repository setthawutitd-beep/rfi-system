import type { Rfi, UserRole } from '../types/rfi'
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '../types/rfi'

interface Props {
  rfis: Rfi[]
  currentRole: UserRole
  onOpenRfi: (id: string) => void
}

export default function Dashboard({ rfis, currentRole: _currentRole, onOpenRfi }: Props) {
  const total    = rfis.length
  const open     = rfis.filter(r => r.status === 'open').length
  const pending  = rfis.filter(r => ['qc','consult','inspect','resubmit'].includes(r.status)).length
  const rejected = rfis.filter(r => r.status === 'reject').length
  const closed   = rfis.filter(r => r.status === 'closed').length

  const kpis = [
    { num: total,    label: 'Total RFI',   color: 'var(--text)',    delta: '▲ 2 สัปดาห์นี้', dc: 'var(--text3)' },
    { num: open,     label: 'Newly Open',  color: 'var(--orange)',  delta: '▲ 1 ใหม่วันนี้', dc: 'var(--orange)' },
    { num: pending,  label: 'In Progress', color: 'var(--accent2)', delta: 'รอดำเนินการ',      dc: 'var(--text3)' },
    { num: rejected, label: 'Rejected',    color: 'var(--red)',     delta: '● ต้องแก้ไข',     dc: 'var(--red)' },
    { num: closed,   label: 'Closed',      color: 'var(--green)',   delta: '✓ เสร็จสมบูรณ์',  dc: 'var(--green)' },
  ]

  // Status chart data
  const statusCounts = [
    { label: 'Open',         val: open,                                          color: 'var(--orange)' },
    { label: 'Pending QC',   val: rfis.filter(r => r.status === 'qc').length,    color: 'var(--yellow)' },
    { label: 'In Consult',   val: rfis.filter(r => r.status === 'consult').length, color: 'var(--blue)' },
    { label: 'Inspection',   val: rfis.filter(r => r.status === 'inspect').length, color: 'var(--green)' },
    { label: 'Rejected',     val: rejected,                                      color: 'var(--red)' },
    { label: 'Closed',       val: closed,                                        color: 'var(--text3)' },
  ]
  const maxStatus = Math.max(...statusCounts.map(s => s.val), 1)

  // Discipline chart
  const discs = ['CIV', 'STR', 'ARC', 'MEP', 'GEO']
  const discColors = { CIV: 'var(--accent2)', STR: 'var(--accent)', ARC: 'var(--green)', MEP: 'var(--purple)', GEO: 'var(--yellow)' }
  const discCounts = discs.map(d => ({
    label: d,
    val: rfis.filter(r => r.discipline === d).length,
    color: discColors[d as keyof typeof discColors],
  }))
  const maxDisc = Math.max(...discCounts.map(d => d.val), 1)

  // Overdue: inspect_date < today
  const today = new Date()
  const overdue = rfis.filter(r => {
    if (r.status === 'closed' || r.status === 'reject') return false
    if (!r.inspect_date) return false
    return new Date(r.inspect_date) < today
  }).slice(0, 5)

  // Weekly trend (last 7 days mock from actual data)
  const weeks = ['W1','W2','W3','W4','W5','W6','W7']
  const trendMax = 8
  const trendData = weeks.map((w, i) => ({
    label: w,
    submit: Math.min(rfis.filter((_, ri) => ri % 7 === i).length + 1, trendMax),
    closed: Math.floor(closed * ((i + 1) / 7)),
  }))

  return (
    <div>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1, marginBottom: 4, color: k.color }}>{k.num}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', marginTop: 4, color: k.dc }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Status chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">📊</div>
            <div className="card-title">RFI by Status</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {statusCounts.map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <div style={{ width: 90, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>{s.label}</div>
                <div style={{ flex: 1, height: 8, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: s.color,
                    width: `${(s.val / maxStatus) * 100}%`,
                    transition: 'width 0.8s cubic-bezier(.4,0,.2,1)',
                  }} />
                </div>
                <div style={{ width: 24, textAlign: 'right', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text3)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Discipline chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">🏗</div>
            <div className="card-title">RFI by Discipline</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {discCounts.map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <div style={{ width: 90, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
                <div style={{ flex: 1, height: 8, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: d.color,
                    width: `${(d.val / maxDisc) * 100}%`,
                    transition: 'width 0.8s cubic-bezier(.4,0,.2,1)',
                  }} />
                </div>
                <div style={{ width: 24, textAlign: 'right', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text3)' }}>{d.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Overdue */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">⚠️</div>
            <div className="card-title">Overdue / Urgent</div>
            <span style={{ fontSize: 10, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 4, padding: '2px 6px', marginLeft: 'auto', fontFamily: 'IBM Plex Mono, monospace' }}>ALERT</span>
          </div>
          {overdue.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 16 }}>✓ ไม่มี RFI ที่เกินกำหนด</div>
            : overdue.map(r => {
              const days = Math.floor((today.getTime() - new Date(r.inspect_date!).getTime()) / 86400000)
              return (
                <div
                  key={r.id} onClick={() => onOpenRfi(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: 'rgba(240,80,96,0.06)', border: '1px solid rgba(240,80,96,0.2)',
                    borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(240,80,96,0.1)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(240,80,96,0.06)'}
                >
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 600, color: 'var(--red)', flexShrink: 0 }}>{r.id}</div>
                  <div style={{ fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--red)', flexShrink: 0, fontWeight: 700 }}>+{days}d</div>
                </div>
              )
            })
          }
        </div>

        {/* Weekly trend */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">📈</div>
            <div className="card-title">Trend รายสัปดาห์</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 4 }}>
            {trendData.map(w => (
              <div key={w.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ width: '60%', height: w.submit * 9, background: 'var(--accent)', borderRadius: '2px 2px 0 0', minHeight: 3 }} />
                  <div style={{ width: '60%', height: w.closed * 6, background: 'var(--green)', borderRadius: '2px 2px 0 0', minHeight: 2 }} />
                </div>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{w.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10.5, color: 'var(--text3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />Submit
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)' }} />Closed
            </div>
          </div>
        </div>
      </div>

      {/* Recent RFIs */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header">
          <div className="card-icon">🕐</div>
          <div className="card-title">RFI ล่าสุด</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RFI No.</th>
                <th>Work Type</th>
                <th>Location</th>
                <th>Status</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {rfis.slice(0, 5).map(r => (
                <tr key={r.id} onClick={() => onOpenRfi(r.id)}>
                  <td><span className="mono" style={{ color: 'var(--accent)', fontSize: 11 }}>{r.id}</span></td>
                  <td>{r.type}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 11.5 }}>{r.location}</td>
                  <td><span className={`badge ${STATUS_BADGE_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: r.priority === 'high' ? 'var(--red)' : r.priority === 'medium' ? 'var(--yellow)' : 'var(--text3)',
                    }}>
                      {r.priority === 'high' ? '↑ HIGH' : r.priority === 'medium' ? '→ MED' : '↓ LOW'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
