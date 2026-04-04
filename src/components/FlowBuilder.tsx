import { useState, useEffect, useRef, useCallback } from 'react'
import type { RoleGroup } from '../types/roles'
import {
  fetchFlowTemplates, fetchFlowDetail, createFlowTemplate,
  deleteFlowTemplate, upsertNode, deleteNode, upsertEdge, deleteEdge,
} from '../lib/flows'
import { supabase } from '../lib/supabase'

interface FlowTemplate { id: string; name: string; description: string; is_active: boolean }
interface FlowNode {
  id: string; flow_id: string; node_type: string; label: string
  description?: string; role_group_id?: string | null
  position_x: number; position_y: number; config?: object
}
interface FlowEdge {
  id: string; flow_id: string; source_id: string; target_id: string
  label?: string; condition: string
}
interface FlowNodeLevel {
  id: string; node_id: string; sort_order: number
  label: string; description: string | null
  action_type: string
  responsible_type: string; responsible_ids: string[]
  attachments: { label: string; description: string; required: boolean }[]
  approval_rule: string; min_count: number; majority_percent: number
  assignee_type: string; assignee_ids: string[]
  on_reject_action: string; on_reject_node_id: string | null
  decision_options: { label: string; next_node_id: string; description: string }[]
  decision_role_ids: string[]
  is_active: boolean
}

interface Props {
  roleGroups: RoleGroup[]
  profiles: { id: string; name: string; role: string; color: string }[]
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

const NODE_W = 180
const NODE_H = 60

const ACTION_TYPES = [
  { value: 'attach',      label: 'แนบเอกสาร',  icon: '📎', color: '#5eaeff' },
  { value: 'review',      label: 'Review',      icon: '✅', color: '#3ecf8e' },
  { value: 'acknowledge', label: 'รับทราบ',     icon: '👁', color: '#f5c542' },
  { value: 'decision',    label: 'เลือกเส้นทาง',icon: '🔀', color: '#fb923c' },
]

const APPROVAL_RULES = [
  { value: 'any_one',      label: '1 คนใดก็ได้' },
  { value: 'all_in_group', label: 'ครบทุกคนในกลุ่ม' },
  { value: 'min_count',    label: 'กำหนดจำนวนคน' },
  { value: 'majority',     label: 'เสียงข้างมาก' },
  { value: 'one_per_group',label: '1 คนจากทุกกลุ่ม' },
  { value: 'all_groups',   label: 'ครบทุกกลุ่ม' },
]

const REJECT_ACTIONS = [
  { value: 'go_back_to_attach', label: 'กลับไปที่คนแนบเอกสาร' },
  { value: 'specific_node',     label: 'กลับไป Node ที่กำหนด' },
  { value: 'resubmit',          label: 'ให้ Contractor แก้ไขใหม่' },
  { value: 'cancel',            label: 'ยกเลิก RFI' },
]

export default function FlowBuilder({ roleGroups, profiles, onToast }: Props) {
  const [templates, setTemplates] = useState<FlowTemplate[]>([])
  const [selectedFlow, setSelectedFlow] = useState<FlowTemplate | null>(null)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [nodeLevels, setNodeLevels] = useState<FlowNodeLevel[]>([])
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [activeTab, setActiveTab] = useState<'node' | 'levels'>('node')
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [connecting, setConnecting] = useState<{ sourceId: string } | null>(null)
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [newFlow, setNewFlow] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingLevel, setEditingLevel] = useState<FlowNodeLevel | null>(null)
  const [showNewLevel, setShowNewLevel] = useState(false)
  const [newLevel, setNewLevel] = useState({
    label: '', description: '', action_type: 'attach',
    responsible_type: 'role_group', responsible_ids: [] as string[],
    attachments: [] as { label: string; description: string; required: boolean }[],
    approval_rule: 'any_one', min_count: 1, majority_percent: 50,
    assignee_type: 'role_group', assignee_ids: [] as string[],
    on_reject_action: 'go_back_to_attach', on_reject_node_id: null as string | null,
    decision_options: [] as { label: string; next_node_id: string; description: string }[],
    decision_role_ids: [] as string[],
  })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadTemplates() }, [])

  const loadTemplates = async () => {
    setLoading(true)
    const data = await fetchFlowTemplates()
    setTemplates(data as FlowTemplate[])
    setLoading(false)
  }

  const selectFlow = async (flow: FlowTemplate) => {
    setSelectedFlow(flow)
    setSelectedNode(null)
    setConnecting(null)
    const { nodes: n, edges: e } = await fetchFlowDetail(flow.id)
    setNodes(n as FlowNode[])
    setEdges(e as FlowEdge[])
    // โหลด levels ของทุก node
    const { data: lvl } = await supabase
      .from('flow_node_levels').select('*')
      .in('node_id', (n as FlowNode[]).map(x => x.id))
      .order('sort_order')
    setNodeLevels((lvl || []) as FlowNodeLevel[])
  }

  const refreshLevels = async () => {
    if (!selectedFlow || nodes.length === 0) return
    const { data: lvl } = await supabase
      .from('flow_node_levels').select('*')
      .in('node_id', nodes.map(x => x.id))
      .order('sort_order')
    setNodeLevels((lvl || []) as FlowNodeLevel[])
  }

  const selectedNodeLevels = nodeLevels.filter(l => l.node_id === selectedNode?.id)

  const addNode = async (type: string) => {
    if (!selectedFlow) return
    const colors: Record<string, string> = { start: '#3ecf8e', step: '#5eaeff', decision: '#f5c542', end: '#a78bfa' }
    const { data } = await upsertNode({
      flow_id: selectedFlow.id, node_type: type,
      label: type === 'start' ? 'START' : type === 'end' ? 'END' : 'ขั้นตอนใหม่',
      position_x: 100, position_y: 80 + nodes.length * 120,
      config: { color: colors[type] || '#5eaeff' },
    })
    if (data) setNodes(prev => [...prev, data as FlowNode])
  }

  const handleNodeMouseDown = (e: React.MouseEvent, node: FlowNode) => {
    e.stopPropagation()
    if (connecting) {
      if (connecting.sourceId !== node.id) handleConnect(connecting.sourceId, node.id)
      setConnecting(null)
      return
    }
    setSelectedNode({ ...node })
    setActiveTab('node')
    const rect = canvasRef.current!.getBoundingClientRect()
    setDragging({ id: node.id, ox: e.clientX - rect.left - node.position_x, oy: e.clientY - rect.top - node.position_y })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left - dragging.ox)
    const y = Math.max(0, e.clientY - rect.top - dragging.oy)
    setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, position_x: x, position_y: y } : n))
  }, [dragging])

  const handleMouseUp = useCallback(async () => {
    if (!dragging) return
    const node = nodes.find(n => n.id === dragging.id)
    if (node) await upsertNode({ ...node })
    setDragging(null)
  }, [dragging, nodes])

  const handleConnect = async (sourceId: string, targetId: string) => {
    if (!selectedFlow) return
    if (edges.find(e => e.source_id === sourceId && e.target_id === targetId)) return
    const { data } = await upsertEdge({
      flow_id: selectedFlow.id, source_id: sourceId,
      target_id: targetId, condition: 'yes', label: '',
    })
    if (data) setEdges(prev => [...prev, data as FlowEdge])
  }

  const handleDeleteNode = async (node: FlowNode) => {
    await deleteNode(node.id)
    setNodes(prev => prev.filter(n => n.id !== node.id))
    setEdges(prev => prev.filter(e => e.source_id !== node.id && e.target_id !== node.id))
    setNodeLevels(prev => prev.filter(l => l.node_id !== node.id))
    if (selectedNode?.id === node.id) setSelectedNode(null)
  }

  const handleDeleteEdge = async (edge: FlowEdge) => {
    await deleteEdge(edge.id)
    setEdges(prev => prev.filter(e => e.id !== edge.id))
  }

  const saveNode = async () => {
    if (!selectedNode) return
    setSaving(true)
    await upsertNode({ ...selectedNode })
    setNodes(prev => prev.map(n => n.id === selectedNode.id ? selectedNode : n))
    onToast('บันทึกแล้ว', selectedNode.label, 'success')
    setSaving(false)
  }

  // Level CRUD
  const handleAddLevel = async () => {
    if (!selectedNode || !newLevel.label) return
    setSaving(true)
    const { error } = await supabase.from('flow_node_levels').insert({
      node_id: selectedNode.id,
      sort_order: selectedNodeLevels.length + 1,
      ...newLevel,
    })
    if (error) onToast('Error', error.message, 'error')
    else {
      onToast('เพิ่ม Level แล้ว', newLevel.label, 'success')
      setShowNewLevel(false)
      setNewLevel({
        label: '', description: '', action_type: 'attach',
        responsible_type: 'role_group', responsible_ids: [],
        attachments: [], approval_rule: 'any_one', min_count: 1,
        majority_percent: 50, assignee_type: 'role_group', assignee_ids: [],
        on_reject_action: 'go_back_to_attach', on_reject_node_id: null,
        decision_options: [], decision_role_ids: [],
      })
      await refreshLevels()
    }
    setSaving(false)
  }

  const handleSaveLevel = async () => {
    if (!editingLevel) return
    setSaving(true)
    const { error } = await supabase.from('flow_node_levels').update({
      label: editingLevel.label, description: editingLevel.description,
      action_type: editingLevel.action_type,
      responsible_type: editingLevel.responsible_type,
      responsible_ids: editingLevel.responsible_ids,
      attachments: editingLevel.attachments,
      approval_rule: editingLevel.approval_rule,
      min_count: editingLevel.min_count,
      majority_percent: editingLevel.majority_percent,
      assignee_type: editingLevel.assignee_type,
      assignee_ids: editingLevel.assignee_ids,
      on_reject_action: editingLevel.on_reject_action,
      on_reject_node_id: editingLevel.on_reject_node_id,
      decision_options: editingLevel.decision_options,
      decision_role_ids: editingLevel.decision_role_ids,
      is_active: editingLevel.is_active,
    }).eq('id', editingLevel.id)
    if (error) onToast('Error', error.message, 'error')
    else { onToast('บันทึกแล้ว', editingLevel.label, 'success'); setEditingLevel(null); await refreshLevels() }
    setSaving(false)
  }

  const handleDeleteLevel = async (level: FlowNodeLevel) => {
    if (!confirm(`ลบ Level "${level.label}"?`)) return
    await supabase.from('flow_node_levels').delete().eq('id', level.id)
    await refreshLevels()
    onToast('ลบแล้ว', level.label, 'success')
  }

  const getNodeColor = (node: FlowNode) => (node.config as any)?.color || '#5eaeff'

  const getEdgePath = (edge: FlowEdge) => {
    const s = nodes.find(n => n.id === edge.source_id)
    const t = nodes.find(n => n.id === edge.target_id)
    if (!s || !t) return ''
    const sx = s.position_x + NODE_W / 2, sy = s.position_y + NODE_H
    const tx = t.position_x + NODE_W / 2, ty = t.position_y
    const cy = (sy + ty) / 2
    return `M ${sx} ${sy} C ${sx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`
  }

  const canvasH = Math.max(600, ...nodes.map(n => n.position_y + NODE_H + 100))
  const canvasW = Math.max(800, ...nodes.map(n => n.position_x + NODE_W + 100))

  const renderLevelForm = (
    data: typeof newLevel | FlowNodeLevel,
    onChange: (k: string, v: any) => void
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={ls}>Label *</label>
          <input className="input" value={data.label}
            onChange={e => onChange('label', e.target.value)}
            placeholder="เช่น QC Review" />
        </div>
        <div>
          <label style={ls}>ประเภท Action *</label>
          <select className="input" value={data.action_type}
            onChange={e => onChange('action_type', e.target.value)}>
            {ACTION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={ls}>คำอธิบาย</label>
        <input className="input" value={data.description || ''}
          onChange={e => onChange('description', e.target.value)} />
      </div>

      {/* ── attach ── */}
      {data.action_type === 'attach' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5eaeff', textTransform: 'uppercase', marginBottom: 8 }}>📎 ผู้รับผิดชอบส่งเอกสาร</div>
          <div style={{ marginBottom: 8 }}>
            <label style={ls}>กลุ่ม/คน ที่ต้องส่ง (เลือกได้หลายอัน)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {roleGroups.map(r => {
                const sel = (data.responsible_ids || []).includes(r.id)
                return (
                  <div key={r.id} onClick={() => {
                    const cur = data.responsible_ids || []
                    onChange('responsible_ids', sel ? cur.filter(x => x !== r.id) : [...cur, r.id])
                  }} style={{
                    padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                    background: sel ? `${r.color}22` : 'var(--surface3)',
                    border: `1px solid ${sel ? r.color : 'var(--border)'}`,
                    color: sel ? r.color : 'var(--text3)',
                  }}>{r.label}</div>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={ls}>รายการเอกสาร</label>
              <button className="btn btn-ghost btn-xs" onClick={() =>
                onChange('attachments', [...(data.attachments || []), { label: '', description: '', required: true }])
              }>+ เพิ่ม</button>
            </div>
            {(data.attachments || []).map((att, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="input" placeholder="ชื่อเอกสาร *" value={att.label}
                  onChange={e => {
                    const a = [...(data.attachments || [])]
                    a[i] = { ...a[i], label: e.target.value }
                    onChange('attachments', a)
                  }} style={{ fontSize: 11 }} />
                <input className="input" placeholder="คำอธิบาย" value={att.description}
                  onChange={e => {
                    const a = [...(data.attachments || [])]
                    a[i] = { ...a[i], description: e.target.value }
                    onChange('attachments', a)
                  }} style={{ fontSize: 11 }} />
                <div onClick={() => {
                  const a = [...(data.attachments || [])]
                  a[i] = { ...a[i], required: !a[i].required }
                  onChange('attachments', a)
                }} style={{
                  padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, whiteSpace: 'nowrap',
                  background: att.required ? 'rgba(240,80,96,0.12)' : 'rgba(62,207,142,0.12)',
                  border: `1px solid ${att.required ? 'var(--red)' : 'var(--green)'}`,
                  color: att.required ? 'var(--red)' : 'var(--green)',
                }}>{att.required ? 'บังคับ' : 'Optional'}</div>
                <button onClick={() => onChange('attachments', (data.attachments || []).filter((_, j) => j !== i))}
                  style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── review ── */}
      {data.action_type === 'review' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#3ecf8e', textTransform: 'uppercase', marginBottom: 8 }}>✅ ผู้มีสิทธิ์ Review</div>

          <div style={{ marginBottom: 8 }}>
            <label style={ls}>กลุ่ม/คน ที่มีสิทธิ์ (เลือกได้หลายอัน)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {roleGroups.map(r => {
                const sel = (data.assignee_ids || []).includes(r.id)
                return (
                  <div key={r.id} onClick={() => {
                    const cur = data.assignee_ids || []
                    onChange('assignee_ids', sel ? cur.filter(x => x !== r.id) : [...cur, r.id])
                  }} style={{
                    padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                    background: sel ? `${r.color}22` : 'var(--surface3)',
                    border: `1px solid ${sel ? r.color : 'var(--border)'}`,
                    color: sel ? r.color : 'var(--text3)',
                  }}>{r.label}</div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={ls}>Approval Rule</label>
              <select className="input" value={data.approval_rule}
                onChange={e => onChange('approval_rule', e.target.value)}>
                {APPROVAL_RULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {data.approval_rule === 'min_count' && (
              <div>
                <label style={ls}>จำนวนคนขั้นต่ำ</label>
                <input className="input" type="number" min={1} value={data.min_count}
                  onChange={e => onChange('min_count', +e.target.value)} />
              </div>
            )}
            {data.approval_rule === 'majority' && (
              <div>
                <label style={ls}>สัดส่วน (%)</label>
                <input className="input" type="number" min={1} max={100} value={data.majority_percent}
                  onChange={e => onChange('majority_percent', +e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <label style={ls}>ถ้า Reject → ทำอะไร</label>
            <select className="input" value={data.on_reject_action}
              onChange={e => onChange('on_reject_action', e.target.value)}>
              {REJECT_ACTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {data.on_reject_action === 'specific_node' && (
            <div style={{ marginTop: 8 }}>
              <label style={ls}>กลับไป Node ไหน</label>
              <select className="input" value={data.on_reject_node_id || ''}
                onChange={e => onChange('on_reject_node_id', e.target.value || null)}>
                <option value="">— เลือก Node —</option>
                {nodes.filter(n => n.id !== selectedNode?.id).map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── acknowledge ── */}
      {data.action_type === 'acknowledge' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f5c542', textTransform: 'uppercase', marginBottom: 8 }}>👁 ผู้รับทราบ</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {roleGroups.map(r => {
              const sel = (data.assignee_ids || []).includes(r.id)
              return (
                <div key={r.id} onClick={() => {
                  const cur = data.assignee_ids || []
                  onChange('assignee_ids', sel ? cur.filter(x => x !== r.id) : [...cur, r.id])
                }} style={{
                  padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                  background: sel ? `${r.color}22` : 'var(--surface3)',
                  border: `1px solid ${sel ? r.color : 'var(--border)'}`,
                  color: sel ? r.color : 'var(--text3)',
                }}>{r.label}</div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── decision ── */}
      {data.action_type === 'decision' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', marginBottom: 8 }}>🔀 ผู้ตัดสินใจเลือกเส้นทาง</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {roleGroups.map(r => {
                const sel = (data.decision_role_ids || []).includes(r.id)
                return (
                  <div key={r.id} onClick={() => {
                    const cur = data.decision_role_ids || []
                    onChange('decision_role_ids', sel ? cur.filter(x => x !== r.id) : [...cur, r.id])
                  }} style={{
                    padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5,
                    background: sel ? `${r.color}22` : 'var(--surface3)',
                    border: `1px solid ${sel ? r.color : 'var(--border)'}`,
                    color: sel ? r.color : 'var(--text3)',
                  }}>{r.label}</div>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={ls}>ตัวเลือกเส้นทาง</label>
              <button className="btn btn-ghost btn-xs" onClick={() =>
                onChange('decision_options', [...(data.decision_options || []), { label: '', next_node_id: '', description: '' }])
              }>+ เพิ่ม</button>
            </div>
            {(data.decision_options || []).map((opt, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                <input className="input" placeholder="ชื่อตัวเลือก" value={opt.label}
                  onChange={e => {
                    const o = [...(data.decision_options || [])]
                    o[i] = { ...o[i], label: e.target.value }
                    onChange('decision_options', o)
                  }} style={{ fontSize: 11 }} />
                <select className="input" value={opt.next_node_id}
                  onChange={e => {
                    const o = [...(data.decision_options || [])]
                    o[i] = { ...o[i], next_node_id: e.target.value }
                    onChange('decision_options', o)
                  }} style={{ fontSize: 11 }}>
                  <option value="">— Node ถัดไป —</option>
                  {nodes.filter(n => n.id !== selectedNode?.id).map(n => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
                <input className="input" placeholder="คำอธิบาย" value={opt.description}
                  onChange={e => {
                    const o = [...(data.decision_options || [])]
                    o[i] = { ...o[i], description: e.target.value }
                    onChange('decision_options', o)
                  }} style={{ fontSize: 11 }} />
                <button onClick={() => onChange('decision_options', (data.decision_options || []).filter((_, j) => j !== i))}
                  style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>กำลังโหลด...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: 14 }}>

      {/* ─── Left: Template List + Node Palette ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-icon">🔀</div>
            <div className="card-title">Flow Templates</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => setShowNewFlow(v => !v)}>+ ใหม่</button>
          </div>
          {showNewFlow && (
            <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
              <input className="input" placeholder="ชื่อ Flow" value={newFlow.name}
                onChange={e => setNewFlow(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="คำอธิบาย" value={newFlow.description}
                onChange={e => setNewFlow(p => ({ ...p, description: e.target.value }))} />
              <button className="btn btn-success btn-sm" style={{ justifyContent: 'center' }}
                onClick={async () => {
                  if (!newFlow.name) return
                  setSaving(true)
                  const { data } = await createFlowTemplate(newFlow)
                  setShowNewFlow(false)
                  setNewFlow({ name: '', description: '' })
                  await loadTemplates()
                  if (data) selectFlow(data as FlowTemplate)
                  setSaving(false)
                }} disabled={saving || !newFlow.name}>✓ สร้าง</button>
            </div>
          )}
          {templates.map(flow => (
            <div key={flow.id} onClick={() => selectFlow(flow)} style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selectedFlow?.id === flow.id ? 'rgba(94,174,255,0.1)' : 'transparent',
              border: `1px solid ${selectedFlow?.id === flow.id ? 'var(--accent2)' : 'transparent'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{flow.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{flow.description}</div>
                </div>
                <button className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); deleteFlowTemplate(flow.id).then(loadTemplates) }}>ลบ</button>
              </div>
            </div>
          ))}
        </div>

        {selectedFlow && (
          <div className="card">
            <div className="card-header"><div className="card-icon">🧩</div><div className="card-title">เพิ่ม Node</div></div>
            {[
              { type: 'start', label: 'START', color: '#3ecf8e' },
              { type: 'step', label: 'ขั้นตอน', color: '#5eaeff' },
              { type: 'decision', label: 'เงื่อนไข', color: '#f5c542' },
              { type: 'end', label: 'END', color: '#a78bfa' },
            ].map(nt => (
              <button key={nt.type} onClick={() => addNode(nt.type)} style={{
                background: `${nt.color}18`, border: `1px solid ${nt.color}`,
                color: nt.color, borderRadius: 7, padding: '7px 12px',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                width: '100%', marginBottom: 6,
              }}>+ {nt.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Center: Canvas ─── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!selectedFlow ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔀</div>
            <div>เลือก Flow Template ทางซ้าย</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedFlow.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{nodes.length} nodes · {edges.length} edges</div>
              {connecting && (
                <div style={{ marginLeft: 'auto', background: 'rgba(245,197,66,0.15)', border: '1px solid var(--yellow)', color: 'var(--yellow)', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                  🔗 คลิก Node ปลายทาง | <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setConnecting(null)}>ยกเลิก</span>
                </div>
              )}
            </div>
            <div ref={canvasRef} style={{
              position: 'relative', overflow: 'auto',
              width: '100%', height: 'calc(100vh - 180px)',
              background: 'radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 24px 24px',
              cursor: connecting ? 'crosshair' : 'default',
            }}
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
              onClick={() => { if (!connecting) setSelectedNode(null) }}>

              <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, pointerEvents: 'none', overflow: 'visible' }}>
                <defs>
                  <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="var(--border2)" />
                  </marker>
                </defs>
                {edges.map(edge => {
                  const path = getEdgePath(edge)
                  if (!path) return null
                  const s = nodes.find(n => n.id === edge.source_id)
                  const t = nodes.find(n => n.id === edge.target_id)
                  if (!s || !t) return null
                  const mx = (s.position_x + t.position_x) / 2 + NODE_W / 2
                  const my = (s.position_y + NODE_H + t.position_y) / 2
                  return (
                    <g key={edge.id} style={{ pointerEvents: 'all' }}>
                      <path d={path} fill="none" stroke="var(--border2)" strokeWidth={1.5} markerEnd="url(#arr)" />
                      <circle cx={mx} cy={my} r={7} fill="var(--surface)" stroke="var(--red)" strokeWidth={1} style={{ cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); handleDeleteEdge(edge) }} />
                      <text x={mx} y={my + 4} textAnchor="middle" fontSize={9} fill="var(--red)" style={{ pointerEvents: 'none' }}>✕</text>
                    </g>
                  )
                })}
              </svg>

              {nodes.map(node => {
                const color = getNodeColor(node)
                const isSelected = selectedNode?.id === node.id
                const lvls = nodeLevels.filter(l => l.node_id === node.id)
                return (
                  <div key={node.id} onMouseDown={e => handleNodeMouseDown(e, node)} style={{
                    position: 'absolute', left: node.position_x, top: node.position_y,
                    width: NODE_W, minHeight: NODE_H,
                    background: `${color}18`, border: `2px solid ${isSelected ? color : `${color}55`}`,
                    borderRadius: node.node_type === 'start' || node.node_type === 'end' ? 30 : 10,
                    padding: '8px 12px', cursor: connecting ? 'crosshair' : 'grab',
                    userSelect: 'none', zIndex: isSelected ? 10 : 1,
                    boxShadow: isSelected ? `0 0 0 3px ${color}33` : 'none',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, textAlign: 'center' }}>{node.label}</div>
                    {lvls.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                        {lvls.map(l => {
                          const at = ACTION_TYPES.find(a => a.value === l.action_type)
                          return (
                            <span key={l.id} title={l.label} style={{
                              fontSize: 9, padding: '1px 4px', borderRadius: 3,
                              background: `${at?.color || '#5eaeff'}18`,
                              border: `1px solid ${at?.color || '#5eaeff'}`,
                              color: at?.color || '#5eaeff',
                            }}>{at?.icon} {l.label}</span>
                          )
                        })}
                      </div>
                    )}
                    {!connecting && node.node_type !== 'end' && (
                      <div onClick={e => { e.stopPropagation(); setConnecting({ sourceId: node.id }) }}
                        style={{
                          position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'var(--surface)', border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, cursor: 'pointer', color, zIndex: 20,
                        }}>+</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Right: Node + Level Editor ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!selectedNode ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>คลิก Node บน Canvas</div>
          </div>
        ) : (
          <div className="card" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
              {(['node', 'levels'] as const).map(t => (
                <div key={t} onClick={() => setActiveTab(t)} style={{
                  flex: 1, padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', borderBottom: `2px solid ${activeTab === t ? 'var(--accent)' : 'transparent'}`,
                  color: activeTab === t ? 'var(--accent)' : 'var(--text3)',
                }}>
                  {t === 'node' ? '⚙️ Node' : `📋 Levels (${selectedNodeLevels.length})`}
                </div>
              ))}
            </div>

            {/* Node Tab */}
            {activeTab === 'node' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={ls}>ชื่อขั้นตอน</label>
                  <input className="input" value={selectedNode.label}
                    onChange={e => setSelectedNode(p => p ? { ...p, label: e.target.value } : p)} />
                </div>
                <div>
                  <label style={ls}>คำอธิบาย</label>
                  <textarea className="input" rows={2} value={selectedNode.description || ''}
                    onChange={e => setSelectedNode(p => p ? { ...p, description: e.target.value } : p)} />
                </div>
                <div>
                  <label style={ls}>Role หลัก</label>
                  <select className="input" value={selectedNode.role_group_id || ''}
                    onChange={e => setSelectedNode(p => p ? { ...p, role_group_id: e.target.value || null } : p)}>
                    <option value="">— ไม่ระบุ —</option>
                    {roleGroups.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveNode} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    💾 บันทึก
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteNode(selectedNode)}>ลบ Node</button>
                </div>
              </div>
            )}

            {/* Levels Tab */}
            {activeTab === 'levels' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowNewLevel(v => !v)}>+ เพิ่ม Level</button>
                </div>

                {/* New Level Form */}
                {showNewLevel && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Level ใหม่</div>
                    {renderLevelForm(newLevel, (k, v) => setNewLevel(p => ({ ...p, [k]: v })))}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowNewLevel(false)}>ยกเลิก</button>
                      <button className="btn btn-success btn-sm" onClick={handleAddLevel} disabled={saving || !newLevel.label}>✓ เพิ่ม</button>
                    </div>
                  </div>
                )}

                {/* Level List */}
                {selectedNodeLevels.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
                    ยังไม่มี Level — กด "+ เพิ่ม Level"
                  </div>
                ) : (
                  selectedNodeLevels.map((level, idx) => {
                    const at = ACTION_TYPES.find(a => a.value === level.action_type)
                    return (
                      <div key={level.id} style={{ marginBottom: 8 }}>
                        {editingLevel?.id === level.id ? (
                          <div style={{ background: 'var(--surface2)', border: `1px solid ${at?.color || 'var(--accent)'}`, borderRadius: 8, padding: 12 }}>
                            {renderLevelForm(editingLevel, (k, v) => setEditingLevel(p => p ? { ...p, [k]: v } : p))}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditingLevel(null)}>ยกเลิก</button>
                              <button className="btn btn-primary btn-sm" onClick={handleSaveLevel} disabled={saving}>💾 บันทึก</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 20, height: 20, borderRadius: '50%', background: `${at?.color}22`, border: `1px solid ${at?.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>{idx + 1}</span>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{level.label}</span>
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: `${at?.color}18`, border: `1px solid ${at?.color}`, color: at?.color }}>{at?.icon} {at?.label}</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button className="btn btn-ghost btn-xs" onClick={() => setEditingLevel({ ...level })}>แก้ไข</button>
                                <button className="btn btn-danger btn-xs" onClick={() => handleDeleteLevel(level)}>ลบ</button>
                              </div>
                            </div>
                            {level.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{level.description}</div>}

                            {/* Summary */}
                            {level.action_type === 'attach' && (
                              <div>
                                {(level.responsible_ids || []).length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                                    {(level.responsible_ids || []).map(id => {
                                      const rg = roleGroups.find(r => r.id === id)
                                      return rg ? <span key={id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${rg.color}18`, border: `1px solid ${rg.color}`, color: rg.color }}>{rg.label}</span> : null
                                    })}
                                  </div>
                                )}
                                {(level.attachments || []).map((a, i) => (
                                  <div key={i} style={{ fontSize: 10.5, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ color: a.required ? 'var(--red)' : 'var(--green)', fontSize: 9 }}>{a.required ? '●' : '○'}</span>
                                    {a.label}
                                  </div>
                                ))}
                              </div>
                            )}
                            {level.action_type === 'review' && (
                              <div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
                                  {(level.assignee_ids || []).map(id => {
                                    const rg = roleGroups.find(r => r.id === id)
                                    return rg ? <span key={id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${rg.color}18`, border: `1px solid ${rg.color}`, color: rg.color }}>{rg.label}</span> : null
                                  })}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                                  Rule: {APPROVAL_RULES.find(r => r.value === level.approval_rule)?.label}
                                  {' '}| Reject: {REJECT_ACTIONS.find(r => r.value === level.on_reject_action)?.label}
                                </div>
                              </div>
                            )}
                            {level.action_type === 'decision' && (
                              <div>
                                {(level.decision_options || []).map((opt, i) => (
                                  <div key={i} style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                                    → {opt.label} {nodes.find(n => n.id === opt.next_node_id) ? `(${nodes.find(n => n.id === opt.next_node_id)?.label})` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
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
  color: 'var(--text3)', marginBottom: 5,
}
