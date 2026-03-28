import type { Rfi } from '../types/rfi'
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../types/rfi'

interface Props {
  rfis: Rfi[]
  onOpenRfi: (id: string) => void
}

export default function History({ rfis, onOpenRfi }: Props) {
  // Flatten all history events, sorted by time desc
  const events = rfis
    .flatMap(r => (r.history || []).map(h => ({ ...h, rfi: r })))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)

  const actionColor: Record<string, string> = {
    submit: 'var(--orange)', approve: 'var(--green)', reject: 'var(--red)',
    resubmit: 'var(--purple)', inspect: 'var(--teal)', complete: 'var(--green)',
    close: 'var(--accent2)', comment: 'var(--text3)',
  }
  const actionLabel: Record<string, string> = {
    submit: 'ส่งคำขอ', approve: 'Approved', reject: 'Rejected',
    resubmit: 'Re-submitted', inspect: 'Site Inspection', complete: 'ตรวจเสร็จ',
    close: 'Closed', comment: 'Comment',
  }

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'เหตุการณ์ทั้งหมด', val: events.length, color: 'var(--text)' },
          { label: 'Approved', val: events.filter(e => e.action === 'approve').length, color: 'var(--green)' },
          { label: 'Rejected', val: events.filter(e => e.action === 'reject').length, color: 'var(--red)' },
          { label: 'Closed', val: events.filter(e => e.action === 'close').length, color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-icon">📜</div>
          <div className="card-title">ประวัติการดำเนินงานทั้งหมด</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>แสดง 50 รายการล่าสุด</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่/เวลา</th>
                <th>RFI</th>
                <th>Action</th>
                <th>ดำเนินการโดย</th>
                <th>หมายเหตุ</th>
                <th>Status ปัจจุบัน</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} onClick={() => onOpenRfi(e.rfi.id)}>
                  <td style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleDateString('th-TH')}
                    <br />
                    <span style={{ fontSize: 10 }}>{new Date(e.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                      {e.rfi.id}
                    </span>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1 }}>{e.rfi.type}</div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 4, fontSize: 10.5,
                      fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace',
                      background: `${actionColor[e.action] || 'var(--text3)'}22`,
                      border: `1px solid ${actionColor[e.action] || 'var(--text3)'}`,
                      color: actionColor[e.action] || 'var(--text3)',
                    }}>{actionLabel[e.action] || e.action}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: e.user?.color || 'var(--text3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: '#0a0d12',
                      }}>{e.user?.avatar || e.user?.name?.[0] || '?'}</div>
                      <div>
                        <div style={{ fontSize: 12 }}>{e.user?.name || e.user_id}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{e.user?.role?.toUpperCase()}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.note || '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE_CLASS[e.rfi.status]}`}>{STATUS_LABEL[e.rfi.status]}</span>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>ยังไม่มีประวัติการดำเนินงาน</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
