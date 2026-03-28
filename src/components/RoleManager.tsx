import { useState, useEffect } from 'react'
import type { RoleGroup, Permission } from '../types/roles'
import { CATEGORY_LABEL } from '../types/roles'
import {
  fetchRoleGroups, fetchPermissions,
  createRoleGroup, updateRoleGroup,
  deleteRoleGroup, setRolePermissions,
} from '../lib/roles'

interface Props {
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

export default function RoleManager({ onToast }: Props) {
  const [roles, setRoles] = useState<RoleGroup[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selected, setSelected] = useState<RoleGroup | null>(null)
  const [editPerms, setEditPerms] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRole, setNewRole] = useState({ name: '', label: '', color: '#5eaeff', description: '' })

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [r, p] = await Promise.all([fetchRoleGroups(), fetchPermissions()])
    setRoles(r)
    setPermissions(p)
    setLoading(false)
  }

  const selectRole = (role: RoleGroup) => {
    setSelected(role)
    setEditPerms(role.permissions || [])
  }

  const togglePerm = (permId: string) => {
    setEditPerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    )
  }

  const savePermissions = async () => {
    if (!selected) return
    setSaving(true)
    await setRolePermissions(selected.id, editPerms)
    await load()
    onToast('บันทึกแล้ว', `Permission ของ ${selected.label} อัปเดตเรียบร้อย`, 'success')
    setSaving(false)
  }

  const handleCreate = async () => {
    if (!newRole.name || !newRole.label) return
    setSaving(true)
    const { error } = await createRoleGroup(newRole)
    if (error) {
      onToast('เกิดข้อผิดพลาด', error.message, 'error')
    } else {
      onToast('สร้างสำเร็จ', `Role "${newRole.label}" ถูกสร้างแล้ว`, 'success')
      setShowCreate(false)
      setNewRole({ name: '', label: '', color: '#5eaeff', description: '' })
      await load()
    }
    setSaving(false)
  }

  const handleDelete = async (role: RoleGroup) => {
    if (role.is_system) {
      onToast('ไม่สามารถลบได้', 'Role ระบบไม่สามารถลบได้', 'error')
      return
    }
    if (!confirm(`ยืนยันลบ Role "${role.label}"?`)) return
    await deleteRoleGroup(role.id)
    if (selected?.id === role.id) setSelected(null)
    await load()
    onToast('ลบแล้ว', `Role "${role.label}" ถูกลบแล้ว`, 'success')
  }

  const permsByCategory = permissions.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, Permission[]>)

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
      กำลังโหลด...
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>

      {/* Left — Role List */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-icon">👥</div>
            <div className="card-title">Role Groups</div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowCreate(true)}
            >+ สร้าง</button>
          </div>

          {roles.map(role => (
            <div
              key={role.id}
              onClick={() => selectRole(role)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                marginBottom: 4, transition: 'all 0.15s',
                background: selected?.id === role.id ? `${role.color}15` : 'transparent',
                border: `1px solid ${selected?.id === role.id ? role.color : 'transparent'}`,
              }}
            >
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: role.color, flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{role.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {role.permissions?.length || 0} permissions
                  {role.is_system && ' · system'}
                </div>
              </div>
              {!role.is_system && (
                <button
                  className="btn btn-danger btn-xs"
                  onClick={e => { e.stopPropagation(); handleDelete(role) }}
                >ลบ</button>
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
              <button
                className="btn btn-ghost btn-xs"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowCreate(false)}
              >✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>ชื่อระบบ (ภาษาอังกฤษ ไม่มีช่องว่าง)</label>
                <input
                  className="input"
                  placeholder="เช่น site_engineer"
                  value={newRole.name}
                  onChange={e => setNewRole(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                />
              </div>
              <div>
                <label style={labelStyle}>ชื่อที่แสดง</label>
                <input
                  className="input"
                  placeholder="เช่น Site Engineer"
                  value={newRole.label}
                  onChange={e => setNewRole(p => ({ ...p, label: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>คำอธิบาย</label>
                <input
                  className="input"
                  placeholder="หน้าที่และความรับผิดชอบ"
                  value={newRole.description}
                  onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>สี</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={newRole.color}
                    onChange={e => setNewRole(p => ({ ...p, color: e.target.value }))}
                    style={{ width: 40, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  />
                  {['#fb923c','#f5c542','#5eaeff','#a78bfa','#3ecf8e','#f07060','#2dd4bf'].map(c => (
                    <div
                      key={c}
                      onClick={() => setNewRole(p => ({ ...p, color: c }))}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: c,
                        cursor: 'pointer', border: newRole.color === c ? '3px solid white' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                className="btn btn-success"
                onClick={handleCreate}
                disabled={saving || !newRole.name || !newRole.label}
                style={{ justifyContent: 'center' }}
              >✓ สร้าง Role</button>
            </div>
          </div>
        )}
      </div>

      {/* Right — Permission Editor */}
      <div>
        {!selected ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👈</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>เลือก Role ทางซ้ายเพื่อแก้ไข Permission</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: selected.color, flexShrink: 0,
              }} />
              <div className="card-title">{selected.label}</div>
              {selected.description && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
                  — {selected.description}
                </div>
              )}
              <button
                className="btn btn-primary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={savePermissions}
                disabled={saving}
              >{saving ? '⟳ บันทึก...' : '💾 บันทึก'}</button>
            </div>

            {/* Permission groups */}
            {(Object.entries(permsByCategory) as [string, Permission[]][]).map(([cat, perms]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                  letterSpacing: '1px', textTransform: 'uppercase',
                  marginBottom: 8, paddingBottom: 6,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {CATEGORY_LABEL[cat] || cat}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {perms.map(perm => (
                    <div
                      key={perm.id}
                      onClick={() => togglePerm(perm.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                        transition: 'all 0.15s',
                        background: editPerms.includes(perm.id)
                          ? `${selected.color}15` : 'var(--surface2)',
                        border: `1px solid ${editPerms.includes(perm.id) ? selected.color : 'var(--border)'}`,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `2px solid ${editPerms.includes(perm.id) ? selected.color : 'var(--border2)'}`,
                        background: editPerms.includes(perm.id) ? selected.color : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontSize: 10, color: '#0a0d12',
                      }}>
                        {editPerms.includes(perm.id) ? '✓' : ''}
                      </div>
                      <span style={{ fontSize: 12.5 }}>{perm.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'var(--text3)', marginBottom: 6,
}