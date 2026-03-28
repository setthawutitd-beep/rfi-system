import type { Rfi, Profile, UserRole } from '../types/rfi'
import { STATUS_BADGE_CLASS, STATUS_LABEL, ROLE_CONFIG } from '../types/rfi'

interface Props {
  rfis: Rfi[]
  currentUser: Profile | null
  currentRole: UserRole
  onOpenRfi: (id: string) => void
}

export default function MyQueue({ rfis, currentUser, currentRole, onOpenRfi }: Props) {
  const rc = ROLE_CONFIG[currentRole]

  // Queue logic per role
  const queue = rfis.filter(r => {
    if (currentRole === 'contractor') return r.requester_id === currentUser?.id && ['open','reject','closed'].includes(r.status)
    if (currentRole === 'qc') return ['qc','resubmit','inspect'].includes(r.status)
    if (currentRole === 'consultant') return r.status === 'consult'
    if (currentRole === 'pm') return ['inspect','closed'].includes(r.status)
    return false
  })

  const pending = queue.filter(r => {
    if (currentRole === 'contractor') return r.status === 'reject'
    if (currentRole === 'qc') return ['qc','resubmit'].includes(r.status)
    if (currentRole === 'consultant') return r.status === 'consult'
    if (currentRole === 'pm') return r.status === 'inspect'
    return false
  })

  const sections: { title: string; items: Rfi[]; color: string; icon: string }[] = []

  if (currentRole === 'contractor') {
    sections.push({
      title: 'ต้องดำเนินการ (Rejected)',
      items: rfis.filter(r => r.requester_id === currentUser?.id && r.status === 'reject'),
      color: 'var(--red)', icon: '🔴',
    })
    sections.push({
      title: 'กำลังดำเนินการ',
      items: rfis.filter(r => r.requester_id === currentUser?.id && ['open','qc','consult','inspect','resubmit'].includes(r.status)),
      color: 'var(--accent2)', icon: '🔄',
    })
    sections.push({
      title: 'เสร็จสิ้น',
      items: rfis.filter(r => r.requester_id === currentUser?.id && r.status === 'closed'),
      color: 'var(--green)', icon: '✅',
    })
  } else if (currentRole === 'qc') {
    sections.push({
      title: 'รอ QC Review',
      items: rfis.filter(r => r.status === 'qc'),
      color: 'var(--yellow)', icon: '📋',
    })
    sections.push({
      title: 'รอ Review Re-submit',
      items: rfis.filter(r => r.status === 'resubmit'),
      color: 'var(--purple)', icon: '♻️',
    })
    sections.push({
      title: 'อยู่ระหว่าง Site Inspection',
      items: rfis.filter(r => r.status === 'inspect'),
      color: 'var(--green)', icon: '🔍',
    })
  } else if (currentRole === 'consultant') {
    sections.push({
      title: 'รอ Consultant Review',
      items: rfis.filter(r => r.status === 'consult'),
      color: 'var(--accent2)', icon: '🔬',
    })
  } else if (currentRole === 'pm') {
    sections.push({
      title: 'รอ PM Verify & Close',
      items: rfis.filter(r => r.status === 'inspect'),
      color: 'var(--purple)', icon: '📌',
    })
    sections.push({
      title: 'ปิดแล้ว (ล่าสุด)',
      items: rfis.filter(r => r.status === 'closed').slice(0, 5),
      color: 'var(--green)', icon: '✅',
    })
  }

  return (
    <div>
      {/* Header card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: `${rc.color}22`,
            border: `2px solid ${rc.color}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 20,
          }}>
            {currentRole === 'contractor' ? '👷' : currentRole === 'qc' ? '🔎' : currentRole === 'consultant' ? '🏛' : '📊'}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>คิวของ {currentUser?.name || 'คุณ'}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              <span style={{ color: rc.color, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{rc.label}</span>
              {' '} · มี {pending.length} รายการรอดำเนินการ
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--red)' }}>{pending.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>ต้องทำ</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text2)' }}>{queue.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>ทั้งหมด</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map(sec => (
        <div key={sec.title} className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-icon">{sec.icon}</div>
            <div className="card-title">{sec.title}</div>
            <span style={{
              marginLeft: 'auto', background: `${sec.color}22`,
              border: `1px solid ${sec.color}`, color: sec.color,
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              fontFamily: 'IBM Plex Mono, monospace',
            }}>{sec.items.length}</span>
          </div>

          {sec.items.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>ไม่มีรายการ</div>
            : sec.items.map(r => {
              const today = new Date()
              const isOverdue = r.inspect_date && new Date(r.inspect_date) < today && !['closed','reject'].includes(r.status)
              return (
                <div
                  key={r.id}
                  onClick={() => onOpenRfi(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>{r.id}</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{r.type}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{r.location}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className={`badge ${STATUS_BADGE_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: r.priority === 'high' ? 'var(--red)' : r.priority === 'medium' ? 'var(--yellow)' : 'var(--text3)',
                    }}>
                      {r.priority === 'high' ? '↑ HIGH' : r.priority === 'medium' ? '→ MED' : '↓ LOW'}
                    </span>
                    {isOverdue && (
                      <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>OVERDUE</span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); onOpenRfi(r.id) }}>เปิด</button>
                </div>
              )
            })
          }
        </div>
      ))}
    </div>
  )
}
