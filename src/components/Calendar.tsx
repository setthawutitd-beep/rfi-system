import { useState } from 'react'
import type { Rfi } from '../types/rfi'
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../types/rfi'

interface Props {
  rfis: Rfi[]
  onOpenRfi: (id: string) => void
}

const DISC_COLORS: Record<string, string> = {
  CIV: 'var(--accent2)', STR: 'var(--accent)', ARC: 'var(--green)',
  MEP: 'var(--purple)', GEO: 'var(--yellow)',
}

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']

export default function Calendar({ rfis, onOpenRfi }: Props) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  // Build day → RFIs map
  const dayMap: Record<number, Rfi[]> = {}
  rfis.forEach(r => {
    if (!r.inspect_date) return
    const d = new Date(r.inspect_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!dayMap[day]) dayMap[day] = []
      dayMap[day].push(r)
    }
  })

  // Upcoming RFIs this month
  const upcoming = rfis
    .filter(r => {
      if (!r.inspect_date) return false
      const d = new Date(r.inspect_date)
      return d >= today && d.getFullYear() === year && d.getMonth() === month
    })
    .sort((a, b) => new Date(a.inspect_date!).getTime() - new Date(b.inspect_date!).getTime())
    .slice(0, 10)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14 }}>
      {/* Calendar Grid */}
      <div className="card">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>←</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
            {MONTHS_TH[month]} {year + 543}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}>→</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}>วันนี้</button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {DAYS_TH.map((d, i) => (
            <div key={d} style={{
              textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--red)' : 'var(--text3)',
              padding: '4px 0',
            }}>{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const dayRfis = dayMap[day] || []
            const hasOverdue = dayRfis.some(r => !['closed','reject'].includes(r.status) && new Date(r.inspect_date!) < today)
            return (
              <div
                key={day}
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                style={{
                  minHeight: 70, borderRadius: 7, padding: 6, cursor: dayRfis.length > 0 ? 'pointer' : 'default',
                  background: isToday ? 'rgba(240,112,96,0.1)' : hoveredDay === day ? 'var(--surface2)' : 'transparent',
                  border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'all 0.1s',
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent)' : hasOverdue ? 'var(--red)' : 'var(--text2)',
                  marginBottom: 3,
                }}>{day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayRfis.slice(0, 3).map(r => (
                    <div
                      key={r.id}
                      onClick={() => onOpenRfi(r.id)}
                      style={{
                        background: `${DISC_COLORS[r.discipline]}22`,
                        border: `1px solid ${DISC_COLORS[r.discipline]}`,
                        borderRadius: 3, padding: '1px 4px', fontSize: 9,
                        fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700,
                        color: DISC_COLORS[r.discipline], overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      title={r.id}
                    >{r.id.split('-').slice(-2).join('-')}</div>
                  ))}
                  {dayRfis.length > 3 && (
                    <div style={{ fontSize: 9, color: 'var(--text3)' }}>+{dayRfis.length - 3} อื่น</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {Object.entries(DISC_COLORS).map(([disc, color]) => (
            <div key={disc} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={{ color: 'var(--text3)' }}>{disc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming panel */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-icon">📅</div>
            <div className="card-title">นัดตรวจที่กำลังจะมาถึง</div>
          </div>
          {upcoming.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>ไม่มีนัดตรวจเดือนนี้</div>
            : upcoming.map(r => {
              const d = new Date(r.inspect_date!)
              const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86400000)
              return (
                <div
                  key={r.id}
                  onClick={() => onOpenRfi(r.id)}
                  style={{
                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: DISC_COLORS[r.discipline] || 'var(--text3)', fontWeight: 700 }}>{r.id}</div>
                      <div style={{ fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1 }}>{r.location}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: daysLeft <= 1 ? 'var(--red)' : daysLeft <= 3 ? 'var(--yellow)' : 'var(--green)' }}>
                        {daysLeft === 0 ? 'วันนี้!' : daysLeft === 1 ? 'พรุ่งนี้' : `${daysLeft} วัน`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                        {d.getDate()} {MONTHS_TH[d.getMonth()]}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${STATUS_BADGE_CLASS[r.status]}`} style={{ fontSize: 9.5 }}>{STATUS_LABEL[r.status]}</span>
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* Stats */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">📊</div>
            <div className="card-title">สรุปเดือนนี้</div>
          </div>
          {[
            { label: 'นัดตรวจทั้งหมด', val: Object.values(dayMap).flat().length, color: 'var(--text)' },
            { label: 'กำลังจะมาถึง', val: upcoming.length, color: 'var(--accent2)' },
            { label: 'เสร็จแล้ว', val: Object.values(dayMap).flat().filter(r => r.status === 'closed').length, color: 'var(--green)' },
            { label: 'Overdue', val: Object.values(dayMap).flat().filter(r => !['closed','reject'].includes(r.status) && new Date(r.inspect_date!) < today).length, color: 'var(--red)' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
