import type { Notification } from '../types/rfi'

interface Props {
  open: boolean
  notifications: Notification[]
  onMarkAllRead: () => void
  onClickNotif: (rfiId: string | null) => void
}

export default function NotifPanel({ open, notifications, onMarkAllRead, onClickNotif }: Props) {
  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <div style={{
      position: 'fixed', top: 50, right: 16, width: 340,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, zIndex: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: open ? 'block' : 'none', animation: 'fadeUp 0.15s ease',
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>🔔</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>การแจ้งเตือน</span>
        {unreadCount > 0 && (
          <span style={{
            background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace',
          }}>{unreadCount}</span>
        )}
        <span
          style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}
          onClick={onMarkAllRead}
        >อ่านทั้งหมด</span>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {notifications.length === 0
          ? <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>ไม่มีการแจ้งเตือน</div>
          : notifications.map(n => (
            <div
              key={n.id}
              onClick={() => onClickNotif(n.rfi_id)}
              style={{
                padding: '10px 14px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background 0.1s',
                display: 'flex', gap: 10,
                background: n.unread ? 'rgba(240,112,96,0.05)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = n.unread ? 'rgba(240,112,96,0.05)' : 'transparent'}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(94,174,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, flexShrink: 0,
              }}>{n.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>
                  {new Date(n.created_at).toLocaleDateString('th-TH')}
                </div>
              </div>
              {n.unread && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} />
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}
