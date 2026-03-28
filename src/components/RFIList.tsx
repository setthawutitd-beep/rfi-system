import { useState, useMemo } from 'react'
import type { Rfi, RfiStatus, RfiDiscipline, RfiPriority } from '../types/rfi'
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '../types/rfi'

interface Props {
  rfis: Rfi[]
  onOpenRfi: (id: string) => void
}

export default function RFIList({ rfis, onOpenRfi }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<RfiStatus | ''>('')
  const [filterDisc, setFilterDisc] = useState<RfiDiscipline | ''>('')
  const [filterPrio, setFilterPrio] = useState<RfiPriority | ''>('')

  const filtered = useMemo(() => {
    return rfis.filter(r => {
      if (search && !r.id.toLowerCase().includes(search.toLowerCase()) &&
          !r.type.toLowerCase().includes(search.toLowerCase()) &&
          !r.location.toLowerCase().includes(search.toLowerCase())) return false
      if (filterStatus && r.status !== filterStatus) return false
      if (filterDisc && r.discipline !== filterDisc) return false
      if (filterPrio && r.priority !== filterPrio) return false
      return true
    })
  }, [rfis, search, filterStatus, filterDisc, filterPrio])

  const today = new Date()

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text2)', padding: '7px 10px', borderRadius: 7,
    fontSize: 12, fontFamily: 'IBM Plex Sans Thai, sans-serif',
    outline: 'none', cursor: 'pointer',
  }

  return (
    <div>
      {/* Filter Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
          <input
            className="input"
            style={{ paddingLeft: 30, width: 200 }}
            type="text"
            placeholder="ค้นหา RFI..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value as RfiStatus | '')}>
          <option value="">ทุกสถานะ</option>
          <option value="open">Open</option>
          <option value="qc">Pending QC</option>
          <option value="consult">In Consult</option>
          <option value="inspect">Site Inspection</option>
          <option value="reject">Rejected</option>
          <option value="resubmit">Re-submitted</option>
          <option value="closed">Closed</option>
        </select>

        <select style={selectStyle} value={filterDisc} onChange={e => setFilterDisc(e.target.value as RfiDiscipline | '')}>
          <option value="">ทุก Discipline</option>
          <option value="CIV">CIV</option>
          <option value="STR">STR</option>
          <option value="ARC">ARC</option>
          <option value="MEP">MEP</option>
          <option value="GEO">GEO</option>
        </select>

        <select style={selectStyle} value={filterPrio} onChange={e => setFilterPrio(e.target.value as RfiPriority | '')}>
          <option value="">ทุก Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text3)' }}>
          แสดง {filtered.length} / {rfis.length} รายการ
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>RFI No.</th>
              <th>Work Type</th>
              <th>Location</th>
              <th>ผู้ขอ</th>
              <th>Priority</th>
              <th>Status</th>
              <th>วันที่ขอ</th>
              <th>Overdue</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const isOverdue = r.inspect_date && new Date(r.inspect_date) < today && !['closed','reject'].includes(r.status)
              const days = isOverdue ? Math.floor((today.getTime() - new Date(r.inspect_date!).getTime()) / 86400000) : 0
              return (
                <tr key={r.id} onClick={() => onOpenRfi(r.id)}>
                  <td>
                    <span className="mono" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>{r.id}</span>
                  </td>
                  <td>
                    <div style={{ fontSize: 12.5 }}>{r.type}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1 }}>
                      <span className="code-tag">{r.discipline}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 11.5, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.location}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: r.requester?.color || 'var(--text3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: '#0a0d12', flexShrink: 0,
                      }}>{r.requester?.avatar || r.requester?.name?.[0] || '?'}</div>
                      <span style={{ fontSize: 11.5 }}>{r.requester?.name || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: r.priority === 'high' ? 'var(--red)' : r.priority === 'medium' ? 'var(--yellow)' : 'var(--text3)',
                    }}>
                      {r.priority === 'high' ? '↑ HIGH' : r.priority === 'medium' ? '→ MED' : '↓ LOW'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '—'}
                  </td>
                  <td>
                    {isOverdue
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', fontFamily: 'IBM Plex Mono, monospace' }}>+{days}d</span>
                      : <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace' }}>✓</span>
                    }
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={e => { e.stopPropagation(); onOpenRfi(r.id) }}
                    >ดูรายละเอียด</button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                  ไม่พบ RFI ที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
