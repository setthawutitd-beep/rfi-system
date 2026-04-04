import { useState, useEffect } from 'react'
import type { Profile, RfiPriority } from '../types/rfi'
import { supabase, addHistory, addNotification, fetchProfiles } from '../lib/supabase'

interface Props {
  currentUser: Profile | null
  onSuccess: (rfiId: string) => void
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

interface WorkType {
  id: string; code: string; name: string
  work_category: string; flow_template_id: string | null
  sub_project_id: string | null
}
interface WorkTypeITP {
  id: string; work_type_id: string; itp_no: string
  qc_code: string; item_name: string
  description: string | null; note: string | null
}

const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'STA 0+000', 'STA 0+130', 'STA 0+402']
const TEAM_OPTIONS = ['QC', 'Inspector', 'Survey', 'Lab', 'Geotech']

function calcPriority(inspectDate: string): RfiPriority {
  const days = Math.ceil((new Date(inspectDate).getTime() - Date.now()) / 86400000)
  if (days < 3) return 'high'
  if (days <= 7) return 'medium'
  return 'low'
}

export default function CreateForm({ currentUser, onSuccess, onToast }: Props) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [subProjects, setSubProjects] = useState<{id: string; code: string; name: string; description: string | null}[]>([])
  const [allItps, setAllItps] = useState<WorkTypeITP[]>([])
  const [selectedWT, setSelectedWT] = useState<WorkType | null>(null)
  const [selectedITPId, setSelectedITPId] = useState<string>('')
  
  const [form, setForm] = useState({
    location: '', zone: '', description: '',
    team: [] as string[], inspectDate: '', inspectTime: '08:00',
  })

  useEffect(() => {
    if (!currentUser) return
    Promise.all([
      supabase.from('work_types').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('work_type_itps').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('sub_projects').select('*').eq('is_active', true).order('sort_order'),
   ]).then(([{ data: wt }, { data: itp }, { data: sp }]) => {
  setWorkTypes(wt || [])
  setAllItps(itp || [])
  setSubProjects(sp || [])
})
  }, [currentUser])

  const wtItps = allItps.filter(i => i.work_type_id === selectedWT?.id)



  const toggleTeam = (t: string) =>
    setForm(prev => ({
      ...prev,
      team: prev.team.includes(t) ? prev.team.filter(x => x !== t) : [...prev.team, t],
    }))

  const canNext = () => {
    if (step === 1) return !!selectedWT
    if (step === 2) return !!selectedITPId
    if (step === 3) return !!form.location && !!form.description && !!form.inspectDate
    return true
  }

  const handleSubmit = async () => {
    if (!currentUser || !selectedWT) return
    setLoading(true)
    try {
      const priority = calcPriority(form.inspectDate)

      // Generate RFI Number
const { data: rfiNo, error: rpcErr } = await supabase.rpc('generate_rfi_number', {
  p_work_type_id: selectedWT.id
})


      if (rpcErr) throw rpcErr

      // Insert RFI
      const { data: rfi, error } = await supabase.from('rfis').insert({
        id: rfiNo as string,
        type: selectedWT.name,
        discipline: 'CIV',
        location: form.location,
        zone: form.zone,
        description: form.description,
        priority,
        team: form.team,
        inspect_date: form.inspectDate || null,
        status: 'open',
        requester_id: currentUser.id,
        work_type_id: selectedWT.id,
        work_type_code: selectedWT.code,
      }).select().single()

      if (error) throw error

      // ผูก Flow อัตโนมัติจาก Work Type
      if (selectedWT.flow_template_id) {
        const { data: firstNode } = await supabase
          .from('flow_nodes').select('id')
          .eq('flow_id', selectedWT.flow_template_id)
          .eq('node_type', 'start').single()

        await supabase.from('rfis').update({
          flow_template_id: selectedWT.flow_template_id,
          current_node_id: firstNode?.id || null,
        }).eq('id', rfi.id)

        // เลื่อนจาก Start → QC กำหนดเอกสาร อัตโนมัติ
if (firstNode?.id) {
  const { data: nextEdge } = await supabase
    .from('flow_edges')
    .select('target_id')
    .eq('source_id', firstNode.id)
    .eq('condition', 'yes')
    .single()

  if (nextEdge?.target_id) {
    await supabase.from('rfis')
      .update({ current_node_id: nextEdge.target_id })
      .eq('id', rfi.id)
  }
}
      }

      
const selectedItp = allItps.find(i => i.id === selectedITPId)
if (selectedItp) {
  await supabase.from('rfi_itp_items').insert([{
    rfi_id: rfi.id,
    work_type_itp_id: selectedItp.id,
    itp_no: selectedItp.itp_no,
    qc_code: selectedItp.qc_code,
    item_name: selectedItp.item_name,
    description: selectedItp.description,
    status: 'pending',
    sort_order: 0,
  }])
}

      await addHistory({
        rfi_id: rfi.id, action: 'submit',
        user_id: currentUser.id, note: 'ส่งคำขอ RFI',
      })

      const { data: profiles } = await fetchProfiles()
      const qcUsers = (profiles || []).filter((p: { role: string }) => p.role === 'qc')
      for (const qc of qcUsers) {
        await addNotification({
          user_id: qc.id, rfi_id: rfi.id,
          message: `${rfi.id} — RFI ใหม่รอ QC Review`, icon: '📋',
        })
      }

      onToast('สร้าง RFI สำเร็จ', `${rfi.id}`, 'success')
      onSuccess(rfi.id)

      // Reset
      setSelectedWT(null); setSelectedITPId('')
      setForm({ location: '', zone: '', description: '', team: [], inspectDate: '', inspectTime: '08:00' })
      setStep(1)
    } catch (e) {
      onToast('เกิดข้อผิดพลาด', (e as Error).message, 'error')
    }
    setLoading(false)
  }

  const steps = ['ประเภทงาน', 'QC Codes', 'รายละเอียด', 'ยืนยัน']
  const rfiWork = workTypes.filter(w => w.work_category === 'RFI Work')
  const selectedItpData = allItps.filter(i => i.id === selectedITPId)
  const priority = form.inspectDate ? calcPriority(form.inspectDate) : null
  const priorityColor = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }
  const priorityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }

  return (
    <div>
      {/* Step Bar */}
      <div style={{ display: 'flex', marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {steps.map((label, i) => (
          <div key={i} onClick={() => i + 1 < step && setStep(i + 1)} style={{
            flex: 1, padding: '10px 8px', textAlign: 'center', fontSize: 12,
            fontWeight: i + 1 === step ? 700 : 500,
            color: i + 1 < step ? 'var(--green)' : i + 1 === step ? 'var(--text)' : 'var(--text3)',
            background: i + 1 === step ? 'var(--surface2)' : 'transparent',
            borderRight: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: i + 1 < step ? 'pointer' : 'default',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 2 }}>
              {i + 1 < step ? '✓' : `STEP ${i + 1}`}
            </div>
            {label}
          </div>
        ))}
      </div>

      <div className="card">

{step === 1 && (
  <div>
    <div className="card-header">
      <div className="card-icon">🏗</div>
      <div className="card-title">เลือกประเภทงาน</div>
    </div>

    {subProjects.filter(sp => sp.code !== 'SUR').map(sp => {
      const spWorks = rfiWork.filter(w => w.sub_project_id === sp.id)
      if (spWorks.length === 0) return null
      return (
        <div key={sp.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(240,112,96,0.1)', padding: '2px 6px', borderRadius: 4 }}>{sp.code}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{sp.name}</span>
            {sp.description && <span style={{ fontSize: 10, color: 'var(--text3)' }}>— {sp.description}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {spWorks.map(w => (
              <div key={w.id} onClick={() => { setSelectedWT(w); setSelectedITPId('') }} style={{
                background: selectedWT?.id === w.id ? 'rgba(240,112,96,0.12)' : 'var(--surface2)',
                border: `2px solid ${selectedWT?.id === w.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(240,112,96,0.1)', padding: '1px 5px', borderRadius: 3 }}>{w.code}</span>
                  {selectedWT?.id === w.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 13 }}>✓</span>}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.name}</div>
              </div>
            ))}
          </div>
        </div>
      )
    })}
  </div>
)}

{step === 2 && selectedWT && (
  <div>
    <div className="card-header">
      <div className="card-icon">📋</div>
      <div className="card-title">เลือก QC Code — {selectedWT.name}</div>
    </div>

    {wtItps.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>
        ยังไม่มี ITP Code สำหรับงานนี้
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {wtItps.map(itp => {
          const selected = selectedITPId === itp.id
          return (
            <div key={itp.id} onClick={() => setSelectedITPId(itp.id)} style={{
              background: selected ? 'rgba(240,112,96,0.08)' : 'var(--surface2)',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {/* Radio */}
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  border: `2px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
                  background: selected ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0a0d12' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700,
                      color: selected ? 'var(--accent)' : 'var(--text2)',
                      background: selected ? 'rgba(240,112,96,0.1)' : 'var(--surface3)',
                      padding: '1px 6px', borderRadius: 3,
                    }}>{itp.qc_code}</span>
                    {itp.itp_no && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{itp.itp_no}</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{itp.item_name}</div>
                  {itp.description && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{itp.description}</div>
                  )}
                  {itp.note && (
                    <div style={{ fontSize: 10.5, color: 'var(--yellow)', marginTop: 4 }}>📌 {itp.note}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )}
  </div>
)}

        {/* STEP 3 — รายละเอียด */}
        {step === 3 && (
          <div>
            <div className="card-header">
              <div className="card-icon">📝</div>
              <div className="card-title">รายละเอียดงาน</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Location *</label>
                  <input className="input" placeholder="เช่น STA 0+100, Zone A"
                    value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Zone / STA</label>
                  <select className="input" value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}>
                    <option value="">— เลือก Zone/STA —</option>
                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description *</label>
                <textarea className="input" rows={3}
                  placeholder="อธิบายงานที่ต้องการตรวจสอบ Drawing No. / Spec อ้างอิง..."
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>วันที่ตรวจ *</label>
                  <input className="input" type="date"
                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                    value={form.inspectDate}
                    onChange={e => setForm(p => ({ ...p, inspectDate: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>เวลา</label>
                  <input className="input" type="time" value={form.inspectTime}
                    onChange={e => setForm(p => ({ ...p, inspectTime: e.target.value }))} />
                </div>
              </div>

              {/* Priority Preview */}
              {form.inspectDate && priority && (
                <div style={{
                  background: `${priorityColor[priority]}15`,
                  border: `1px solid ${priorityColor[priority]}`,
                  borderRadius: 8, padding: '8px 12px', fontSize: 12,
                  color: priorityColor[priority],
                }}>
                  Priority อัตโนมัติ: <strong>{priorityLabel[priority]}</strong>
                  {' '}— {Math.ceil((new Date(form.inspectDate).getTime() - Date.now()) / 86400000)} วันก่อนตรวจ
                </div>
              )}

              <div>
                <label style={labelStyle}>Team ที่ต้องการ</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TEAM_OPTIONS.map(t => (
                    <div key={t} onClick={() => toggleTeam(t)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      background: form.team.includes(t) ? 'rgba(62,207,142,0.1)' : 'var(--surface2)',
                      border: `1px solid ${form.team.includes(t) ? 'var(--green)' : 'var(--border)'}`,
                      color: form.team.includes(t) ? 'var(--green)' : 'var(--text2)',
                    }}>{t}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 — ยืนยัน */}
        {step === 4 && (
          <div>
            <div className="card-header">
              <div className="card-icon">✅</div>
              <div className="card-title">ยืนยันการสร้าง RFI</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { k: 'Work Type', v: `${selectedWT?.code} — ${selectedWT?.name}` },
                { k: 'Location', v: form.location },
                { k: 'Zone / STA', v: form.zone || '—' },
                { k: 'Inspect Date', v: form.inspectDate ? new Date(form.inspectDate).toLocaleDateString('th-TH') : '—' },
                { k: 'Priority', v: priority ? priorityLabel[priority] : '—' },
                { k: 'Requester', v: currentUser?.name || '—' },
              ].map(item => (
                <div key={item.k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>{item.k}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.v}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>Description</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>{form.description}</div>
              </div>
            </div>

            {/* QC Codes Summary */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
                QC Codes ({selectedItpData.length} รายการ)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedItpData.map(itp => (
                  <div key={itp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(240,112,96,0.1)', padding: '1px 5px', borderRadius: 3 }}>{itp.qc_code}</span>
                    <span style={{ fontSize: 12 }}>{itp.item_name}</span>
                    {itp.itp_no && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>{itp.itp_no}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, background: 'rgba(240,112,96,0.06)', border: '1px solid rgba(240,112,96,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
              ⚠️ เมื่อยืนยันแล้ว ระบบจะส่ง RFI ไปยัง QC Engineer ทันที
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}
            style={{ visibility: step > 1 ? 'visible' : 'hidden' }}>← ย้อนกลับ</button>
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
