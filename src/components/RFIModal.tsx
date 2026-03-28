import { useState, useRef } from 'react'
import type { Rfi, Profile, UserRole } from '../types/rfi'
import {
  STATUS_LABEL, STATUS_BADGE_CLASS, WORKFLOWS,
  ROLE_CONFIG,
} from '../types/rfi'
import { uploadFile } from '../lib/supabase'

interface Props {
  rfi: Rfi | null
  open: boolean
  onClose: () => void
  currentUser: Profile | null
  currentRole: UserRole
  onAction: (rfiId: string, action: string, remark: string) => Promise<{ error: string | null }>
  onComment: (rfiId: string, text: string) => Promise<void>
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

export default function RFIModal({ rfi, open, onClose, currentUser, currentRole, onAction, onComment, onToast }: Props) {
  const [activeTab, setActiveTab] = useState<'comment' | 'history' | 'info'>('comment')
  const [remark, setRemark] = useState('')
  const [commentText, setCommentText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!rfi) return null

  const wf = WORKFLOWS[rfi.discipline] || WORKFLOWS.CIV
  const phaseOrder: Record<string, number> = { open: 0, qc: 1, consult: 2, resubmit: 1, inspect: 3, closed: wf.length - 1, reject: -1 }
  const currPhase = rfi.status === 'reject' ? 1 : (phaseOrder[rfi.status] ?? 1)

  const handleAction = async (actionKey: string) => {
    if (!rfi) return
    setActionLoading(true)
    const { error } = await onAction(rfi.id, actionKey, remark)
    if (error) {
      onToast('เกิดข้อผิดพลาด', error, 'error')
    } else {
      onToast('สำเร็จ', `${actionKey.replace('_', ' ')} เรียบร้อย`, 'success')
      setRemark('')
    }
    setActionLoading(false)
  }

  const handleComment = async () => {
    if (!commentText.trim()) return
    await onComment(rfi.id, commentText)
    setCommentText('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    setUploadLoading(true)
    const { error } = await uploadFile(rfi.id, file, currentUser.id)
    if (error) onToast('Upload ล้มเหลว', (error as Error).message, 'error')
    else onToast('อัปโหลดสำเร็จ', file.name, 'success')
    setUploadLoading(false)
    e.target.value = ''
  }

  // Build action panel based on role + status
  const renderActionPanel = () => {
    if (currentRole === 'qc' && rfi.status === 'qc') return (
      <div style={actionPanelStyle}>
        <div style={actionTitleStyle}>QC Review — {rfi.id}</div>
        <textarea className="input" rows={2} placeholder="หมายเหตุ (ระบุเหตุผลหากตีกลับ)..." value={remark} onChange={e => setRemark(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleAction('approve_qc')} disabled={actionLoading}>✓ Approve → Consult</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleAction('reject_qc')} disabled={actionLoading}>✕ Reject / ตีกลับ</button>
        </div>
      </div>
    )

    if (currentRole === 'consultant' && rfi.status === 'consult') return (
      <div style={actionPanelStyle}>
        <div style={actionTitleStyle}>Consultant Review</div>
        <textarea className="input" rows={2} placeholder="ความเห็น / เงื่อนไขพิเศษ..." value={remark} onChange={e => setRemark(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleAction('approve_consult')} disabled={actionLoading}>✓ Approve → Inspection</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleAction('reject_consult')} disabled={actionLoading}>✕ Reject</button>
        </div>
      </div>
    )

    if (currentRole === 'qc' && rfi.status === 'resubmit') return (
      <div style={{ ...actionPanelStyle, borderColor: 'var(--purple)' }}>
        <div style={{ ...actionTitleStyle, color: 'var(--purple)' }}>Re-submit Review</div>
        <textarea className="input" rows={2} placeholder="หมายเหตุ..." value={remark} onChange={e => setRemark(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-success btn-sm" onClick={() => handleAction('approve_resubmit')} disabled={actionLoading}>✓ Accept Re-submit</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleAction('reject_resubmit')} disabled={actionLoading}>✕ Reject อีกครั้ง</button>
        </div>
      </div>
    )

    if (currentRole === 'contractor' && rfi.status === 'reject') return (
      <div style={{ ...actionPanelStyle, borderColor: 'var(--purple)' }}>
        <div style={{ ...actionTitleStyle, color: 'var(--purple)' }}>♻️ Re-submit</div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8 }}>แก้ไขและส่งคำขอใหม่ (ครั้งที่ {rfi.resubmit_count + 1})</div>
        <textarea className="input" rows={2} placeholder="อธิบายการแก้ไขที่ทำ..." value={remark} onChange={e => setRemark(e.target.value)} style={{ marginBottom: 8 }} />
        <button
          className="btn btn-sm"
          style={{ background: 'var(--purple-bg)', borderColor: 'var(--purple)', color: 'var(--purple)', width: '100%', justifyContent: 'center' }}
          onClick={() => handleAction('resubmit')}
          disabled={actionLoading}
        >♻️ ยืนยัน Re-submit</button>
      </div>
    )

    if (currentRole === 'qc' && rfi.status === 'inspect') return (
      <div style={{ ...actionPanelStyle, borderColor: 'var(--green)' }}>
        <div style={{ ...actionTitleStyle, color: 'var(--green)' }}>🔍 Site Inspection Active</div>
        <button className="btn btn-success btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => handleAction('complete_inspect')} disabled={actionLoading}>✓ ตรวจเสร็จสิ้น</button>
      </div>
    )

    if (currentRole === 'pm' && rfi.status === 'inspect') return (
      <div style={{ ...actionPanelStyle, borderColor: 'var(--purple)' }}>
        <div style={actionTitleStyle}>PM Verify</div>
        <button
          className="btn btn-sm"
          style={{ background: 'var(--purple-bg)', borderColor: 'var(--purple)', color: 'var(--purple)', width: '100%', justifyContent: 'center' }}
          onClick={() => handleAction('close_pm')}
          disabled={actionLoading}
        >✓ Verify & Close RFI</button>
      </div>
    )

    if (rfi.status === 'closed') return (
      <div style={{ ...actionPanelStyle, borderColor: 'var(--green)', textAlign: 'center' }}>
        <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 700 }}>✓ RFI ปิดเรียบร้อยแล้ว</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>ดูรายงานสรุปใน Document Control</div>
      </div>
    )

    return (
      <div style={actionPanelStyle}>
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
          Role ปัจจุบัน ({ROLE_CONFIG[currentRole]?.label}) ไม่มี Action ในขั้นตอนนี้
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, backdropFilter: 'blur(4px)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
        transition: 'opacity 0.2s',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: 720, maxWidth: '95vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(16px)',
        transition: 'transform 0.2s',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>{rfi.id}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{rfi.type} — {rfi.location}</div>
          </div>
          <span className={`badge ${STATUS_BADGE_CLASS[rfi.status]}`} style={{ marginLeft: 8 }}>{STATUS_LABEL[rfi.status]}</span>
          <span
            onClick={onClose}
            style={{
              marginLeft: 'auto', width: 28, height: 28, background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: 'var(--text2)', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLSpanElement; el.style.background = 'var(--red-bg)'; el.style.borderColor = 'var(--red)'; el.style.color = 'var(--red)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLSpanElement; el.style.background = 'var(--surface2)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text2)' }}
          >✕</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Tabs */}
            <div className="tabs">
              {(['comment', 'history', 'info'] as const).map(t => (
                <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                  {t === 'comment' ? '💬 Comments' : t === 'history' ? '📜 History Log' : 'ℹ️ ข้อมูล'}
                </div>
              ))}
            </div>

            {/* Comments Tab */}
            {activeTab === 'comment' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
                  {(rfi.comments || []).length === 0
                    ? <div style={{ fontSize: 11.5, color: 'var(--text3)', padding: '8px 0' }}>ยังไม่มี Comment</div>
                    : (rfi.comments || []).map(c => (
                      <div key={c.id} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderLeft: `3px solid ${c.type === 'reject' ? 'var(--red)' : c.type === 'approve' ? 'var(--green)' : c.type === 'resubmit' ? 'var(--purple)' : 'var(--accent2)'}`,
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: c.user?.color || 'var(--text3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#0a0d12',
                          }}>{c.user?.avatar || c.user?.name?.[0] || '?'}</div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.user?.name || 'Unknown'}</span>
                          <span style={{ fontSize: 9.5, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{c.user?.role?.toUpperCase()}</span>
                          <span style={{ fontSize: 9.5, color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {new Date(c.created_at).toLocaleDateString('th-TH')}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{c.text}</div>
                      </div>
                    ))
                  }
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <textarea
                    className="input" rows={2}
                    placeholder="เพิ่ม Comment..."
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleComment() }}
                    style={{ flex: 1, resize: 'none' }}
                  />
                  <button className="btn btn-ghost btn-sm" style={{ height: 'fit-content', alignSelf: 'flex-end' }} onClick={handleComment}>ส่ง</button>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(rfi.history || []).length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>ยังไม่มีประวัติ</div>
                  : (rfi.history || []).map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                        background: h.action === 'reject' ? 'var(--red)' : h.action === 'approve' ? 'var(--green)' : h.action === 'close' ? 'var(--purple)' : 'var(--accent)',
                      }} />
                      <div style={{ fontSize: 11.5, color: 'var(--text2)', flex: 1, lineHeight: 1.4 }}>
                        <strong>{h.user?.name || h.user_id}</strong> — {h.note}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', flexShrink: 0 }}>
                        {new Date(h.created_at).toLocaleDateString('th-TH')}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* Info Tab */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { k: 'RFI No.', v: rfi.id },
                  { k: 'Discipline', v: rfi.discipline },
                  { k: 'Work Type', v: rfi.type },
                  { k: 'Location', v: rfi.location },
                  { k: 'Zone', v: rfi.zone || '—' },
                  { k: 'Priority', v: rfi.priority.toUpperCase() },
                  { k: 'Requester', v: rfi.requester?.name || '—' },
                  { k: 'Inspect Date', v: rfi.inspect_date ? new Date(rfi.inspect_date).toLocaleDateString('th-TH') : '—' },
                  { k: 'Re-submit Count', v: String(rfi.resubmit_count) },
                  { k: 'Team', v: rfi.team?.join(', ') || '—' },
                ].map(item => (
                  <div key={item.k}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>{item.k}</div>
                    <div style={{ fontSize: 12.5 }}>{item.v}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Description</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text2)' }}>{rfi.description || '—'}</div>
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
                ไฟล์แนบ ({(rfi.attachments || []).length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(rfi.attachments || []).map(a => (
                  <div key={a.id} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '4px 10px', fontSize: 11.5,
                    display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  }}>
                    📎 {a.filename}
                  </div>
                ))}
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadLoading}
                >
                  {uploadLoading ? '⟳ กำลังอัปโหลด...' : '+ แนบไฟล์'}
                </button>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            {/* Workflow Timeline */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Workflow</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {wf.map((step, i) => {
                  const isDone = i < currPhase
                  const isCurr = i === currPhase
                  const isReject = rfi.status === 'reject' && i === 1
                  const dotColor = isReject ? 'var(--red)' : isDone ? 'var(--green)' : isCurr ? 'var(--accent)' : 'var(--border2)'
                  const dotBg = isReject ? 'var(--red-bg)' : isDone ? 'var(--green-bg)' : isCurr ? 'rgba(240,112,96,0.1)' : 'var(--surface2)'
                  const icon = isReject ? '✕' : isDone ? '✓' : isCurr ? '◎' : '○'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i < wf.length - 1 ? 14 : 0 }}>
                      {i < wf.length - 1 && (
                        <div style={{ position: 'absolute', left: 11, top: 22, bottom: 0, width: 1, background: 'var(--border)' }} />
                      )}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        border: `2px solid ${dotColor}`, background: dotBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, flexShrink: 0, marginTop: 1, color: dotColor,
                        animation: isCurr ? 'pulse 2s infinite' : undefined,
                      }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{step}</div>
                        {rfi.history?.[i] && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                            {new Date(rfi.history[i].created_at).toLocaleDateString('th-TH')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action Panel */}
            {renderActionPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}

const actionPanelStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12,
}
const actionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'var(--text3)', marginBottom: 8,
}
