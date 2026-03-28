import { useState } from 'react'
import type { Settings, Profile } from '../types/rfi'
import { updateSettings } from '../lib/supabase'

interface Props {
  settings: Settings | null
  profiles: Profile[]
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

type SettingsTab = 'general' | 'workflow' | 'discipline' | 'users'

export default function SettingsView({ settings, profiles, onToast }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState(settings)

  if (!localSettings) return <div style={{ padding: 20, color: 'var(--text3)' }}>Loading settings...</div>

  const handleSave = async () => {
    setSaving(true)
    const { error } = await updateSettings(localSettings.id, {
      project_name: localSettings.project_name,
      project_code: localSettings.project_code,
      workflow_data: localSettings.workflow_data,
      lead_times: localSettings.lead_times,
      disciplines: localSettings.disciplines,
    })
    setSaving(false)
    if (error) onToast('บันทึกล้มเหลว', error.message, 'error')
    else onToast('บันทึกแล้ว', 'การตั้งค่าอัปเดตเรียบร้อย', 'success')
  }

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'ทั่วไป', icon: '🏗' },
    { id: 'workflow', label: 'Workflow', icon: '⚙️' },
    { id: 'discipline', label: 'Discipline', icon: '🗂' },
    { id: 'users', label: 'ผู้ใช้งาน', icon: '👥' },
  ]

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '7px 11px', borderRadius: 7, fontSize: 12.5,
    fontFamily: 'IBM Plex Sans Thai, sans-serif', outline: 'none',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0', borderBottom: '1px solid var(--border)',
  }

  const roleColors: Record<string, string> = {
    contractor: 'var(--orange)', qc: 'var(--yellow)', consultant: 'var(--accent2)', pm: 'var(--purple)', admin: 'var(--accent)',
  }
  const roleLabels: Record<string, string> = {
    contractor: 'CONTRACTOR', qc: 'QC ENG.', consultant: 'CONSULTANT', pm: 'PM', admin: 'ADMIN',
  }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
        {tabs.map(t => (
          <div
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
              background: activeTab === t.id ? 'var(--surface2)' : 'transparent',
              color: activeTab === t.id ? 'var(--text)' : 'var(--text3)',
              transition: 'all 0.15s',
            }}
          >{t.icon} {t.label}</div>
        ))}
      </div>

      {/* General */}
      {activeTab === 'general' && (
        <div className="card">
          <div className="card-header"><div className="card-icon">🏗</div><div className="card-title">ข้อมูลโครงการ</div></div>
          <div style={rowStyle}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>ชื่อโครงการ</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>แสดงในส่วนหัวของระบบ</div>
            </div>
            <input style={{ ...inputStyle, width: 260 }} value={localSettings.project_name}
              onChange={e => setLocalSettings(s => s ? { ...s, project_name: e.target.value } : s)} />
          </div>
          <div style={rowStyle}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>รหัสโครงการ</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>ใช้ใน prefix RFI ID</div>
            </div>
            <input style={{ ...inputStyle, width: 160, fontFamily: 'IBM Plex Mono, monospace' }} value={localSettings.project_code}
              onChange={e => setLocalSettings(s => s ? { ...s, project_code: e.target.value } : s)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⟳ บันทึก...' : '💾 บันทึก'}</button>
          </div>
        </div>
      )}

      {/* Workflow */}
      {activeTab === 'workflow' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header"><div className="card-icon">⚙️</div><div className="card-title">กฎ Workflow</div></div>
            {[
              {
                label: 'Lead Time ขั้นต่ำ', desc: 'จำนวนวันที่ต้องแจ้งล่วงหน้า',
                input: <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" min={1} max={14} value={localSettings.workflow_data.leadTimeDays}
                    onChange={e => setLocalSettings(s => s ? { ...s, workflow_data: { ...s.workflow_data, leadTimeDays: +e.target.value } } : s)}
                    style={{ ...inputStyle, width: 60, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace' }} />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>วัน</span>
                </div>,
              },
              {
                label: 'Cut-off Time', desc: 'เวลาปิดรับ RFI สำหรับวันถัดไป',
                input: <input type="time" value={localSettings.workflow_data.cutoffTime}
                  onChange={e => setLocalSettings(s => s ? { ...s, workflow_data: { ...s.workflow_data, cutoffTime: e.target.value } } : s)}
                  style={{ ...inputStyle, width: 100, fontFamily: 'IBM Plex Mono, monospace' }} />,
              },
              {
                label: 'Re-submit ครั้งสูงสุด', desc: 'จำนวนครั้งที่อนุญาตให้ Re-submit',
                input: <input type="number" min={1} max={10} value={localSettings.workflow_data.maxResubmit}
                  onChange={e => setLocalSettings(s => s ? { ...s, workflow_data: { ...s.workflow_data, maxResubmit: +e.target.value } } : s)}
                  style={{ ...inputStyle, width: 60, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace' }} />,
              },
            ].map(item => (
              <div key={item.label} style={rowStyle}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</div>
                </div>
                {item.input}
              </div>
            ))}
            {[
              { label: 'บังคับแนบเหตุผลเมื่อตีกลับ', key: 'requireReason' as const },
              { label: 'บังคับแนบไฟล์เพื่อ Submit', key: 'requireAttachment' as const },
            ].map(item => (
              <div key={item.label} style={rowStyle}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                <label className="toggle-wrap">
                  <input type="checkbox" className="toggle-input" checked={localSettings.workflow_data[item.key] as boolean}
                    onChange={e => setLocalSettings(s => s ? { ...s, workflow_data: { ...s.workflow_data, [item.key]: e.target.checked } } : s)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>

          {/* Lead Times table */}
          <div className="card">
            <div className="card-header"><div className="card-icon">⏱</div><div className="card-title">Lead Time ตาม Work Type</div></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Disc.</th><th>Work Type</th><th>Lead Days</th><th>Cut-off</th><th>Duration (นาที)</th>
                  </tr>
                </thead>
                <tbody>
                  {localSettings.lead_times.map((lt, i) => (
                    <tr key={i}>
                      <td><span className="code-tag">{lt.disc}</span></td>
                      <td style={{ fontSize: 12.5 }}>{lt.type}</td>
                      <td>
                        <input type="number" min={1} max={14} value={lt.leadDays}
                          onChange={e => setLocalSettings(s => {
                            if (!s) return s
                            const lt2 = [...s.lead_times]; lt2[i] = { ...lt2[i], leadDays: +e.target.value }
                            return { ...s, lead_times: lt2 }
                          })}
                          style={{ ...inputStyle, width: 60, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace' }} />
                      </td>
                      <td>
                        <input type="time" value={lt.cutoff}
                          onChange={e => setLocalSettings(s => {
                            if (!s) return s
                            const lt2 = [...s.lead_times]; lt2[i] = { ...lt2[i], cutoff: e.target.value }
                            return { ...s, lead_times: lt2 }
                          })}
                          style={{ ...inputStyle, width: 90, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, padding: '4px 8px' }} />
                      </td>
                      <td>
                        <input type="number" min={15} max={480} value={lt.duration}
                          onChange={e => setLocalSettings(s => {
                            if (!s) return s
                            const lt2 = [...s.lead_times]; lt2[i] = { ...lt2[i], duration: +e.target.value }
                            return { ...s, lead_times: lt2 }
                          })}
                          style={{ ...inputStyle, width: 70, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⟳ บันทึก...' : '💾 บันทึก'}</button>
          </div>
        </>
      )}

      {/* Discipline */}
      {activeTab === 'discipline' && (
        <div className="card">
          <div className="card-header"><div className="card-icon">🗂</div><div className="card-title">Discipline & Workflow</div></div>
          {Object.entries(localSettings.disciplines).map(([disc, cfg]) => (
            <div key={disc} style={{ marginBottom: 12, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  color: cfg.color, background: `${cfg.color}22`,
                  border: `1px solid ${cfg.color}`, borderRadius: 4, padding: '2px 8px',
                  fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700,
                }}>{disc}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{cfg.steps.length} ขั้นตอน</div>
                <label className="toggle-wrap">
                  <input type="checkbox" className="toggle-input" checked={cfg.active}
                    onChange={e => setLocalSettings(s => {
                      if (!s) return s
                      return { ...s, disciplines: { ...s.disciplines, [disc]: { ...cfg, active: e.target.checked } } }
                    })} />
                  <span className="toggle-slider" />
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {cfg.steps.map((step, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      background: i === 0 || i === cfg.steps.length - 1 ? `${cfg.color}22` : 'var(--surface3)',
                      border: `1px solid ${i === 0 || i === cfg.steps.length - 1 ? cfg.color : 'var(--border)'}`,
                      color: i === 0 || i === cfg.steps.length - 1 ? cfg.color : 'var(--text2)',
                      borderRadius: 4, padding: '2px 8px', fontSize: 11,
                    }}>{i === 0 ? '📥 ' : i === cfg.steps.length - 1 ? '✓ ' : ''}{step}</span>
                    {i < cfg.steps.length - 1 && <span style={{ color: 'var(--text3)', fontSize: 12 }}>›</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⟳ บันทึก...' : '💾 บันทึก'}</button>
          </div>
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-header">
            <div className="card-icon">👥</div>
            <div className="card-title">ผู้ใช้งาน ({profiles.length})</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onToast('เพิ่มผู้ใช้', 'เพิ่มผู้ใช้ใหม่ได้ใน Supabase Dashboard', 'info')}>+ เพิ่มผู้ใช้</button>
          </div>
          {profiles.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: u.color || 'var(--text3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#0a0d12', flexShrink: 0,
              }}>{u.avatar || u.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name} {!u.active && <span style={{ fontSize: 10, color: 'var(--text3)' }}>(Inactive)</span>}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{u.email}</div>
              </div>
              <div style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                fontFamily: 'IBM Plex Mono, monospace',
                border: `1px solid ${roleColors[u.role] || 'var(--text3)'}`,
                color: roleColors[u.role] || 'var(--text3)',
                background: `${roleColors[u.role] || 'var(--text3)'}22`,
              }}>{roleLabels[u.role] || u.role}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
