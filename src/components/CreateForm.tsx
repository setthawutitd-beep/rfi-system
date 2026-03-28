import { useState } from 'react'
import type { Profile, RfiDiscipline, RfiPriority } from '../types/rfi'
import { WORK_TYPES } from '../types/rfi'
import { supabase, addHistory, addNotification, fetchProfiles } from '../lib/supabase'

interface Props {
  currentUser: Profile | null
  onSuccess: (rfiId: string) => void
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

interface FormData {
  type: string
  discipline: RfiDiscipline | ''
  location: string
  zone: string
  description: string
  priority: RfiPriority
  team: string[]
  inspectDate: string
  inspectTime: string
}

const TEAM_OPTIONS = ['QC', 'Inspector', 'Survey', 'Lab', 'Geotech', 'MEP Specialist', 'Structural Engineer']
const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F']

export default function CreateForm({ currentUser, onSuccess, onToast }: Props) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormData>({
    type: '', discipline: '', location: '', zone: '',
    description: '', priority: 'medium', team: [], inspectDate: '', inspectTime: '08:00',
  })

  const update = (k: keyof FormData, v: FormData[keyof FormData]) => setForm(prev => ({ ...prev, [k]: v }))

  const toggleTeam = (t: string) => {
    setForm(prev => ({
      ...prev,
      team: prev.team.includes(t) ? prev.team.filter(x => x !== t) : [...prev.team, t],
    }))
  }

  const handleTypeSelect = (type: string) => {
    const wt = WORK_TYPES[type]
    update('type', type)
    if (wt) update('discipline', wt.disc)
  }

  const canNext = () => {
    if (step === 1) return !!form.type && !!form.discipline
    if (step === 2) return !!form.location && !!form.description
    if (step === 3) return !!form.inspectDate
    return true
  }

  const handleSubmit = async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      // Generate RFI ID
      const { data: seqData } = await supabase.rpc('generate_rfi_id', { disc: form.discipline })
      const rfiId = seqData as string

      const { data: rfi, error } = await supabase.from('rfis').insert({
        id: rfiId,
        type: form.type,
        discipline: form.discipline,
        location: form.location,
        zone: form.zone,
        description: form.description,
        priority: form.priority,
        team: form.team,
        inspect_date: form.inspectDate || null,
        status: 'open',
        requester_id: currentUser.id,
      }).select().single()

      if (error) throw error

      // Add submit history
      await addHistory({
        rfi_id: rfi.id,
        action: 'submit',
        user_id: currentUser.id,
        note: 'ส่งคำขอ RFI',
      })

      // Notify QC engineers
      const { data: profiles } = await fetchProfiles()
      const qcUsers = (profiles || []).filter((p: { role: string }) => p.role === 'qc')
      for (const qc of qcUsers) {
        await addNotification({
          user_id: qc.id,
          rfi_id: rfi.id,
          message: `${rfi.id} — RFI ใหม่รอ QC Review`,
          icon: '📋',
        })
      }

      onToast('สร้าง RFI สำเร็จ', `${rfi.id} — รอ QC Review`, 'success')
      onSuccess(rfi.id)

      // Reset form
      setForm({ type: '', discipline: '', location: '', zone: '', description: '', priority: 'medium', team: [], inspectDate: '', inspectTime: '08:00' })
      setStep(1)
    } catch (e) {
      onToast('เกิดข้อผิดพลาด', (e as Error).message, 'error')
    }
    setLoading(false)
  }

  const steps = ['ประเภทงาน', 'รายละเอียด', 'วันเวลา', 'ยืนยัน']

  return (
    <div>
      {/* Step Bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {steps.map((label, i) => (
          <div
            key={i}
            style={{
              flex: 1, padding: '12px 16px', textAlign: 'center', fontSize: 12,
              fontWeight: i + 1 === step ? 700 : 500,
              color: i + 1 < step ? 'var(--green)' : i + 1 === step ? 'var(--text)' : 'var(--text3)',
              background: i + 1 === step ? 'var(--surface2)' : 'transparent',
              borderRight: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: i + 1 < step ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
            onClick={() => i + 1 < step && setStep(i + 1)}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>
              {i + 1 < step ? '✓ ' : `STEP ${i + 1}`}
            </div>
            {label}
          </div>
        ))}
      </div>

      <div className="card">
        {/* STEP 1: Work Type */}
        {step === 1 && (
          <div>
            <div className="card-header">
              <div className="card-icon">🏗</div>
              <div className="card-title">เลือกประเภทงาน</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {Object.entries(WORK_TYPES).map(([type, cfg]) => (
                <div
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  style={{
                    background: form.type === type ? 'rgba(240,112,96,0.1)' : 'var(--surface2)',
                    border: `1px solid ${form.type === type ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{type}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="code-tag">{cfg.disc}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{cfg.duration} นาที</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select className="input" value={form.priority} onChange={e => update('priority', e.target.value as RfiPriority)}>
                  <option value="high">🔴 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Discipline (Auto)</label>
                <input className="input" value={form.discipline} readOnly style={{ color: 'var(--text3)', cursor: 'not-allowed' }} placeholder="เลือกประเภทงานก่อน" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Details */}
        {step === 2 && (
          <div>
            <div className="card-header">
              <div className="card-icon">📝</div>
              <div className="card-title">รายละเอียดงาน</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Location *</label>
                  <input className="input" placeholder="เช่น Building A, Floor 2" value={form.location} onChange={e => update('location', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Zone</label>
                  <select className="input" value={form.zone} onChange={e => update('zone', e.target.value)}>
                    <option value="">— เลือก Zone —</option>
                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description *</label>
                <textarea className="input" rows={4} placeholder="อธิบายงานที่ต้องการตรวจสอบ รวมถึงแบบ/Spec อ้างอิง..." value={form.description} onChange={e => update('description', e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Team ที่ต้องการ</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {TEAM_OPTIONS.map(t => (
                    <div
                      key={t}
                      onClick={() => toggleTeam(t)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        background: form.team.includes(t) ? 'rgba(62,207,142,0.1)' : 'var(--surface2)',
                        border: `1px solid ${form.team.includes(t) ? 'var(--green)' : 'var(--border)'}`,
                        color: form.team.includes(t) ? 'var(--green)' : 'var(--text2)',
                        transition: 'all 0.15s',
                      }}
                    >{t}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Date & Time */}
        {step === 3 && (
          <div>
            <div className="card-header">
              <div className="card-icon">📅</div>
              <div className="card-title">วันเวลาตรวจงาน</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>วันที่ตรวจ *</label>
                <input
                  className="input" type="date"
                  min={new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]}
                  value={form.inspectDate}
                  onChange={e => update('inspectDate', e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>เวลา</label>
                <input className="input" type="time" value={form.inspectTime} onChange={e => update('inspectTime', e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 12, background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent2)' }}>
              ℹ️ กรุณาแจ้งล่วงหน้าอย่างน้อย 3 วันก่อนวันตรวจ เพื่อให้ QC จัดเตรียมทีม
            </div>
          </div>
        )}

        {/* STEP 4: Confirm */}
        {step === 4 && (
          <div>
            <div className="card-header">
              <div className="card-icon">✅</div>
              <div className="card-title">ยืนยันการสร้าง RFI</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { k: 'Work Type', v: form.type },
                { k: 'Discipline', v: form.discipline },
                { k: 'Location', v: form.location },
                { k: 'Zone', v: form.zone || '—' },
                { k: 'Priority', v: form.priority.toUpperCase() },
                { k: 'Inspect Date', v: form.inspectDate ? new Date(form.inspectDate).toLocaleDateString('th-TH') : '—' },
                { k: 'Team', v: form.team.join(', ') || '—' },
                { k: 'Requester', v: currentUser?.name || '—' },
              ].map(item => (
                <div key={item.k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>{item.k}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.v}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>Description</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>{form.description}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, background: 'rgba(240,112,96,0.06)', border: '1px solid rgba(240,112,96,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
              ⚠️ เมื่อยืนยันแล้ว ระบบจะส่ง RFI ไปยัง QC Engineer ทันที
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} style={{ visibility: step > 1 ? 'visible' : 'hidden' }}>← ย้อนกลับ</button>
          {step < 4
            ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>ถัดไป →</button>
            : <button className="btn btn-success" onClick={handleSubmit} disabled={loading}>
                {loading ? '⟳ กำลังส่ง...' : '✓ ยืนยัน & ส่ง RFI'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6,
}
