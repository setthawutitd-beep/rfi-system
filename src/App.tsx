import { useState, useEffect } from 'react'
import { supabase, signOut } from './lib/supabase'
import { useRFI } from './hooks/useRFI'
import { useToast, ToastContainer } from './components/Toast'
import LoginPage from './components/LoginPage'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import RFIList from './components/RFIList'
import RFIModal from './components/RFIModal'
import CreateForm from './components/CreateForm'
import MyQueue from './components/MyQueue'
import History from './components/History'
import Calendar from './components/Calendar'
import SettingsView from './components/Settings'
import NotifPanel from './components/NotifPanel'
import type { Rfi, UserRole } from './types/rfi'
import './styles/global.css'
import RoleManager from './components/RoleManager'
import FlowBuilder from './components/FlowBuilder'
import WorkTypeManager from './components/WorkTypeManager'
import RFINumberFormatManager from './components/RFINumberFormatManager'

type View = 'dash' | 'list' | 'create' | 'myqueue' | 'history' | 'calendar' | 'settings' | 'roles' | 'flows' | 'worktypes'| 'numberformat'

const VIEW_TITLE: Record<View, string> = {
  dash: 'Dashboard', list: 'รายการ RFI', create: 'สร้าง RFI ใหม่',
  myqueue: 'คิวของฉัน', history: 'ประวัติทั้งหมด',
  calendar: 'ตารางตรวจงาน', settings: 'ตั้งค่าระบบ',
  roles: 'จัดการ Role & Permission',
  flows: 'Flow Builder',
  worktypes: 'จัดการประเภทงาน',
  numberformat: 'RFI Number Format',

}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('dash')
  const [selectedRfi, setSelectedRfi] = useState<Rfi | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { toasts, addToast } = useToast()

  const {
    rfis, profiles, notifications, settings, currentUser,
    loading, doAction, postComment, markAllRead, switchRole,
  } = useRFI()

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
    })
const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
  setAuthed(!!session)
})
    return () => subscription.unsubscribe()
  }, [])

  // Update date display every minute
  const [dateStr, setDateStr] = useState('')
  useEffect(() => {
    const update = () => setDateStr(new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [])

  const openRfi = (id: string) => {
    const rfi = rfis.find(r => r.id === id)
    if (rfi) { setSelectedRfi(rfi); setModalOpen(true); setNotifOpen(false) }
  }



const handleAction = async (rfiId: string, action: string, remark: string) => {
  const result = await doAction(rfiId, action, remark)
  // Fetch RFI ใหม่จาก DB แล้วอัปเดต selectedRfi
const { data: fresh } = await supabase
  .from('rfis')
  .select(`
    *,
    flow_template_id,
    current_node_id,
    work_type_id,
    work_type_code,
    requester:requester_id(id, name, email, role, color, avatar),
    comments:rfi_comments(id, text, created_at, user:user_id(name, color))
  `)
  .eq('id', rfiId)
  .single()

  if (fresh) setSelectedRfi(fresh as Rfi)
  return result
}

  const handleComment = async (rfiId: string, text: string) => {
    await postComment(rfiId, text)
    const updated = rfis.find(r => r.id === rfiId)
    if (updated) setSelectedRfi({ ...updated })
  }

  // RFI queue badges
  const currentRole = currentUser?.role || 'contractor'
  const openBadge = rfis.filter(r => r.status === 'open').length
  const queueBadge = rfis.filter(r => {
    if (currentRole === 'qc') return ['qc','resubmit'].includes(r.status)
    if (currentRole === 'consultant') return r.status === 'consult'
    if (currentRole === 'pm') return r.status === 'inspect'
    if (currentRole === 'contractor') return r.status === 'reject' && r.requester_id === currentUser?.id
    return false
  }).length

  const unreadNotif = notifications.filter(n => n.unread).length

  // Loading / Auth
  if (authed === null) return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text2)' }}>
      กำลังโหลด...
    </div>
  )
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  if (loading) return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text2)', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 20 }}>⟳</div>
      <div>กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <>
      <Sidebar
        currentView={view}
        onNavigate={v => { setView(v); setNotifOpen(false) }}
        currentUser={currentUser}
        rfiBadges={{ open: openBadge, queue: queueBadge }}
        notifications={notifications}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{VIEW_TITLE[view]}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
              RFI Management System · v2.0
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{dateStr}</div>
            {/* Notif btn */}
            <div
              style={{
                position: 'relative', width: 32, height: 32, background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 15, transition: 'all 0.15s', userSelect: 'none',
              }}
              onClick={() => setNotifOpen(o => !o)}
            >
              🔔
              {unreadNotif > 0 && (
                <div style={{
                  position: 'absolute', top: 4, right: 4, width: 8, height: 8,
                  background: 'var(--red)', borderRadius: '50%', border: '2px solid var(--surface)',
                }} />
              )}
            </div>
            {/* Sign out */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => { await signOut(); setAuthed(false) }}
            >ออกจากระบบ</button>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {view === 'dash' && (
            <Dashboard rfis={rfis} currentRole={currentRole} onOpenRfi={openRfi} />
          )}
          {view === 'list' && (
            <RFIList rfis={rfis} onOpenRfi={openRfi} />
          )}
          {view === 'create' && (
            <CreateForm
              currentUser={currentUser}
              onSuccess={(id) => { setView('list'); openRfi(id) }}
              onToast={addToast}
            />
          )}
          {view === 'myqueue' && (
            <MyQueue rfis={rfis} currentUser={currentUser} currentRole={currentRole} onOpenRfi={openRfi} />
          )}
          {view === 'history' && (
            <History rfis={rfis} onOpenRfi={openRfi} />
          )}
          {view === 'calendar' && (
            <Calendar rfis={rfis} onOpenRfi={openRfi} />
          )}
          {view === 'settings' && (
            <SettingsView settings={settings} profiles={profiles} onToast={addToast} />
          )}
          {view === 'roles' && (
          <RoleManager onToast={addToast} />
            )}
{view === 'flows' && (
  <FlowBuilder
    roleGroups={profiles.map(p => ({
      id: p.id, name: p.role, label: p.name,
      color: p.color || '#5eaeff', description: null,
      is_system: false, created_at: p.created_at || '',
    }))}
    profiles={profiles.map(p => ({
      id: p.id, name: p.name, role: p.role, color: p.color || '#5eaeff',
    }))}
    onToast={addToast}
  />
)}
{view === 'worktypes' && (
  <WorkTypeManager onToast={addToast} />
)}

{view === 'numberformat' && (
  <RFINumberFormatManager onToast={addToast} />
)}
        </div>
      </div>

      {/* Notification Panel */}
      <NotifPanel
        open={notifOpen}
        notifications={notifications}
        onMarkAllRead={markAllRead}
        onClickNotif={(rfiId) => { if (rfiId) openRfi(rfiId); setNotifOpen(false) }}
      />

      {/* RFI Modal */}
      <RFIModal
        rfi={selectedRfi}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentUser={currentUser}
        currentRole={currentRole}
        onAction={handleAction}
        onComment={handleComment}
        onToast={addToast}
      />

      {/* Click outside notif panel */}
      {notifOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 149 }}
          onClick={() => setNotifOpen(false)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </>
  )
}
