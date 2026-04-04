import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface WorkType {
  id: string; code: string; name: string
  work_category: string; is_active: boolean; sort_order: number
  flow_template_id: string | null; number_format_id: string | null
  sub_project_id: string | null
  sub_project_code: string | null
}
interface WorkTypeITP {
  id: string; work_type_id: string; itp_no: string; qc_code: string
  item_name: string; description: string | null; note: string | null
  sort_order: number; is_active: boolean
}
interface FlowTemplate { id: string; name: string }
interface RFIFormat { id: string; name: string; is_default: boolean }
interface RFILevel {
  id: string; format_id: string; sort_order: number
  label: string; level_type: string; value: string | null
  digits: number; year_format: string; month_format: string
  options: { code: string; label: string; description: string }[]
  placeholder: string | null; separator: string; is_enabled: boolean
}

interface Props {
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

export default function WorkTypeManager({ onToast }: Props) {
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [itps, setItps] = useState<WorkTypeITP[]>([])
  const [flows, setFlows] = useState<FlowTemplate[]>([])
  const [subProjects, setSubProjects] = useState<{id: string; code: string; name: string; description: string | null}[]>([])
  const [formats, setFormats] = useState<RFIFormat[]>([])
  const [levels, setLevels] = useState<RFILevel[]>([])
  const [selectedWT, setSelectedWT] = useState<WorkType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewWT, setShowNewWT] = useState(false)
  const [showNewITP, setShowNewITP] = useState(false)
  const [editingITP, setEditingITP] = useState<WorkTypeITP | null>(null)
  const [newWT, setNewWT] = useState({ code: '', name: '', work_category: 'RFI Work' })
  const [newITP, setNewITP] = useState({
    itp_no: '', qc_code: '', item_name: '', description: '', note: ''
  })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: wt }, { data: itp }, { data: fl }, { data: fmt }, { data: lvl }] = await Promise.all([
      supabase.from('work_types').select('*').order('sort_order'),
      supabase.from('work_type_itps').select('*').order('sort_order'),
      supabase.from('flow_templates').select('id, name').order('created_at'),
      supabase.from('sub_projects').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('rfi_number_formats').select('id, name, is_default').order('created_at'),
      supabase.from('rfi_number_levels').select('*').order('sort_order'),
    ])
    setWorkTypes(wt || [])
    setItps(itp || [])
    setFlows(fl || [])
    setFormats(fmt || [])
    setLevels(lvl || [])
    setSubProjects(subProjects || [])
    setLoading(false)
    
  }

  const selectedItps = itps.filter(i => i.work_type_id === selectedWT?.id)

  // Build Preview RFI Number
  const buildPreview = (wt: WorkType) => {
    const formatId = wt.number_format_id || formats.find(f => f.is_default)?.id
    if (!formatId) return `${wt.code}-XXXX`
    const lvls = levels.filter(l => l.format_id === formatId && l.is_enabled)
      .sort((a, b) => a.sort_order - b.sort_order)
    return lvls.map((l, i) => {
      let val = ''
      switch (l.level_type) {
        case 'fixed':       val = l.value || '?'; break
        case 'work_code':   val = wt.code; break
        case 'running':     val = '0'.repeat(l.digits - 1) + '1'; break
        case 'year':        val = l.year_format === 'YY' ? '26' : '2026'; break
        case 'month':       val = l.month_format === 'M' ? '4' : '04'; break
        case 'custom_list': val = l.options?.[0]?.code || 'XXX'; break
        case 'user_input':  val = l.placeholder || 'INPUT'; break
        default:            val = '?'
      }
      return val + (i < lvls.length - 1 ? l.separator : '')
    }).join('')
  }

  const handleSaveWT = async (wt: WorkType, changes: Partial<WorkType>) => {
    await supabase.from('work_types').update(changes).eq('id', wt.id)
    setWorkTypes(prev => prev.map(w => w.id === wt.id ? { ...w, ...changes } : w))
    if (selectedWT?.id === wt.id) setSelectedWT(prev => prev ? { ...prev, ...changes } : prev)
    onToast('บันทึกแล้ว', wt.name, 'success')
  }

  const handleAddWT = async () => {
    if (!newWT.code || !newWT.name) return
    setSaving(true)
    const defaultFormat = formats.find(f => f.is_default)
    const defaultFlow = flows[0]
    const { error } = await supabase.from('work_types').insert({
      code: newWT.code, name: newWT.name, work_category: newWT.work_category,
      sort_order: workTypes.length + 1,
      flow_template_id: defaultFlow?.id || null,
      number_format_id: defaultFormat?.id || null,
    })
    if (error) onToast('Error', error.message, 'error')
    else {
      await supabase.from('rfi_running_numbers').upsert({ sub_code: newWT.code, last_number: 0 })
      onToast('สร้างแล้ว', newWT.name, 'success')
      setNewWT({ code: '', name: '', work_category: 'RFI Work' })
      setShowNewWT(false)
      await load()
    }
    setSaving(false)
  }

  const handleDeleteWT = async (wt: WorkType) => {
    if (!confirm(`ลบ "${wt.name}"?`)) return
    await supabase.from('work_types').delete().eq('id', wt.id)
    if (selectedWT?.id === wt.id) setSelectedWT(null)
    await load()
    onToast('ลบแล้ว', wt.name, 'success')
  }

  const handleToggleWT = async (wt: WorkType) => {
    await supabase.from('work_types').update({ is_active: !wt.is_active }).eq('id', wt.id)
    await load()
  }

  const handleAddITP = async () => {
    if (!selectedWT || !newITP.qc_code || !newITP.item_name) return
    setSaving(true)
    await supabase.from('work_type_itps').insert({
      work_type_id: selectedWT.id,
      itp_no: newITP.itp_no || null,
      qc_code: newITP.qc_code,
      item_name: newITP.item_name,
      description: newITP.description || null,
      note: newITP.note || null,
      sort_order: selectedItps.length + 1,
    })
    onToast('เพิ่มแล้ว', newITP.qc_code, 'success')
    setNewITP({ itp_no: '', qc_code: '', item_name: '', description: '', note: '' })
    setShowNewITP(false)
    await load()
    setSaving(false)
  }

  const handleSaveITP = async () => {
    if (!editingITP) return
    setSaving(true)
    await supabase.from('work_type_itps').update({
      itp_no: editingITP.itp_no, qc_code: editingITP.qc_code,
      item_name: editingITP.item_name, description: editingITP.description,
      note: editingITP.note,
    }).eq('id', editingITP.id)
    onToast('บันทึกแล้ว', editingITP.item_name, 'success')
    setEditingITP(null)
    await load()
    setSaving(false)
  }

  const handleDeleteITP = async (itp: WorkTypeITP) => {
    if (!confirm(`ลบ "${itp.item_name}"?`)) return
    await supabase.from('work_type_itps').delete().eq('id', itp.id)
    await load()
    onToast('ลบแล้ว', itp.item_name, 'success')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>กำลังโหลด...</div>

  const rfiWork = workTypes.filter(w => w.work_category === 'RFI Work')
  const surveyWork = workTypes.filter(w => w.work_category === 'Survey Work')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14 }}>

      {/* Left */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-icon">🏗</div>
            <div className="card-title">ประเภทงาน</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => setShowNewWT(v => !v)}>+ เพิ่ม</button>
          </div>

          {showNewWT && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={labelStyle}>Code</label>
                  <input className="input" placeholder="010" value={newWT.code}
                    onChange={e => setNewWT(p => ({ ...p, code: e.target.value }))}
                    style={{ fontFamily: 'IBM Plex Mono, monospace' }} />
                </div>
                <div>
                  <label style={labelStyle}>ชื่องาน</label>
                  <input className="input" placeholder="Core Rock" value={newWT.name}
                    onChange={e => setNewWT(p => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Category</label>
                <select className="input" value={newWT.work_category}
                  onChange={e => setNewWT(p => ({ ...p, work_category: e.target.value }))}>
                  <option value="RFI Work">RFI Work</option>
                  <option value="Survey Work">Survey Work</option>
                </select>
              </div>
              <button className="btn btn-success btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleAddWT} disabled={saving || !newWT.code || !newWT.name}>✓ สร้าง</button>
            </div>
          )}

          {/* RFI Work */}
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--orange)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>RFI Work</div>
          {rfiWork.map(wt => (
            <WorkTypeRow key={wt.id} wt={wt} selected={selectedWT?.id === wt.id}
              preview={buildPreview(wt)} itpCount={itps.filter(i => i.work_type_id === wt.id).length}
              onSelect={() => setSelectedWT(wt)}
              onToggle={() => handleToggleWT(wt)}
              onDelete={() => handleDeleteWT(wt)} />
          ))}

          {/* Survey Work */}
          {surveyWork.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '1px', textTransform: 'uppercase', margin: '12px 0 6px' }}>Survey Work</div>
              {surveyWork.map(wt => (
                <WorkTypeRow key={wt.id} wt={wt} selected={selectedWT?.id === wt.id}
                  preview={buildPreview(wt)} itpCount={itps.filter(i => i.work_type_id === wt.id).length}
                  onSelect={() => setSelectedWT(wt)}
                  onToggle={() => handleToggleWT(wt)}
                  onDelete={() => handleDeleteWT(wt)} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!selectedWT ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>เลือกประเภทงานทางซ้าย</div>
          </div>
        ) : (
          <>
            {/* Settings Card */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{selectedWT.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, fontFamily: 'IBM Plex Mono, monospace' }}>
                    Code: {selectedWT.code}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* RFI Number Format */}
                <div>
                  <label style={labelStyle}>RFI Number Format</label>
                  <select className="input"
                    value={selectedWT.number_format_id || ''}
                    onChange={e => handleSaveWT(selectedWT, { number_format_id: e.target.value || null })}>
                    <option value="">— ใช้ Default —</option>
                    {formats.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}{f.is_default ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Preview */}
                  <div style={{ marginTop: 6, background: 'var(--surface2)', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent2)' }}>
                    {buildPreview(selectedWT)}
                  </div>
                </div>

                {/* Flow Template */}
                <div>
                  <label style={labelStyle}>Flow Template</label>
                  <select className="input"
                    value={selectedWT.flow_template_id || ''}
                    onChange={e => handleSaveWT(selectedWT, { flow_template_id: e.target.value || null })}>
                    <option value="">— ไม่ระบุ —</option>
                    {flows.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  {selectedWT.flow_template_id && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>
                      ✓ {flows.find(f => f.id === selectedWT.flow_template_id)?.name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: '1/-1' }}>
  <label style={labelStyle}>Sub-Project</label>
  <select className="input"
    value={selectedWT.sub_project_id || ''}
    onChange={e => handleSaveWT(selectedWT, {
      sub_project_id: e.target.value || null,
      sub_project_code: subProjects.find(sp => sp.id === e.target.value)?.code || null,
    })}>
    <option value="">— ไม่ระบุ —</option>
    {subProjects.map(sp => (
      <option key={sp.id} value={sp.id}>
        {sp.code} — {sp.name}
        {sp.description ? ` (${sp.description})` : ''}
      </option>
    ))}
  </select>
  {selectedWT.sub_project_id && (
    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent2)' }}>
      ✓ {subProjects.find(sp => sp.id === selectedWT.sub_project_id)?.name}
    </div>
  )}
</div>

            {/* ITP Codes Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-icon">📋</div>
                <div className="card-title">ITP / QC Codes</div>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => setShowNewITP(v => !v)}>+ เพิ่ม</button>
              </div>

              {showNewITP && (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={labelStyle}>ITP No.</label>
                      <input className="input" placeholder="ITD-TTLR-10-ITP-001"
                        value={newITP.itp_no} onChange={e => setNewITP(p => ({ ...p, itp_no: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>QC Code *</label>
                      <input className="input" placeholder="REV-001-01"
                        value={newITP.qc_code} onChange={e => setNewITP(p => ({ ...p, qc_code: e.target.value }))}
                        style={{ fontFamily: 'IBM Plex Mono, monospace' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>ITEM Name *</label>
                    <input className="input" placeholder="Rock Sampling (Receiving)"
                      value={newITP.item_name} onChange={e => setNewITP(p => ({ ...p, item_name: e.target.value }))} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Description</label>
                    <textarea className="input" rows={2} placeholder="รายละเอียดการตรวจสอบ..."
                      value={newITP.description} onChange={e => setNewITP(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Note</label>
                    <input className="input" placeholder="หมายเหตุ"
                      value={newITP.note} onChange={e => setNewITP(p => ({ ...p, note: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowNewITP(false)}>ยกเลิก</button>
                    <button className="btn btn-success btn-sm" onClick={handleAddITP}
                      disabled={saving || !newITP.qc_code || !newITP.item_name}>✓ เพิ่ม</button>
                  </div>
                </div>
              )}

              {selectedItps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
                  ยังไม่มี ITP Code
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedItps.map(itp => (
                    <div key={itp.id}>
                      {editingITP?.id === itp.id ? (
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 8, padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div>
                              <label style={labelStyle}>ITP No.</label>
                              <input className="input" value={editingITP.itp_no}
                                onChange={e => setEditingITP(p => p ? { ...p, itp_no: e.target.value } : p)} />
                            </div>
                            <div>
                              <label style={labelStyle}>QC Code</label>
                              <input className="input" value={editingITP.qc_code}
                                onChange={e => setEditingITP(p => p ? { ...p, qc_code: e.target.value } : p)}
                                style={{ fontFamily: 'IBM Plex Mono, monospace' }} />
                            </div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={labelStyle}>ITEM Name</label>
                            <input className="input" value={editingITP.item_name}
                              onChange={e => setEditingITP(p => p ? { ...p, item_name: e.target.value } : p)} />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={labelStyle}>Description</label>
                            <textarea className="input" rows={2} value={editingITP.description || ''}
                              onChange={e => setEditingITP(p => p ? { ...p, description: e.target.value } : p)} />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={labelStyle}>Note</label>
                            <input className="input" value={editingITP.note || ''}
                              onChange={e => setEditingITP(p => p ? { ...p, note: e.target.value } : p)} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingITP(null)}>ยกเลิก</button>
                            <button className="btn btn-primary btn-sm" onClick={handleSaveITP} disabled={saving}>💾 บันทึก</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(240,112,96,0.1)', padding: '2px 6px', borderRadius: 4 }}>{itp.qc_code}</span>
                                {itp.itp_no && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{itp.itp_no}</span>}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{itp.item_name}</div>
                              {itp.description && <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>{itp.description}</div>}
                              {itp.note && <div style={{ fontSize: 10.5, color: 'var(--yellow)', marginTop: 3 }}>📌 {itp.note}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => setEditingITP(itp)}>แก้ไข</button>
                              <button className="btn btn-danger btn-xs" onClick={() => handleDeleteITP(itp)}>ลบ</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Sub-component
function WorkTypeRow({ wt, selected, preview, itpCount, onSelect, onToggle, onDelete }: {
  wt: WorkType; selected: boolean; preview: string; itpCount: number
  onSelect: () => void; onToggle: () => void; onDelete: () => void
}) {
  return (
    <div onClick={onSelect} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      borderRadius: 7, cursor: 'pointer', marginBottom: 3,
      background: selected ? 'rgba(240,112,96,0.1)' : 'transparent',
      border: `1px solid ${selected ? 'var(--accent)' : 'transparent'}`,
      opacity: wt.is_active ? 1 : 0.5,
    }}>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)', minWidth: 32 }}>{wt.code}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{wt.name}</div>
        <div style={{ fontSize: 9.5, color: 'var(--accent2)', fontFamily: 'IBM Plex Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{itpCount} ITP</span>
      <label className="toggle-wrap" onClick={e => { e.stopPropagation(); onToggle() }}>
        <input type="checkbox" className="toggle-input" checked={wt.is_active} readOnly />
        <span className="toggle-slider" />
      </label>
      <button className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); onDelete() }}>ลบ</button>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'var(--text3)', marginBottom: 6,
}