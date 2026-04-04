import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface RFIFormat {
  id: string; name: string; description: string | null
  is_active: boolean; is_default: boolean
}
interface RFILevel {
  id: string; format_id: string; sort_order: number
  label: string; description: string | null
  level_type: string; value: string | null
  digits: number; year_format: string; month_format: string
  options: { code: string; label: string; description: string }[]
  placeholder: string | null; separator: string; is_enabled: boolean
}

const LEVEL_TYPES = [
  { value: 'fixed',       label: 'Fixed Text',    icon: '🔒', desc: 'ค่าคงที่ไม่เปลี่ยน' },
  { value: 'work_code',   label: 'Work Code',     icon: '🏗', desc: 'ดึงจาก Work Type อัตโนมัติ' },
  { value: 'running',     label: 'Running Number',icon: '🔢', desc: 'รันเลขอัตโนมัติ' },
  { value: 'year',        label: 'Year',          icon: '📅', desc: 'ปีปัจจุบัน' },
  { value: 'month',       label: 'Month',         icon: '📆', desc: 'เดือนปัจจุบัน' },
  { value: 'custom_list', label: 'Custom List',   icon: '📝', desc: 'กำหนด dropdown เอง' },
  { value: 'user_input',  label: 'User Input',    icon: '✏️', desc: 'พิมพ์เองตอนสร้าง RFI' },
]

interface Props {
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

export default function RFINumberFormatManager({ onToast }: Props) {
  const [formats, setFormats] = useState<RFIFormat[]>([])
  const [levels, setLevels] = useState<RFILevel[]>([])
  const [selectedFormat, setSelectedFormat] = useState<RFIFormat | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingLevel, setEditingLevel] = useState<RFILevel | null>(null)
  const [showNewFormat, setShowNewFormat] = useState(false)
  const [showNewLevel, setShowNewLevel] = useState(false)
  const [newFormat, setNewFormat] = useState({ name: '', description: '' })
  const [newLevel, setNewLevel] = useState({
    label: '', description: '', level_type: 'fixed',
    value: '', digits: 4, year_format: 'YYYY', month_format: 'MM',
    separator: '-', placeholder: '',
    options: [] as { code: string; label: string; description: string }[],
  })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: f }, { data: l }] = await Promise.all([
      supabase.from('rfi_number_formats').select('*').order('created_at'),
      supabase.from('rfi_number_levels').select('*').order('sort_order'),
    ])
    setFormats(f || [])
    setLevels((l || []).map(lv => ({ ...lv, options: lv.options || [] })))
    setLoading(false)
  }

  const selectFormat = (f: RFIFormat) => {
    setSelectedFormat(f)
    setEditingLevel(null)
    setShowNewLevel(false)
  }

  const selectedLevels = levels.filter(l => l.format_id === selectedFormat?.id)

  // Preview RFI Number
  const buildPreview = (lvls: RFILevel[]) => {
    return lvls.filter(l => l.is_enabled).map((l, i) => {
      let val = ''
      switch (l.level_type) {
        case 'fixed':       val = l.value || '?'; break
        case 'work_code':   val = '010'; break
        case 'running':     val = '0'.repeat(l.digits - 1) + '1'; break
        case 'year':        val = l.year_format === 'YY' ? '26' : '2026'; break
        case 'month':       val = l.month_format === 'M' ? '4' : '04'; break
        case 'custom_list': val = l.options?.[0]?.code || 'XXX'; break
        case 'user_input':  val = l.placeholder || 'INPUT'; break
        default:            val = '?'
      }
      return val + (i < lvls.filter(x => x.is_enabled).length - 1 ? l.separator : '')
    }).join('')
  }

  const handleAddFormat = async () => {
    if (!newFormat.name) return
    setSaving(true)
    const { error } = await supabase.from('rfi_number_formats').insert(newFormat)
    if (error) onToast('Error', error.message, 'error')
    else {
      onToast('สร้างแล้ว', newFormat.name, 'success')
      setNewFormat({ name: '', description: '' })
      setShowNewFormat(false)
      await load()
    }
    setSaving(false)
  }

  const handleDeleteFormat = async (f: RFIFormat) => {
    if (!confirm(`ลบ Format "${f.name}"?`)) return
    await supabase.from('rfi_number_formats').delete().eq('id', f.id)
    if (selectedFormat?.id === f.id) setSelectedFormat(null)
    await load()
    onToast('ลบแล้ว', f.name, 'success')
  }

  const handleSetDefault = async (f: RFIFormat) => {
    await supabase.from('rfi_number_formats').update({ is_default: false }).neq('id', f.id)
    await supabase.from('rfi_number_formats').update({ is_default: true }).eq('id', f.id)
    await load()
    onToast('ตั้งค่าแล้ว', `"${f.name}" เป็น Default`, 'success')
  }

  const handleAddLevel = async () => {
    if (!selectedFormat || !newLevel.label) return
    setSaving(true)
    const { error } = await supabase.from('rfi_number_levels').insert({
      format_id: selectedFormat.id,
      sort_order: selectedLevels.length + 1,
      label: newLevel.label,
      description: newLevel.description || null,
      level_type: newLevel.level_type,
      value: newLevel.value || null,
      digits: newLevel.digits,
      year_format: newLevel.year_format,
      month_format: newLevel.month_format,
      separator: newLevel.separator,
      placeholder: newLevel.placeholder || null,
      options: newLevel.options,
    })
    if (error) onToast('Error', error.message, 'error')
    else {
      onToast('เพิ่ม Level แล้ว', newLevel.label, 'success')
      setNewLevel({ label: '', description: '', level_type: 'fixed', value: '', digits: 4, year_format: 'YYYY', month_format: 'MM', separator: '-', placeholder: '', options: [] })
      setShowNewLevel(false)
      await load()
    }
    setSaving(false)
  }

  const handleSaveLevel = async () => {
    if (!editingLevel) return
    setSaving(true)
    const { error } = await supabase.from('rfi_number_levels').update({
      label: editingLevel.label,
      description: editingLevel.description,
      level_type: editingLevel.level_type,
      value: editingLevel.value,
      digits: editingLevel.digits,
      year_format: editingLevel.year_format,
      month_format: editingLevel.month_format,
      separator: editingLevel.separator,
      placeholder: editingLevel.placeholder,
      options: editingLevel.options,
      is_enabled: editingLevel.is_enabled,
    }).eq('id', editingLevel.id)
    if (error) onToast('Error', error.message, 'error')
    else { onToast('บันทึกแล้ว', editingLevel.label, 'success'); setEditingLevel(null); await load() }
    setSaving(false)
  }

  const handleDeleteLevel = async (l: RFILevel) => {
    if (!confirm(`ลบ Level "${l.label}"?`)) return
    await supabase.from('rfi_number_levels').delete().eq('id', l.id)
    await load()
    onToast('ลบแล้ว', l.label, 'success')
  }

  const handleMoveLevel = async (l: RFILevel, dir: 'up' | 'down') => {
    const sorted = [...selectedLevels].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(x => x.id === l.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    await Promise.all([
      supabase.from('rfi_number_levels').update({ sort_order: swap.sort_order }).eq('id', l.id),
      supabase.from('rfi_number_levels').update({ sort_order: l.sort_order }).eq('id', swap.id),
    ])
    await load()
  }

  const renderLevelForm = (
    data: typeof newLevel | RFILevel,
    onChange: (k: string, v: any) => void,
    isEdit = false
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Label *</label>
          <input className="input" placeholder="เช่น Prefix, Project Code"
            value={data.label} onChange={e => onChange('label', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>ประเภท *</label>
          <select className="input" value={data.level_type}
            onChange={e => onChange('level_type', e.target.value)}>
            {LEVEL_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label} — {t.desc}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>คำอธิบาย</label>
        <input className="input" placeholder="อธิบาย Level นี้..."
          value={data.description || ''} onChange={e => onChange('description', e.target.value)} />
      </div>

      {/* ตามประเภท */}
      {data.level_type === 'fixed' && (
        <div>
          <label style={labelStyle}>ค่าคงที่ *</label>
          <input className="input" placeholder="เช่น ITD-TTLR, RFI"
            value={data.value || ''} onChange={e => onChange('value', e.target.value)}
            style={{ fontFamily: 'IBM Plex Mono, monospace' }} />
        </div>
      )}

      {data.level_type === 'running' && (
        <div>
          <label style={labelStyle}>จำนวน Digits</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[3, 4, 5, 6].map(d => (
              <div key={d} onClick={() => onChange('digits', d)} style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: data.digits === d ? 'rgba(240,112,96,0.15)' : 'var(--surface2)',
                border: `1px solid ${data.digits === d ? 'var(--accent)' : 'var(--border)'}`,
                color: data.digits === d ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 12,
              }}>{'0'.repeat(d - 1)}1</div>
            ))}
          </div>
        </div>
      )}

      {data.level_type === 'year' && (
        <div>
          <label style={labelStyle}>Format ปี</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['YYYY', 'YY'].map(f => (
              <div key={f} onClick={() => onChange('year_format', f)} style={{
                padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                background: data.year_format === f ? 'rgba(240,112,96,0.15)' : 'var(--surface2)',
                border: `1px solid ${data.year_format === f ? 'var(--accent)' : 'var(--border)'}`,
                color: data.year_format === f ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 12,
              }}>{f === 'YYYY' ? '2026' : '26'}</div>
            ))}
          </div>
        </div>
      )}

      {data.level_type === 'month' && (
        <div>
          <label style={labelStyle}>Format เดือน</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['MM', 'M'].map(f => (
              <div key={f} onClick={() => onChange('month_format', f)} style={{
                padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                background: data.month_format === f ? 'rgba(240,112,96,0.15)' : 'var(--surface2)',
                border: `1px solid ${data.month_format === f ? 'var(--accent)' : 'var(--border)'}`,
                color: data.month_format === f ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 12,
              }}>{f === 'MM' ? '04' : '4'}</div>
            ))}
          </div>
        </div>
      )}

      {data.level_type === 'user_input' && (
        <div>
          <label style={labelStyle}>Placeholder</label>
          <input className="input" placeholder="เช่น กรอกโซน..."
            value={data.placeholder || ''} onChange={e => onChange('placeholder', e.target.value)} />
        </div>
      )}

      {data.level_type === 'custom_list' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>รายการ Options</label>
            <button className="btn btn-ghost btn-xs" onClick={() => {
              const opts = [...(data.options || []), { code: '', label: '', description: '' }]
              onChange('options', opts)
            }}>+ เพิ่ม</button>
          </div>
          {(data.options || []).length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>
              ยังไม่มี Options — กด + เพิ่ม
            </div>
          )}
          {(data.options || []).map((opt, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input className="input" placeholder="Code" value={opt.code}
                onChange={e => {
                  const opts = [...(data.options || [])]
                  opts[i] = { ...opts[i], code: e.target.value }
                  onChange('options', opts)
                }}
                style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }} />
              <input className="input" placeholder="ชื่อ" value={opt.label}
                onChange={e => {
                  const opts = [...(data.options || [])]
                  opts[i] = { ...opts[i], label: e.target.value }
                  onChange('options', opts)
                }} style={{ fontSize: 11 }} />
              <input className="input" placeholder="คำอธิบาย" value={opt.description}
                onChange={e => {
                  const opts = [...(data.options || [])]
                  opts[i] = { ...opts[i], description: e.target.value }
                  onChange('options', opts)
                }} style={{ fontSize: 11 }} />
              <button onClick={() => {
                const opts = (data.options || []).filter((_, j) => j !== i)
                onChange('options', opts)
              }} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Separator หลัง Level นี้</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['-', '/', '_', '.', ''].map(s => (
              <div key={s === '' ? 'none' : s} onClick={() => onChange('separator', s)} style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                background: data.separator === s ? 'rgba(240,112,96,0.15)' : 'var(--surface2)',
                border: `1px solid ${data.separator === s ? 'var(--accent)' : 'var(--border)'}`,
                color: data.separator === s ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, minWidth: 32, textAlign: 'center',
              }}>{s === '' ? 'ว่าง' : s}</div>
            ))}
          </div>
        </div>
        {isEdit && (
          <div>
            <label style={labelStyle}>เปิดใช้งาน</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[true, false].map(v => (
                <div key={String(v)} onClick={() => onChange('is_enabled', v)} style={{
                  flex: 1, textAlign: 'center', padding: '6px', borderRadius: 6, cursor: 'pointer',
                  background: (editingLevel?.is_enabled ?? true) === v ? (v ? 'rgba(62,207,142,0.15)' : 'rgba(240,80,96,0.15)') : 'var(--surface2)',
                  border: `1px solid ${(editingLevel?.is_enabled ?? true) === v ? (v ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                  color: (editingLevel?.is_enabled ?? true) === v ? (v ? 'var(--green)' : 'var(--red)') : 'var(--text3)',
                  fontSize: 12,
                }}>{v ? 'เปิด' : 'ปิด'}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>กำลังโหลด...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>

      {/* Left — Format List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-icon">🔢</div>
            <div className="card-title">RFI Number Format</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => setShowNewFormat(v => !v)}>+ ใหม่</button>
          </div>

          {showNewFormat && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <input className="input" placeholder="ชื่อ Format" value={newFormat.name}
                onChange={e => setNewFormat(p => ({ ...p, name: e.target.value }))}
                style={{ marginBottom: 6 }} />
              <input className="input" placeholder="คำอธิบาย" value={newFormat.description}
                onChange={e => setNewFormat(p => ({ ...p, description: e.target.value }))}
                style={{ marginBottom: 6 }} />
              <button className="btn btn-success btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleAddFormat} disabled={saving || !newFormat.name}>✓ สร้าง</button>
            </div>
          )}

          {formats.map(f => (
            <div key={f.id} onClick={() => selectFormat(f)} style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selectedFormat?.id === f.id ? 'rgba(94,174,255,0.1)' : 'transparent',
              border: `1px solid ${selectedFormat?.id === f.id ? 'var(--accent2)' : 'transparent'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {f.name}
                    {f.is_default && <span style={{ fontSize: 9, background: 'rgba(62,207,142,0.15)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>DEFAULT</span>}
                  </div>
                  {f.description && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{f.description}</div>}
                  <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {buildPreview(levels.filter(l => l.format_id === f.id).sort((a, b) => a.sort_order - b.sort_order))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {!f.is_default && (
                    <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); handleSetDefault(f) }}>Default</button>
                  )}
                  <button className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); handleDeleteFormat(f) }}>ลบ</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Level Editor */}
      <div>
        {!selectedFormat ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>เลือก Format ทางซ้ายเพื่อจัดการ Levels</div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{selectedFormat.name}</div>
                <div style={{ fontSize: 11, color: 'var(--accent2)', marginTop: 2, fontFamily: 'IBM Plex Mono, monospace' }}>
                  Preview: {buildPreview(selectedLevels.sort((a, b) => a.sort_order - b.sort_order))}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                onClick={() => setShowNewLevel(v => !v)}>+ เพิ่ม Level</button>
            </div>

            {/* New Level Form */}
            {showNewLevel && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>เพิ่ม Level ใหม่</div>
                {renderLevelForm(newLevel, (k, v) => setNewLevel(p => ({ ...p, [k]: v })))}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowNewLevel(false)}>ยกเลิก</button>
                  <button className="btn btn-success btn-sm" onClick={handleAddLevel} disabled={saving || !newLevel.label}>✓ เพิ่ม</button>
                </div>
              </div>
            )}

            {/* Levels List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...selectedLevels].sort((a, b) => a.sort_order - b.sort_order).map((level, idx, arr) => {
                const typeInfo = LEVEL_TYPES.find(t => t.value === level.level_type)
                return (
                  <div key={level.id}>
                    {editingLevel?.id === level.id ? (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 10 }}>แก้ไข Level — {level.label}</div>
                        {renderLevelForm(
                          editingLevel,
                          (k, v) => setEditingLevel(p => p ? { ...p, [k]: v } : p),
                          true
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingLevel(null)}>ยกเลิก</button>
                          <button className="btn btn-primary btn-sm" onClick={handleSaveLevel} disabled={saving}>💾 บันทึก</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px',
                        border: `1px solid ${level.is_enabled ? 'var(--border)' : 'var(--border)'}`,
                        opacity: level.is_enabled ? 1 : 0.5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* Order buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <button onClick={() => handleMoveLevel(level, 'up')} disabled={idx === 0}
                              style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: idx === 0 ? 'var(--border2)' : 'var(--text3)', fontSize: 10, padding: '0 4px' }}>▲</button>
                            <button onClick={() => handleMoveLevel(level, 'down')} disabled={idx === arr.length - 1}
                              style={{ background: 'none', border: 'none', cursor: idx === arr.length - 1 ? 'not-allowed' : 'pointer', color: idx === arr.length - 1 ? 'var(--border2)' : 'var(--text3)', fontSize: 10, padding: '0 4px' }}>▼</button>
                          </div>

                          {/* Order badge */}
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)', flexShrink: 0 }}>
                            {idx + 1}
                          </div>

                          {/* Type icon */}
                          <span style={{ fontSize: 16 }}>{typeInfo?.icon}</span>

                          {/* Info */}
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{level.label}</span>
                              <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3 }}>{typeInfo?.label}</span>
                              {level.separator && (
                                <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent2)' }}>sep: "{level.separator}"</span>
                              )}
                            </div>
                            {level.description && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{level.description}</div>}

                            {/* Value preview */}
                            <div style={{ marginTop: 3 }}>
                              {level.level_type === 'fixed' && <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--green)' }}>{level.value}</span>}
                              {level.level_type === 'running' && <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--purple)' }}>{'0'.repeat(level.digits - 1)}1 ({level.digits} digits)</span>}
                              {level.level_type === 'year' && <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent2)' }}>{level.year_format}</span>}
                              {level.level_type === 'month' && <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent2)' }}>{level.month_format}</span>}
                              {level.level_type === 'work_code' && <span style={{ fontSize: 11, color: 'var(--orange)' }}>ดึงจาก Work Type อัตโนมัติ</span>}
                              {level.level_type === 'custom_list' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                  {(level.options || []).map((opt, i) => (
                                    <span key={i} title={opt.description} style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', background: 'rgba(94,174,255,0.1)', border: '1px solid var(--accent2)', color: 'var(--accent2)', padding: '1px 5px', borderRadius: 3, cursor: 'help' }}>
                                      {opt.code} {opt.label && `— ${opt.label}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {level.level_type === 'user_input' && <span style={{ fontSize: 11, color: 'var(--text3)' }}>placeholder: {level.placeholder || '—'}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-xs" onClick={() => setEditingLevel({ ...level })}>แก้ไข</button>
                            <button className="btn btn-danger btn-xs" onClick={() => handleDeleteLevel(level)}>ลบ</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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