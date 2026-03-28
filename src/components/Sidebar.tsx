import type { Profile, Notification, UserRole } from '../types/rfi'
import { ROLE_CONFIG } from '../types/rfi'

type View = 'dash' | 'list' | 'create' | 'myqueue' | 'history' | 'calendar' | 'settings'

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  currentUser: Profile | null
  onRoleChange: (r: UserRole) => void
  rfiBadges: { open: number; queue: number }
  notifications: Notification[]
}

export default function Sidebar({ currentView, onNavigate, currentUser, onRoleChange, rfiBadges }: Props) {
  const role = currentUser?.role || 'contractor'
  const rc = ROLE_CONFIG[role]

  const navItems: { id: View; icon: string; label: string; badge?: number; badgeColor?: string }[] = [
    { id: 'dash',     icon: '📊', label: 'Dashboard' },
    { id: 'list',     icon: '📋', label: 'รายการ RFI',    badge: rfiBadges.open,  badgeColor: 'var(--red)' },
    { id: 'create',   icon: '➕', label: 'สร้าง RFI ใหม่' },
    { id: 'myqueue',  icon: '📥', label: 'คิวของฉัน',      badge: rfiBadges.queue, badgeColor: 'var(--accent2)' },
    { id: 'history',  icon: '📜', label: 'ประวัติทั้งหมด' },
    { id: 'calendar', icon: '📅', label: 'ตารางตรวจงาน' },
  ]

  return (
    <div style={{
      width: 230, flexShrink: 0, background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: 'IBM Plex Mono, monospace',
          }}>R</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>RFI System</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>TTT Land Reclamation</div>
          </div>
        </div>
      </div>

      {/* Role switcher */}
      <div style={{
        margin: 12, background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 10,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>บทบาท</div>
        <div style={{ position: 'relative' }}>
          <select
            value={role}
            onChange={e => onRoleChange(e.target.value as UserRole)}
            style={{
              width: '100%', background: 'var(--surface3)', border: '1px solid var(--border2)',
              color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 12,
              fontFamily: 'IBM Plex Sans Thai, sans-serif', outline: 'none', cursor: 'pointer', appearance: 'none',
            }}
          >
            <option value="contractor">สมชาย ก่อสร้าง (CONTRACTOR)</option>
            <option value="qc">วิภา ควบคุม (QC ENG.)</option>
            <option value="consultant">นพ. ปรึกษา (CONSULTANT)</option>
            <option value="pm">ธนากร จัดการ (PM)</option>
          </select>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
          padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          fontFamily: 'IBM Plex Mono, monospace',
          background: `${rc.color}22`, border: `1px solid ${rc.color}`, color: rc.color,
        }}>● {rc.label}</div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', padding: '8px 8px 4px' }}>เมนูหลัก</div>
        {navItems.map(item => (
          <div
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s', marginBottom: 2, userSelect: 'none',
              color: currentView === item.id ? 'var(--accent)' : 'var(--text2)',
              background: currentView === item.id ? 'rgba(240,112,96,0.1)' : 'transparent',
            }}
            onMouseEnter={e => {
              if (currentView !== item.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'
                ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text)'
              }
            }}
            onMouseLeave={e => {
              if (currentView !== item.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text2)'
              }
            }}
          >
            <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>{item.icon}</span>
            <span>{item.label}</span>
            {(item.badge ?? 0) > 0 && (
              <span style={{
                marginLeft: 'auto', background: item.badgeColor, color: '#fff',
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                fontFamily: 'IBM Plex Mono, monospace', minWidth: 16, textAlign: 'center',
              }}>{item.badge}</span>
            )}
          </div>
        ))}

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', padding: '8px 8px 4px', marginTop: 8 }}>ระบบ</div>
        <div
          onClick={() => onNavigate('settings')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.15s', userSelect: 'none',
            color: currentView === 'settings' ? 'var(--accent)' : 'var(--text2)',
            background: currentView === 'settings' ? 'rgba(240,112,96,0.1)' : 'transparent',
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>⚙️</span>
          <span>ตั้งค่าระบบ</span>
        </div>
      </nav>

      {/* Current user */}
      {currentUser && (
        <div style={{
          padding: '12px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: rc.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#0a0d12', flexShrink: 0,
          }}>{currentUser.avatar || currentUser.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{rc.label}</div>
          </div>
        </div>
      )}
    </div>
  )
}
