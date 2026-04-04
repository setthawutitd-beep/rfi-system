import { useState, useEffect, useRef } from 'react'
import type { Rfi, Profile, UserRole } from '../types/rfi'
import { STATUS_LABEL, STATUS_BADGE_CLASS, ROLE_CONFIG } from '../types/rfi'
import { supabase } from '../lib/supabase'

interface FlowNode { id: string; label: string; node_type: string; config: any; position_y: number }
interface FlowEdge { id: string; source_id: string; target_id: string; condition: string; label: string }
interface FlowLevel {
  id: string; node_id: string; sort_order: number; label: string
  action_type: string; assignee_ids: string[]; responsible_ids: string[]
  approval_rule: string; min_count: number; majority_percent: number
  on_reject_action: string; on_reject_node_id: string | null
  attachments: any[]; decision_role_ids: string[]; decision_options: any[]
  is_active: boolean
}
interface DocRequest {
  id: string; label: string; description: string | null
  required: boolean; responsible_ids: string[]; status: string; note: string | null
  rev_no: number; parent_id: string | null; reject_note: string | null
}

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

const ACTION_TYPE_LABEL: Record<string, string> = {
  attach: '📎 แนบเอกสาร', review: '✅ Review',
  acknowledge: '👁 รับทราบ', decision: '🔀 เลือกเส้นทาง',
}

export default function RFIModal({ rfi, open, onClose, currentUser, currentRole, onAction, onComment, onToast }: Props) {
  const [activeTab, setActiveTab] = useState<'flow' | 'docs' | 'history' | 'comments' | 'info'>('flow')
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([])
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([])
  const [flowLevels, setFlowLevels] = useState<FlowLevel[]>([])
  const [docRequests, setDocRequests] = useState<DocRequest[]>([])
  const [docSubmissions, setDocSubmissions] = useState<any[]>([])
  const [currentNode, setCurrentNode] = useState<FlowNode | null>(null)
  const [commentText, setCommentText] = useState('')
  const [remark, setRemark] = useState('')
  const [docReviews, setDocReviews] = useState<Record<string, { status: 'approved' | 'rejected' | 'skip'; note: string }>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [rfiApprovals, setRfiApprovals] = useState<any[]>([])

  // Doc Request form (QC กำหนดเอกสาร)
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [newDoc, setNewDoc] = useState({ label: '', description: '', required: true, responsible_ids: [] as string[] })

  // Role Groups (ดึงจาก DB)
  const [roleGroups, setRoleGroups] = useState<{ id: string; name: string; label: string; color: string }[]>([])
  const [flowLoaded, setFlowLoaded] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  setFlowLoaded(false)
  if (!rfi?.flow_template_id) { setFlowLoaded(true); return }

    setFlowNodes([])
  setFlowEdges([])
  setFlowLevels([])
  setDocRequests([])
  setDocSubmissions([])
  setActivityLog([])
  setRfiApprovals([])
  setDocReviews({})
  setCurrentNode(null)
  setRemark('')
  setShowAddDoc(false)

  // โหลด flow ก่อน (เร็ว)
  Promise.all([
    supabase.from('flow_nodes').select('*').eq('flow_id', rfi.flow_template_id).order('position_y'),
    supabase.from('flow_edges').select('*').eq('flow_id', rfi.flow_template_id),
    supabase.from('role_groups').select('id, name, label, color'),
  ]).then(([{ data: n }, { data: e }, { data: rg }]) => {
    const nodes = n || []
    setFlowNodes(nodes)
    setFlowEdges(e || [])
    setRoleGroups(rg || [])
    setCurrentNode(nodes.find((x: FlowNode) => x.id === rfi.current_node_id) || null)
    setFlowLoaded(true)

    // โหลดส่วนที่เหลือ (หลัง flow แสดงแล้ว)
    const nodeIds = nodes.map((x: FlowNode) => x.id)
    if (nodeIds.length === 0) return

Promise.all([
  supabase.from('flow_node_levels').select('*').in('node_id', nodeIds).order('sort_order'),
  supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfi.id)
  .not('status', 'eq', 'rejected')
  .order('sort_order').order('rev_no'),
  supabase.from('rfi_doc_submissions').select('*, profile:submitted_by(name, color)').eq('rfi_id', rfi.id),
  supabase.from('rfi_approvals').select('*, user:user_id(name, color, avatar)').eq('rfi_id', rfi.id),
]).then(async ([{ data: l }, { data: d }, { data: subs }, { data: approvals }]) => {
  setFlowLevels(l || [])
  setDocSubmissions(subs || [])
  setRfiApprovals(approvals || [])

  // Auto-load template ถ้า QC node และยังไม่มี doc requests
  let docReqs = d || []
  if (docReqs.length === 0) {
    // หา node ปัจจุบันที่มี action_type = acknowledge (QC กำหนดเอกสาร)
    const currentNodeLvls = (l || []).filter((lv: any) => lv.node_id === rfi.current_node_id)
    const hasAck = currentNodeLvls.some((lv: any) => lv.action_type === 'acknowledge')

    if (hasAck) {
      // หา attach level จาก node เดิม (ที่มี attachments ใน template)
      const attachLvl = (l || []).find((lv: any) =>
        lv.node_id === rfi.current_node_id && lv.action_type === 'attach'
      )
      // ถ้าไม่มีใน node ปัจจุบัน ให้หาจาก node แนบเอกสาร
      const attachNodeId = nodes.find((n: any) => {
        const nodeLvls = (l || []).filter((lv: any) => lv.node_id === n.id)
        return nodeLvls.some((lv: any) => lv.action_type === 'attach' && (lv.attachments || []).length > 0)
      })?.id

      const targetAttachLvl = attachLvl || (l || []).find((lv: any) =>
        lv.node_id === attachNodeId && lv.action_type === 'attach'
      )

      if (targetAttachLvl?.attachments?.length > 0) {
        const inserts = targetAttachLvl.attachments.map((att: any, i: number) => ({
          rfi_id: rfi.id,
          node_id: rfi.current_node_id,
          label: att.label,
          description: att.description || null,
          required: att.required,
          responsible_type: 'role_group',
          responsible_ids: att.responsible_role_id ? [att.responsible_role_id] : [],
          sort_order: i,
          status: 'pending',
        }))

        const { data: inserted } = await supabase
          .from('rfi_doc_requests')
          .insert(inserts)
          .select()

        docReqs = inserted || []
        setDocReviews({})
      }
    }
  }

setDocRequests(docReqs)
    })
  })

  // โหลด activity log แยก (ไม่บล็อค)
  supabase.from('rfi_activity_log')
    .select('*, actor:actor_id(name, color, avatar)')
    .eq('rfi_id', rfi.id)
    .order('created_at', { ascending: false })
    .then(({ data }) => setActivityLog(data || []))

    supabase.from('rfi_activity_log')
  .select('*, actor:actor_id(name, color, avatar)')
  .eq('rfi_id', rfi.id)
  .order('created_at', { ascending: false })
  .limit(50)

}, [rfi?.id])

if (!rfi) return null

  // หา Levels ของ Node ปัจจุบัน
  const currentNodeLevels = flowLevels.filter(l => l.node_id === rfi.current_node_id)

  // ตรวจสอบว่า User มีสิทธิ์ทำ Action ใน Level ไหน
  const getUserPermittedLevels = () => {
    const userRoleGroupIds = roleGroups
      .filter(rg => rg.name === currentRole)
      .map(rg => rg.id)

    return currentNodeLevels.filter(level => {
      if (level.action_type === 'attach') {
        return level.responsible_ids.length === 0 ||
          level.responsible_ids.some(id => userRoleGroupIds.includes(id))
      }
      if (level.action_type === 'review' || level.action_type === 'acknowledge') {
        return level.assignee_ids.some(id => userRoleGroupIds.includes(id))
      }
      if (level.action_type === 'decision') {
        return level.decision_role_ids.some(id => userRoleGroupIds.includes(id))
      }
      return false
    })
  }

  const permittedLevels = getUserPermittedLevels()

  // หา Next Node
  const getNextNode = (condition = 'yes') => {
    const edge = flowEdges.find(e => e.source_id === rfi.current_node_id && e.condition === condition)
    return edge ? flowNodes.find(n => n.id === edge.target_id) : null
  }

  const nextNode = getNextNode('yes')

const handleAdvance = async (condition = 'yes') => {
  const next = getNextNode(condition)
  if (!next) return
  setActionLoading(true)

  await supabase.from('rfis').update({ current_node_id: next.id }).eq('id', rfi.id)
  await supabase.from('rfi_activity_log').insert({
    rfi_id: rfi.id, node_id: rfi.current_node_id,
    action_type: 'advance', actor_id: currentUser?.id,
    note: `เลื่อนไป: ${next.label}`,
  })

  // reload doc requests และ approvals สำหรับ node ใหม่
  const [{ data: newDocs }, { data: newApprovals }] = await Promise.all([
    supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfi.id).order('sort_order'),
    supabase.from('rfi_approvals').select('*, user:user_id(name, color, avatar)').eq('rfi_id', rfi.id),
  ])
  setDocRequests(newDocs || [])
  setRfiApprovals(newApprovals || [])
  setRemark('')
  setCurrentNode(next)

  onToast('สำเร็จ', `เลื่อนไป "${next.label}"`, 'success')
  setActionLoading(false)
  await onAction(rfi.id, 'advance', '')
}

  // QC เพิ่ม Doc Request
  const handleAddDocRequest = async () => {
    if (!newDoc.label) return
    setSaving(true)
    await supabase.from('rfi_doc_requests').insert({
      rfi_id: rfi.id,
      node_id: rfi.current_node_id,
      label: newDoc.label,
      description: newDoc.description || null,
      required: newDoc.required,
      responsible_ids: newDoc.responsible_ids,
      sort_order: docRequests.length + 1,
      status: 'pending',
      created_by: currentUser?.id,
    })
    const { data } = await supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfi.id).order('sort_order')
    setDocRequests(data || [])
    setNewDoc({ label: '', description: '', required: true, responsible_ids: [] })
    setShowAddDoc(false)
    onToast('เพิ่มแล้ว', newDoc.label, 'success')
    setSaving(false)
  }

  const handleComment = async () => {
    if (!commentText.trim()) return
    await onComment(rfi.id, commentText)
    setCommentText('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docRequestId?: string) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    const ext = file.name.split('.').pop()
    const safeName = `${Date.now()}.${ext}`
    const path = `${rfi.id}/${safeName}`
    const { data: upload, error } = await supabase.storage.from('rfi-attachments').upload(path, file)
    if (error) { onToast('Upload ล้มเหลว', error.message, 'error'); return }
    const { data: url } = supabase.storage.from('rfi-attachments').getPublicUrl(path)
    await supabase.from('rfi_doc_submissions').insert({
      rfi_id: rfi.id,
      doc_request_id: docRequestId || null,
      node_id: rfi.current_node_id,
      filename: file.name,
      file_url: url.publicUrl,
      file_size: file.size,
      mime_type: file.type,
      submitted_by: currentUser.id,
      status: 'pending',
    })
    onToast('อัปโหลดสำเร็จ', file.name, 'success')
    e.target.value = ''
  }

  // Timeline
  const renderTimeline = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {flowNodes.map((node, i) => {
        const nodeIdx = flowNodes.findIndex(n => n.id === rfi.current_node_id)
        const isPast = i < nodeIdx
        const isCurr = node.id === rfi.current_node_id
        const color = node.config?.color || '#5eaeff'
        const dotColor = isPast ? 'var(--green)' : isCurr ? color : 'var(--border2)'
        const levels = flowLevels.filter(l => l.node_id === node.id)

        return (
          <div key={node.id} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i < flowNodes.length - 1 ? 12 : 0 }}>
            {i < flowNodes.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 22, bottom: 0, width: 1, background: 'var(--border)' }} />
            )}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              border: `2px solid ${dotColor}`,
              background: isPast ? 'var(--green-bg)' : isCurr ? `${color}22` : 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: dotColor,
              animation: isCurr ? 'pulse 2s infinite' : undefined,
            }}>
              {isPast ? '✓' : isCurr ? '◎' : '○'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: isCurr ? color : 'var(--text)', marginBottom: 2 }}>
                {node.label}
                {isCurr && <span style={{ fontSize: 9, marginLeft: 6, background: `${color}22`, color, padding: '1px 5px', borderRadius: 3, border: `1px solid ${color}` }}>ปัจจุบัน</span>}
              </div>
              {levels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {levels.map(l => (
                    <span key={l.id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                      {ACTION_TYPE_LABEL[l.action_type]} {l.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

const renderActionPanel = () => {
  if (!flowLoaded) return (
    <div style={apStyle}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>กำลังโหลด...</div>
    </div>
  )
  if (!rfi.flow_template_id) return (
    <div style={apStyle}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8 }}>ยังไม่ได้กำหนด Flow Template</div>
      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
        disabled={actionLoading}
        onClick={async () => {
          if (!rfi.work_type_id) { onToast('ผิดพลาด', 'RFI นี้ไม่มี Work Type', 'error'); return }
          setActionLoading(true)
          const { data: wt } = await supabase.from('work_types').select('flow_template_id').eq('id', rfi.work_type_id).single()
          if (!wt?.flow_template_id) { onToast('ผิดพลาด', 'Work Type ยังไม่มี Flow Template', 'error'); setActionLoading(false); return }
          const { data: firstNode } = await supabase.from('flow_nodes').select('id').eq('flow_id', wt.flow_template_id).eq('node_type', 'start').single()
          let nodeId = firstNode?.id || null
          if (nodeId) {
            const { data: edge } = await supabase.from('flow_edges').select('target_id').eq('source_id', nodeId).eq('condition', 'yes').single()
            if (edge?.target_id) nodeId = edge.target_id
          }
          await supabase.from('rfis').update({ flow_template_id: wt.flow_template_id, current_node_id: nodeId }).eq('id', rfi.id)
          onToast('สำเร็จ', 'กำหนด Flow Template แล้ว', 'success')
          await onAction(rfi.id, 'assign_flow', '')
          setActionLoading(false)
        }}>
        {actionLoading ? '⟳ กำลังบันทึก...' : '⚡ กำหนด Flow จาก Work Type'}
      </button>
    </div>
  )
  if (!currentNode) return (
    <div style={apStyle}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>ไม่พบ Node ปัจจุบันใน Flow</div>
    </div>
  )
  const currentNodeLevels = flowLevels.filter(l => l.node_id === (currentNode?.id || rfi.current_node_id))
  const userRoleGroupIds = roleGroups.filter(rg => rg.name === currentRole).map(rg => rg.id)

  // หา Level ที่ user มีสิทธิ์
  const attachLevel = currentNodeLevels.find(l =>
    l.action_type === 'attach' && (
      l.responsible_ids.length === 0 ||
      l.responsible_ids.some(id => userRoleGroupIds.includes(id))
    )
  )
  const reviewLevel = currentNodeLevels.find(l =>
    l.action_type === 'review' &&
    l.assignee_ids.some(id => userRoleGroupIds.includes(id))
  )
  const reviewLevelAny = currentNodeLevels.find(l => l.action_type === 'review')
  const acknowledgeLevel = currentNodeLevels.find(l =>
    l.action_type === 'acknowledge' &&
    l.assignee_ids.some(id => userRoleGroupIds.includes(id))
  )
  const decisionLevel = currentNodeLevels.find(l =>
    l.action_type === 'decision' &&
    l.decision_role_ids.some(id => userRoleGroupIds.includes(id))
  )

  const nodeApprovals = rfiApprovals.filter(a => a.node_id === rfi.current_node_id)
  const myApproval = nodeApprovals.find(a => a.user_id === currentUser?.id)

  const ruleLabel: Record<string, string> = {
    any_one: '1 คนจากกลุ่มใดก็ได้',
    all_in_group: 'ครบทุกคนในกลุ่ม',
    min_count: `อย่างน้อย ${reviewLevelAny?.min_count || 1} คน`,
    majority: `เสียงข้างมาก > ${reviewLevelAny?.majority_percent || 50}%`,
    one_per_group: '1 คนจากทุกกลุ่ม',
    all_groups: 'ครบทุกกลุ่ม',
  }

  // ── Node End ──
  if (currentNode.node_type === 'end') return (
    <div style={{ ...apStyle, borderColor: 'var(--green)', textAlign: 'center' }}>
      <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 700 }}>✓ RFI ปิดเรียบร้อยแล้ว</div>
    </div>
  )

  // ── Acknowledge (QC กำหนดเอกสาร) ──
  if (currentNodeLevels.some(l => l.action_type === 'acknowledge')) {
    const ackLevel = currentNodeLevels.find(l => l.action_type === 'acknowledge')
    const canAck = ackLevel?.assignee_ids.some(id => userRoleGroupIds.includes(id))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={apStyle}>
          <div style={atStyle}>📍 {currentNode.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>
            {canAck ? 'กำหนดรายการเอกสารที่ต้องการ แล้วส่งให้ผู้รับผิดชอบแนบ' : `รอ QC กำหนดเอกสาร`}
          </div>

          {canAck && (
            <>
              {docRequests.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {docRequests.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: doc.required ? 'var(--red)' : 'var(--green)' }}>●</span>
                      <span style={{ fontSize: 12, flex: 1 }}>{doc.label}</span>
                      <span style={{ fontSize: 9, color: 'var(--text3)' }}>
                        {roleGroups.find(r => doc.responsible_ids?.includes(r.id))?.label || '—'}
                      </span>
                      <button onClick={async () => {
                        await supabase.from('rfi_doc_requests').delete().eq('id', doc.id)
                        const { data } = await supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfi.id).order('sort_order')
                        setDocRequests(data || [])
                      }} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {showAddDoc ? (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <input className="input" placeholder="ชื่อเอกสาร *" value={newDoc.label}
                    onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))}
                    style={{ marginBottom: 6 }} />
                  <input className="input" placeholder="คำอธิบาย" value={newDoc.description}
                    onChange={e => setNewDoc(p => ({ ...p, description: e.target.value }))}
                    style={{ marginBottom: 6 }} />
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    {[true, false].map(v => (
                      <div key={String(v)} onClick={() => setNewDoc(p => ({ ...p, required: v }))} style={{
                        flex: 1, textAlign: 'center', padding: '5px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: newDoc.required === v ? (v ? 'rgba(240,80,96,0.15)' : 'rgba(62,207,142,0.15)') : 'var(--surface3)',
                        border: `1px solid ${newDoc.required === v ? (v ? 'var(--red)' : 'var(--green)') : 'var(--border)'}`,
                        color: newDoc.required === v ? (v ? 'var(--red)' : 'var(--green)') : 'var(--text3)',
                      }}>{v ? 'บังคับ' : 'Optional'}</div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>ผู้รับผิดชอบส่ง:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {roleGroups.map(rg => {
                        const sel = newDoc.responsible_ids.includes(rg.id)
                        return (
                          <div key={rg.id} onClick={() => setNewDoc(p => ({
                            ...p, responsible_ids: sel ? p.responsible_ids.filter(x => x !== rg.id) : [...p.responsible_ids, rg.id],
                          }))} style={{
                            padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                            background: sel ? `${rg.color}22` : 'var(--surface3)',
                            border: `1px solid ${sel ? rg.color : 'var(--border)'}`,
                            color: sel ? rg.color : 'var(--text3)',
                          }}>{rg.label}</div>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDoc(false)}>ยกเลิก</button>
                    <button className="btn btn-success btn-sm" onClick={handleAddDocRequest} disabled={saving || !newDoc.label}>✓ เพิ่ม</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm"
                  style={{ marginBottom: 10, width: '100%', justifyContent: 'center' }}
                  onClick={async () => {
                    if (docRequests.length === 0) {
                      const { data: tmplLevel } = await supabase
                        .from('flow_node_levels').select('*')
                        .eq('node_id', currentNode.id).eq('action_type', 'attach').maybeSingle()
                      if (tmplLevel?.attachments?.length > 0) {
                        setSaving(true)
                        for (let i = 0; i < tmplLevel.attachments.length; i++) {
                          const att = tmplLevel.attachments[i]
                          await supabase.from('rfi_doc_requests').insert({
                            rfi_id: rfi.id, node_id: currentNode.id,
                            label: att.label, description: att.description || null,
                            required: att.required, responsible_type: 'role_group',
                            responsible_ids: att.responsible_role_id ? [att.responsible_role_id] : [],
                            sort_order: i, status: 'pending', created_by: currentUser?.id,
                          })
                        }
                        const { data } = await supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfi.id).order('sort_order')
                        setDocRequests(data || [])
                        setSaving(false)
                        onToast('โหลดแล้ว', 'โหลดรายการจาก Template แล้ว', 'success')
                      }
                    }
                    setShowAddDoc(true)
                  }}>
                  {saving ? '⟳ กำลังโหลด...' : '+ เพิ่มรายการเอกสาร'}
                </button>
              )}

              {docRequests.length > 0 && !showAddDoc && (
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleAdvance('yes')} disabled={actionLoading}>
                  {actionLoading ? '⟳ กำลังส่ง...' : '✓ ยืนยันและส่งให้แนบเอกสาร'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Attach ──
  if (currentNodeLevels.some(l => l.action_type === 'attach')) {
    const allAttachLevels = currentNodeLevels.filter(l => l.action_type === 'attach')
    const myAttachLevel = allAttachLevels.find(l =>
      l.responsible_ids.length === 0 || l.responsible_ids.some(id => userRoleGroupIds.includes(id))
    )
    const myDocs = docRequests.filter(doc =>
      doc.responsible_ids.length === 0 ||
      doc.responsible_ids.some(id => userRoleGroupIds.includes(id))
    )
    
    const visibleDocs = docRequests

    return (
      <div style={apStyle}>
        <div style={atStyle}>📍 {currentNode.label}</div>
        {docRequests.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>รอ QC กำหนดรายการเอกสาร</div>
        ) : visibleDocs.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>ไม่มีเอกสารที่ต้องแนบในขั้นตอนนี้</div>
        ) : (
          <>
            {visibleDocs.map(doc => (
              <div key={doc.id} style={{
                background: 'var(--surface2)',
                border: `1px solid ${doc.status === 'submitted' ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 8, padding: '8px 10px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: doc.required ? 'var(--red)' : 'var(--green)' }}>●</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{doc.label}</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
                    background: doc.status === 'pending' ? 'rgba(245,197,66,0.15)' : 'rgba(62,207,142,0.15)',
                    color: doc.status === 'pending' ? 'var(--yellow)' : 'var(--green)',
                    border: `1px solid ${doc.status === 'pending' ? 'var(--yellow)' : 'var(--green)'}`,
                  }}>{doc.status === 'pending' ? 'รอแนบ' : '✓ แนบแล้ว'}</span>
                </div>
 {/* แสดงว่าใครต้องแนบ */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: doc.status === 'pending' ? 6 : 0 }}>
                  {(doc.responsible_ids || []).map(id => {
                    const rg = roleGroups.find(r => r.id === id)
                    if (!rg) return null
                    return (
                      <span key={id} style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: `${rg.color}18`, border: `1px solid ${rg.color}`,
                        color: rg.color,
                      }}>{rg.label}</span>
                    )
                  })}
                  {(doc.responsible_ids || []).length === 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text3)' }}>ทุกคน</span>
                  )}
                </div>

{(() => {
                  const canAttach = doc.responsible_ids.length === 0 ||
                    doc.responsible_ids.some(id => userRoleGroupIds.includes(id))
                  if (!canAttach) return null

                  const mySubmission = docSubmissions.find(s =>
                    s.doc_request_id === doc.id && s.submitted_by === currentUser?.id
                  )

                  return (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {/* ปุ่มแนบ/เปลี่ยนไฟล์ */}
                      {doc.status !== 'approved' && (
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                          background: doc.status === 'submitted' ? 'rgba(245,197,66,0.1)' : 'var(--surface3)',
                          border: `1px solid ${doc.status === 'submitted' ? 'var(--yellow)' : 'var(--border)'}`,
                          color: doc.status === 'submitted' ? 'var(--yellow)' : 'var(--text2)',
                        }}>
                          {doc.status === 'submitted' ? '🔄 เปลี่ยนไฟล์' : '📎 แนบไฟล์'}
                          <input type="file" style={{ display: 'none' }} onChange={async e => {
                            // ลบ submission เดิมถ้ามี
                            if (mySubmission) {
                              await supabase.from('rfi_doc_submissions').delete().eq('id', mySubmission.id)
                            }
                            await handleFileUpload(e, doc.id)
                            await supabase.from('rfi_doc_requests')
                              .update({ status: 'submitted' }).eq('id', doc.id)

                            // reload
                            const [{ data: newDocs }, { data: newSubs }] = await Promise.all([
                              supabase.from('rfi_doc_requests').select('*')
                                .eq('rfi_id', rfi.id).not('status', 'eq', 'rejected')
                                .order('sort_order').order('rev_no'),
                              supabase.from('rfi_doc_submissions')
                                .select('*, profile:submitted_by(name, color)')
                                .eq('rfi_id', rfi.id),
                            ])
                            setDocRequests(newDocs || [])
                            setDocSubmissions(newSubs || [])

                         
                          }} />
                        </label>
                      )}

                      {/* ปุ่มลบไฟล์ */}
                      {mySubmission && doc.status !== 'approved' && (
                        <button onClick={async () => {
                          await supabase.from('rfi_doc_submissions').delete().eq('id', mySubmission.id)
                          await supabase.from('rfi_doc_requests')
                            .update({ status: 'pending' }).eq('id', doc.id)
                          const [{ data: newDocs }, { data: newSubs }] = await Promise.all([
                            supabase.from('rfi_doc_requests').select('*')
                              .eq('rfi_id', rfi.id).not('status', 'eq', 'rejected')
                              .order('sort_order').order('rev_no'),
                            supabase.from('rfi_doc_submissions')
                              .select('*, profile:submitted_by(name, color)')
                              .eq('rfi_id', rfi.id),
                          ])
                          setDocRequests(newDocs || [])
                          setDocSubmissions(newSubs || [])
                          onToast('ลบแล้ว', doc.label, 'info')
                        }} style={{
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                          background: 'rgba(240,80,96,0.1)', border: '1px solid var(--red)',
                          color: 'var(--red)',
                        }}>🗑 ลบ</button>
                      )}

                      {/* Rev badge */}
                      {doc.rev_no > 0 && (
                        <span style={{
                          fontSize: 10, padding: '4px 8px', borderRadius: 6,
                          background: 'rgba(245,197,66,0.15)', border: '1px solid var(--yellow)',
                          color: 'var(--yellow)', display: 'flex', alignItems: 'center',
                        }}>Rev.{doc.rev_no} — ส่งใหม่</span>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
{(() => {
              const requiredDocs = docRequests.filter(d => d.required)
              const submittedCount = requiredDocs.filter(d =>
                d.status === 'submitted' || d.status === 'approved'
              ).length
              const allDone = submittedCount === requiredDocs.length && requiredDocs.length > 0

              return (
                <div style={{ marginTop: 8 }}>
                  {/* Progress */}
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textAlign: 'center' }}>
                    เอกสารบังคับ {submittedCount}/{requiredDocs.length} อัน
                  </div>
                  <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: allDone ? 'var(--green)' : 'var(--accent)',
                      width: `${Math.min(100, (submittedCount / Math.max(requiredDocs.length, 1)) * 100)}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>


                  {/* ปุ่มส่ง */}
                  <button className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={!allDone || actionLoading}
                    onClick={async () => {
                      onToast('กำลังส่ง...', 'ส่งเอกสารไปขั้นตอนถัดไป', 'info')
                      await handleAdvance('yes')
                    }}>
                    {actionLoading ? '⟳ กำลังส่ง...'
                      : allDone ? '✓ ส่งเอกสารไปขั้นตอนถัดไป →'
                      : `รอแนบเอกสารบังคับให้ครบก่อน (${submittedCount}/${requiredDocs.length})`}
                  </button>
                </div>
              )
            })()}
          </>
        )}
      </div>
    )
  }

  // ── Review ──
  if (currentNodeLevels.some(l => l.action_type === 'review')) {
    const approvedCount = nodeApprovals.filter(a => a.action === 'approve').length
    const requiredCount = reviewLevelAny?.approval_rule === 'any_one' ? 1
      : reviewLevelAny?.approval_rule === 'min_count' ? (reviewLevelAny.min_count || 1)
      : (reviewLevelAny?.assignee_ids || []).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={apStyle}>
          <div style={atStyle}>📍 {currentNode.label}</div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>👥 ผู้ที่ต้องทำ</div>
            {(reviewLevelAny?.assignee_ids || []).map(id => {
              const rg = roleGroups.find(r => r.id === id)
              if (!rg) return null
              const isMe = rg.name === currentRole
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                  borderRadius: 6, marginBottom: 4,
                  background: isMe ? `${rg.color}18` : 'var(--surface2)',
                  border: `1px solid ${isMe ? rg.color : 'var(--border)'}`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: rg.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isMe ? rg.color : 'var(--text2)', flex: 1 }}>{rg.label}</span>
                  {isMe && <span style={{ fontSize: 9, color: rg.color, background: `${rg.color}18`, padding: '1px 5px', borderRadius: 3 }}>← คุณ</span>}
                </div>
              )
            })}
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>📋 เงื่อนไขผ่าน</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
              {ruleLabel[reviewLevelAny?.approval_rule || 'any_one']}
            </div>
          </div>

          <div style={{ marginBottom: nodeApprovals.length > 0 ? 10 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>📊 ความคืบหน้า</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{approvedCount} / {requiredCount} คน อนุมัติแล้ว</div>
            <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${Math.min(100, (approvedCount / Math.max(requiredCount, 1)) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
          </div>

          {nodeApprovals.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>✅ ดำเนินการแล้ว</div>
              {nodeApprovals.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: a.user?.color || 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0a0d12' }}>
                    {a.user?.avatar || a.user?.name?.[0] || '?'}
                  </div>
                  <span style={{ fontSize: 11, flex: 1 }}>{a.user?.name}</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: a.action === 'approve' ? 'rgba(62,207,142,0.15)' : 'rgba(240,80,96,0.15)', color: a.action === 'approve' ? 'var(--green)' : 'var(--red)', border: `1px solid ${a.action === 'approve' ? 'var(--green)' : 'var(--red)'}` }}>
                    {a.action === 'approve' ? '✓ ผ่าน' : '✕ ไม่ผ่าน'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {new Date(a.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

{reviewLevel && !myApproval && (
          <div style={apStyle}>
            <div style={atStyle}>⚡ Review เอกสารแต่ละอัน</div>

            {docRequests.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>ยังไม่มีเอกสาร</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {docRequests.map(doc => {
                  const rev = docReviews[doc.id] || { status: 'skip', note: '' }
                  const subs = docSubmissions.filter(s => s.doc_request_id === doc.id)
                  return (
                    <div key={doc.id} style={{
                      background: 'var(--surface3)', borderRadius: 8, padding: '10px 12px',
                      border: `1px solid ${rev.status === 'approved' ? 'var(--green)' : rev.status === 'rejected' ? 'var(--red)' : 'var(--border)'}`,
                    }}>
                      {/* ชื่อเอกสาร */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: doc.required ? 'var(--red)' : 'var(--green)' }}>●</span>
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{doc.label}</span>
                        {doc.rev_no > 0 && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,197,66,0.15)', color: 'var(--yellow)', border: '1px solid var(--yellow)' }}>
                            Rev.{doc.rev_no}
                          </span>
                        )}
                      </div>

                      {/* ไฟล์ที่แนบ */}
                      {subs.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          {subs.map(sub => (
                            <a key={sub.id} href={sub.file_url} target="_blank" rel="noreferrer" style={{
                              display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5,
                              color: 'var(--accent2)', textDecoration: 'none', marginBottom: 3,
                            }}>
                              <span>📄</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.filename}</span>
                              <span style={{ fontSize: 9, color: 'var(--text3)' }}>{sub.profile?.name}</span>
                              <span>↗</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 8 }}>
                          {doc.required ? '⚠️ ยังไม่มีไฟล์' : '— ไม่มีไฟล์ (optional)'}
                        </div>
                      )}

                      {/* ปุ่ม ผ่าน/ไม่ผ่าน/ข้าม */}
                      <div style={{ display: 'flex', gap: 5 }}>
                        {(['approved', 'rejected', 'skip'] as const).map(s => (
                          <button key={s} onClick={() => setDocReviews(prev => ({
                            ...prev, [doc.id]: { ...prev[doc.id], status: s, note: prev[doc.id]?.note || '' }
                          }))} style={{
                            flex: 1, padding: '4px', borderRadius: 5, cursor: 'pointer', fontSize: 10.5,
                            fontWeight: rev.status === s ? 700 : 400,
                            background: rev.status === s
                              ? s === 'approved' ? 'rgba(62,207,142,0.2)' : s === 'rejected' ? 'rgba(240,80,96,0.2)' : 'var(--surface2)'
                              : 'var(--surface2)',
                            border: `1px solid ${rev.status === s
                              ? s === 'approved' ? 'var(--green)' : s === 'rejected' ? 'var(--red)' : 'var(--border2)'
                              : 'var(--border)'}`,
                            color: rev.status === s
                              ? s === 'approved' ? 'var(--green)' : s === 'rejected' ? 'var(--red)' : 'var(--text2)'
                              : 'var(--text3)',
                          }}>
                            {s === 'approved' ? '✓ ผ่าน' : s === 'rejected' ? '✕ ไม่ผ่าน' : '— ข้าม'}
                          </button>
                        ))}
                      </div>

                      {/* เหตุผล (ถ้าไม่ผ่าน) */}
                      {rev.status === 'rejected' && (
                        <input className="input" placeholder="เหตุผล (บังคับ) *"
                          value={rev.note} style={{ marginTop: 6, fontSize: 11 }}
                          onChange={e => setDocReviews(prev => ({
                            ...prev, [doc.id]: { ...prev[doc.id], note: e.target.value }
                          }))} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Submit Review */}
            {(() => {
              const reviewed = docRequests.filter(d => docReviews[d.id]?.status !== 'skip')
              const rejected = docRequests.filter(d => docReviews[d.id]?.status === 'rejected')
              const rejectMissingNote = rejected.some(d => !docReviews[d.id]?.note)
              const requiredNotReviewed = docRequests
                .filter(d => d.required && docReviews[d.id]?.status === 'skip').length

              return (
                <div>
                  {requiredNotReviewed > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 6 }}>
                      ⚠️ ยังมีเอกสารบังคับที่ยังไม่ได้ Review {requiredNotReviewed} อัน
                    </div>
                  )}
                  {rejectMissingNote && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>
                      ⚠️ กรุณาใส่เหตุผลสำหรับเอกสารที่ไม่ผ่านทุกอัน
                    </div>
                  )}
                  <button className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={actionLoading || requiredNotReviewed > 0 || rejectMissingNote}
                    onClick={async () => {
                      setActionLoading(true)
                      const approved = docRequests.filter(d => docReviews[d.id]?.status === 'approved')
                      const rejected = docRequests.filter(d => docReviews[d.id]?.status === 'rejected')

                      // อนุมัติเอกสารที่ผ่าน
                      for (const doc of approved) {
                        await supabase.from('rfi_doc_requests')
                          .update({ status: 'approved' }).eq('id', doc.id)
                      }

                      // Reject + สร้าง Rev.+1
                      for (const doc of rejected) {
                        await supabase.rpc('reject_doc_and_create_revision', {
                          p_doc_id: doc.id,
                          p_rejected_by: currentUser?.id,
                          p_reject_note: docReviews[doc.id].note,
                        })
                      }

                      // บันทึก approval
                      await supabase.from('rfi_approvals').insert({
                        rfi_id: rfi.id, node_id: rfi.current_node_id,
                        level_id: reviewLevel.id, user_id: currentUser?.id,
                        action: rejected.length > 0 ? 'reject' : 'approve',
                        note: rejected.length > 0
                          ? `ไม่ผ่าน ${rejected.length} อัน: ${rejected.map(d => d.label).join(', ')}`
                          : `ผ่านทั้งหมด ${approved.length} อัน`,
                      })

                      // บันทึก activity
                      await supabase.from('rfi_activity_log').insert({
                        rfi_id: rfi.id, node_id: rfi.current_node_id,
                        action_type: rejected.length > 0 ? 'review_fail' : 'review_pass',
                        actor_id: currentUser?.id,
                        note: rejected.length > 0
                          ? `Reject ${rejected.length} อัน กลับไปแนบใหม่`
                          : 'อนุมัติเอกสารทั้งหมด',
                      })

                      setDocReviews({})
                      setActionLoading(false)
                      onToast(
                        rejected.length > 0 ? 'ส่งกลับแก้ไข' : 'อนุมัติแล้ว',
                        rejected.length > 0 ? `${rejected.length} เอกสารต้องแนบใหม่` : 'ผ่านทั้งหมด',
                        rejected.length > 0 ? 'error' : 'success'
                      )

                      // เลื่อน Node
                      handleAdvance(rejected.length > 0 ? 'no' : 'yes')
                    }}>
                    {actionLoading ? '⟳ กำลัง Submit...' : `Submit Review (${docRequests.filter(d => docReviews[d.id]?.status !== 'skip').length}/${docRequests.length})`}
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {myApproval && (
          <div style={{ ...apStyle, borderColor: myApproval.action === 'approve' ? 'var(--green)' : 'var(--red)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: myApproval.action === 'approve' ? 'var(--green)' : 'var(--red)' }}>
              {myApproval.action === 'approve' ? '✓ คุณอนุมัติแล้ว' : '✕ คุณส่งกลับแล้ว'}
            </div>
            {myApproval.note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{myApproval.note}</div>}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'IBM Plex Mono, monospace' }}>
              {new Date(myApproval.created_at).toLocaleString('th-TH')}
            </div>
          </div>
        )}

        {!reviewLevel && (
          <div style={apStyle}>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              รอ {(reviewLevelAny?.assignee_ids || []).map(id => roleGroups.find(r => r.id === id)?.label).filter(Boolean).join(', ')} Review
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Decision ──
  if (decisionLevel) {
    return (
      <div style={apStyle}>
        <div style={atStyle}>🔀 {currentNode.label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(decisionLevel.decision_options || []).length > 0
            ? decisionLevel.decision_options.map((opt: any, i: number) => (
              <button key={i} className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }}
                onClick={() => handleAdvance(i === 0 ? 'yes' : 'no')} disabled={actionLoading}>
                {opt.label}
              </button>
            ))
            : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleAdvance('yes')} disabled={actionLoading}>ใช่</button>
                <button className="btn btn-success btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleAdvance('no')} disabled={actionLoading}>ไม่ใช่</button>
              </div>
            )
          }
        </div>
      </div>
    )
  }

  // ── ไม่มี Action ──
  return (
    <div style={apStyle}>
      <div style={atStyle}>📍 {currentNode.label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
        {currentNodeLevels.length === 0 ? 'ยังไม่มี Level กำหนดใน Node นี้' : 'คุณไม่มี Action ในขั้นตอนนี้'}
      </div>
    </div>
  )
}

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, backdropFilter: 'blur(4px)',
      opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
      transition: 'opacity 0.2s',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: 760, maxWidth: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(16px)', transition: 'transform 0.2s',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>{rfi.id}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{rfi.type} — {rfi.location}</div>
          </div>
          <span className={`badge ${STATUS_BADGE_CLASS[rfi.status]}`} style={{ marginLeft: 8 }}>
            {STATUS_LABEL[rfi.status]}
          </span>
          {currentNode && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(94,174,255,0.1)', border: '1px solid var(--accent2)', color: 'var(--accent2)' }}>
              📍 {currentNode.label}
            </span>
          )}
          <span onClick={onClose} style={{
            marginLeft: 'auto', width: 28, height: 28, background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>✕</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Tabs */}
            <div className="tabs">
              {(['flow', 'docs', 'history', 'comments', 'info'] as const).map(t => (
  <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
    {t === 'flow' ? '🔀 Flow' : t === 'docs' ? '📎 เอกสาร' : t === 'history' ? '📜 ประวัติ' : t === 'comments' ? '💬 Comments' : 'ℹ️ ข้อมูล'}
  </div>
))}
            </div>

            {/* Flow Tab */}
            {activeTab === 'flow' && renderTimeline()}
            {/* History Tab */}
{activeTab === 'history' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {activityLog.length === 0 ? (
      <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
        ยังไม่มีประวัติ
      </div>
    ) : activityLog.map(log => (
      <div key={log.id} style={{
        display: 'flex', gap: 10, padding: '8px 10px',
        background: 'var(--surface2)', borderRadius: 8,
        borderLeft: `3px solid ${
          log.action_type === 'review_pass' ? 'var(--green)' :
          log.action_type === 'review_fail' ? 'var(--red)' :
          log.action_type === 'advance' ? 'var(--accent2)' : 'var(--border2)'
        }`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: log.actor?.color || 'var(--surface3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#0a0d12',
        }}>{log.actor?.avatar || log.actor?.name?.[0] || '?'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{log.actor?.name}</span>
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--surface3)', color: 'var(--text3)' }}>
              {log.action_type}
            </span>
          </div>
          {log.note && <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{log.note}</div>}
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, fontFamily: 'IBM Plex Mono, monospace' }}>
            {new Date(log.created_at).toLocaleString('th-TH')}
          </div>
        </div>
      </div>
    ))}
  </div>
)}
            {/* Docs Tab */}
            {activeTab === 'docs' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                  เอกสารที่กำหนด ({docRequests.length} รายการ)
                </div>
                {docRequests.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>ยังไม่มีรายการเอกสาร</div>
                ) : (
                  docRequests.map(doc => (
  <div key={doc.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: doc.required ? 'var(--red)' : 'var(--green)' }}>●</span>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{doc.label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 4,
        background: doc.status === 'pending' ? 'rgba(245,197,66,0.15)' : 'rgba(62,207,142,0.15)',
        color: doc.status === 'pending' ? 'var(--yellow)' : 'var(--green)',
        border: `1px solid ${doc.status === 'pending' ? 'var(--yellow)' : 'var(--green)'}`,
      }}>
        {doc.status === 'pending' ? 'รอ' : '✓ ได้รับแล้ว'}
      </span>
    </div>
    {doc.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{doc.description}</div>}

    {/* แสดงไฟล์ที่แนบ */}
    {docSubmissions.filter(s => s.doc_request_id === doc.id).map(sub => (
      <a key={sub.id} href={sub.file_url} target="_blank" rel="noreferrer" style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
        background: 'var(--surface3)', borderRadius: 6, marginTop: 4,
        fontSize: 11, color: 'var(--accent2)', textDecoration: 'none',
        border: '1px solid var(--border)',
      }}>
        <span>📄</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.filename}</span>
        <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>
          {sub.profile?.name}
        </span>
        <span style={{ fontSize: 9, color: 'var(--accent2)' }}>↗</span>
      </a>
    ))}
  </div>
))
                    
                  
                )}
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <div>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(rfi.comments || []).length === 0
                    ? <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>ยังไม่มี Comment</div>
                    : (rfi.comments || []).map(c => (
                      <div key={c.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.user?.name}</span>
                          <span style={{ fontSize: 9.5, color: 'var(--text3)', marginLeft: 'auto' }}>
                            {new Date(c.created_at).toLocaleDateString('th-TH')}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{c.text}</div>
                      </div>
                    ))
                  }
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <textarea className="input" rows={2} placeholder="เพิ่ม Comment..." value={commentText}
                    onChange={e => setCommentText(e.target.value)} style={{ flex: 1, resize: 'none' }} />
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={handleComment}>ส่ง</button>
                </div>
              </div>
            )}

            {/* Info Tab */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { k: 'RFI No.', v: rfi.id },
                  { k: 'Work Type', v: rfi.type },
                  { k: 'Location', v: rfi.location },
                  { k: 'Zone', v: rfi.zone || '—' },
                  { k: 'Priority', v: rfi.priority?.toUpperCase() || '—' },
                  { k: 'Inspect Date', v: rfi.inspect_date ? new Date(rfi.inspect_date).toLocaleDateString('th-TH') : '—' },
                  { k: 'Requester', v: rfi.requester?.name || '—' },
                  { k: 'Re-submit', v: String(rfi.resubmit_count || 0) },
                ].map(item => (
                  <div key={item.k}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>{item.k}</div>
                    <div style={{ fontSize: 12.5 }}>{item.v}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>Description</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>{rfi.description || '—'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Right — Action Panel */}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Action
            </div>
            {renderActionPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}

const apStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12,
}
const atStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'var(--text3)', marginBottom: 8,
}
