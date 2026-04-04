import { useState, useEffect } from 'react'
import type { RoleGroup, Permission } from '../types/roles'
import { CATEGORY_LABEL } from '../types/roles'
import {
  fetchRoleGroups, fetchPermissions,
  createRoleGroup, deleteRoleGroup, setRolePermissions,
} from '../lib/roles'
import { supabase } from '../lib/supabase'

interface Props {
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

type UserRole = 'contractor' | 'qc' | 'consultant' | 'pm' | 'admin' | 'inspector' | 'survey' | 'lab' | string

export default function RoleManager({ onToast }: Props) {
  const [roles, setRoles] = useState<RoleGroup[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selected, setSelected] = useState<RoleGroup | null>(null)
  const [editPerms, setEditPerms] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'permissions' | 'members'>('permissions')
  const [allProfiles, setAllProfiles] = useState<{id: string; name: string; email: string; role: string; avatar: string; color: string}[]>([])
  const [newRole, setNewRole] = useState({ name: '', label: '', color: '#5eaeff', description: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [r, p, { data: prof }] = await Promise.all([
      fetchRoleGroups(),
      fetchPermissions(),
      supabase.from('profiles').select('id, name, email, role, avatar, color'),
    ])
    setRoles(r)
    setPermissions(p)
    setAllProfiles(prof || [])
    setLoading(false)
  }

  const selectRole = (role: RoleGroup) => {
    setSelected(role)
    setEditPerms(role.permissions || [])
    setActiveTab('permissions')
  }

  const togglePerm = (permId: string) =>
    setEditPerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId])

  const savePermissions = async () => {
    if (!selected) return
    setSaving(true)
    await setRolePermissions(selected.id, editPerms)
    await load()
    onToast('บันทึกแล้ว', `Permission ของ ${selected.label} อัปเดตแล้ว`, 'success')
    setSaving(false)
  }

  const handleCreate = async () => {
    if (!newRole.name || !newRole.label) return
    setSaving(true)
    const { error } = await createRoleGroup(newRole)
    if (error) onToast('เกิดข้อผิดพลาด', error.message, 'error')
    else {
      onToast('สร้างสำเร็จ', `Role "${newRole.label}" ถูกสร้างแล้ว`, 'success')
      setShowCreate(false)
      setNewRole({ name: '', label: '', color: '#5eaeff', description: '' })
      await load()
    }
    setSaving(false)
  }

  const handleDelete = async (role: RoleGroup) => {
    if (role.is_system) { onToast('ไม่สามารถลบได้', 'Role ระบบไม่สามารถลบได้', 'error'); return }
    if (!confirm(`ยืนยันลบ Role "${role.label}"?`)) return
    await deleteRoleGroup(role.id)
    if (selected?.id === role.id) setSelected(null)
    await load()
    onToast('ลบแล้ว', `Role "${role.label}" ถูกลบแล้ว`, 'success')
  }

  const handleAddMember = async (profileId: string, roleName: string) => {
    await supabase.from('profiles').update({ role: roleName as UserRole }).eq('id', profileId)
    await load()
    const p = allProfiles.find(x => x.id === profileId)
    onToast('เพิ่มแล้ว', `${p?.name} → ${selected?.label}`, 'success')
  }

  const handleRemoveMember = async (profileId: string, profileName: string) => {
    if (!confirm(`ย้าย ${profileName} ออกจาก ${selected?.label}?`)) return
    await supabase.from('profiles').update({ role: 'contractor' as UserRole }).eq('id', profileId)
    await load()
    onToast('ย้ายออกแล้ว', profileName, 'info')
  }

  const permsByCategory = permissions.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, Permission[]>)

  const members = allProfiles.filter(p => p.role === selected?.name)
  const nonMembers = allProfiles.filter(p => p.role !== selected?.name)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>กำลังโหลด...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>

      {/* Left */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-icon">👥</div>
            <div className="card-title">Role Groups</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => setShowCreate(true)}>+ สร้าง</button>
          </div>

          {roles.map(role => (
            <div key={role.id} onClick={() => selectRole(role)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selected?.id === role.id ? `${role.color}15` : 'transparent',
              border: `1px solid ${selected?.id === role.id ? role.color : 'transparent'}`,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{role.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {allProfiles.filter(p => p.role === role.name).length} สมาชิก
                  {' · '}{role.permissions?.length || 0} perms
                  {role.is_system && ' · system'}
                </div>
              </div>
              {!role.is_system && (
                <button className="btn btn-danger btn-xs"
                  onClick={e => { e.stopPropagation(); handleDelete(role) }}>ลบ</button>
              )}
            </div>
          ))}
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon">➕</div>
              <div className="card-title">สร้าง Role ใหม่</div>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }}
                onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={ls}>ชื่อระบบ (ภาษาอังกฤษ)</label>
                <input className="input" placeholder="เช่น survey" value={newRole.name}
                  onChange={e => setNewRole(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s/g, '_') }))} />
              </div>
              <div>
                <label style={ls}>ชื่อที่แสดง</label>
                <input className="input" placeholder="เช่น Survey Team" value={newRole.label}
                  onChange={e => setNewRole(p => ({ ...p, label: e.target.value }))} />
              </div>
              <div>
                <label style={ls}>คำอธิบาย</label>
                <input className="input" placeholder="หน้าที่และความรับผิดชอบ" value={newRole.description}
                  onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label style={ls}>สี</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={newRole.color}
                    onChange={e => setNewRole(p => ({ ...p, color: e.target.value }))}
                    style={{ width: 40, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                  {['#fb923c','#f5c542','#5eaeff','#a78bfa','#3ecf8e','#2dd4bf','#f07060'].map(c => (
                    <div key={c} onClick={() => setNewRole(p => ({ ...p, color: c }))} style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: newRole.color === c ? '3px solid white' : '2px solid transparent',
                    }} />
                  ))}
                </div>
              </div>
              <button className="btn btn-success" onClick={handleCreate}
                disabled={saving || !newRole.name || !newRole.label}
                style={{ justifyContent: 'center' }}>✓ สร้าง Role</button>
            </div>
          </div>
        )}
      </div>

      {/* Right */}
      <div>
        {!selected ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👈</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>เลือก Role ทางซ้ายเพื่อแก้ไข</div>
          </div>
        ) : (
          <div className="card">
            {/* Header */}
            <div className="card-header">
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />
              <div className="card-title">{selected.label}</div>
              {selected.description && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>— {selected.description}</div>
              )}
              {activeTab === 'permissions' && (
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={savePermissions} disabled={saving}>
                  {saving ? '⟳ บันทึก...' : '💾 บันทึก'}
                </button>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {(['permissions', 'members'] as const).map(t => (
                <div key={t} onClick={() => setActiveTab(t)} style={{
                  flex: 1, padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  borderBottom: `2px solid ${activeTab === t ? 'var(--accent)' : 'transparent'}`,
                  color: activeTab === t ? 'var(--accent)' : 'var(--text3)',
                }}>
                  {t === 'permissions' ? `🔐 Permissions (${editPerms.length})` : `👥 สมาชิก (${members.length})`}
                </div>
              ))}
            </div>

            {/* Permissions Tab */}
            {activeTab === 'permissions' && (
              (Object.entries(permsByCategory) as [string, Permission[]][]).map(([cat, perms]) => (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                    letterSpacing: '1px', textTransform: 'uppercase',
                    marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)',
                  }}>{CATEGORY_LABEL[cat] || cat}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {perms.map(perm => (
                      <div key={perm.id} onClick={() => togglePerm(perm.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                        background: editPerms.includes(perm.id) ? `${selected.color}15` : 'var(--surface2)',
                        border: `1px solid ${editPerms.includes(perm.id) ? selected.color : 'var(--border)'}`,
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${editPerms.includes(perm.id) ? selected.color : 'var(--border2)'}`,
                          background: editPerms.includes(perm.id) ? selected.color : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#0a0d12',
                        }}>{editPerms.includes(perm.id) ? '✓' : ''}</div>
                        <span style={{ fontSize: 12.5 }}>{perm.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div>
                {/* สมาชิกปัจจุบัน */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                    สมาชิกปัจจุบัน ({members.length} คน)
                  </div>
                  {members.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
                      ยังไม่มีสมาชิก
                    </div>
                  ) : (
                    members.map(p => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', background: `${selected.color}08`,
                        border: `1px solid ${selected.color}33`,
                        borderRadius: 8, marginBottom: 6,
                      }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: selected.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#0a0d12', flexShrink: 0,
                        }}>{p.avatar || p.name[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{p.email}</div>
                        </div>
                        <button className="btn btn-danger btn-xs"
                          onClick={() => handleRemoveMember(p.id, p.name)}>
                          ย้ายออก
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* เพิ่มสมาชิก */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                    เพิ่มสมาชิก ({nonMembers.length} คนที่มีอยู่)
                  </div>
                  {nonMembers.map(p => {
                    const currentRole = roles.find(r => r.name === p.role)
                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8, marginBottom: 6,
                      }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: p.color || 'var(--surface3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#0a0d12', flexShrink: 0,
                        }}>{p.avatar || p.name[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                            {p.email}
                            {currentRole && (
                              <span style={{ marginLeft: 6, padding: '0 4px', borderRadius: 3, background: `${currentRole.color}22`, color: currentRole.color, fontSize: 9, border: `1px solid ${currentRole.color}` }}>
                                {currentRole.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="btn btn-primary btn-xs"
                          onClick={() => handleAddMember(p.id, selected.name)}>
                          + เพิ่ม
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const ls: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'var(--text3)', marginBottom: 6,
}
