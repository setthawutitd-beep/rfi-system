import { useState, useEffect, useRef, useCallback } from 'react'
import type { RoleGroup } from '../types/roles'
import {
  fetchFlowTemplates, fetchFlowDetail, createFlowTemplate,
  deleteFlowTemplate, upsertNode, deleteNode, upsertEdge, deleteEdge,
  setNodeRequirements,
} from '../lib/flows'

interface FlowTemplate { id: string; name: string; description: string; is_active: boolean }
interface FlowNode {
  id: string; flow_id: string; node_type: string; label: string
  description?: string; role_group_id?: string | null
  role_group_ids?: string[]
  position_x: number; position_y: number; config?: object
}
interface FlowEdge {
  id: string; flow_id: string; source_id: string; target_id: string
  label?: string; condition: string
}
interface FlowReq {
  id: string; node_id: string; label: string; req_type: string
  required: boolean; instructions?: string
  responsible_role_group_id?: string | null
  responsible_user_id?: string | null
}

interface Props {
  roleGroups: RoleGroup[]
  profiles: { id: string; name: string; role: string; color: string }[]
  onToast: (title: string, msg: string, type: 'success' | 'error' | 'info') => void
}

const NODE_TYPES = [
  { type: 'start',    label: 'START',    color: '#3ecf8e' },
  { type: 'step',     label: 'ขั้นตอน', color: '#5eaeff' },
  { type: 'decision', label: 'เงื่อนไข', color: '#f5c542' },
  { type: 'end',      label: 'END',      color: '#a78bfa' },
]

const NODE_W = 180
const NODE_H = 60

export default function FlowBuilder({ roleGroups, profiles, onToast }: Props) {
  const [templates, setTemplates] = useState<FlowTemplate[]>([])
  const [selectedFlow, setSelectedFlow] = useState<FlowTemplate | null>(null)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [reqs, setReqs] = useState<FlowReq[]>([])
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [connecting, setConnecting] = useState<{ sourceId: string } | null>(null)
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [newFlow, setNewFlow] = useState({ name: '', description: '' })
  const [editReqs, setEditReqs] = useState<Omit<FlowReq, 'id' | 'node_id'>[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
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
    const { nodes: n, edges: e, requirements: r } = await fetchFlowDetail(flow.id)
    setNodes(n as FlowNode[])
    setEdges(e as FlowEdge[])
    setReqs(r as FlowReq[])
  }

  const handleCreateFlow = async () => {
    if (!newFlow.name) return
    setSaving(true)
    const { data, error } = await createFlowTemplate(newFlow)
    if (error) { onToast('Error', error.message, 'error') }
    else {
      onToast('สร้างแล้ว', `Flow "${newFlow.name}" พร้อมใช้งาน`, 'success')
      setShowNewFlow(false)
      setNewFlow({ name: '', description: '' })
      await loadTemplates()
      if (data) selectFlow(data as FlowTemplate)
    }
    setSaving(false)
  }

  const addNode = async (type: string) => {
    if (!selectedFlow) return
    const cfg = NODE_TYPES.find(n => n.type === type)!
    const { data } = await upsertNode({
      flow_id: selectedFlow.id, node_type: type,
      label: type === 'start' ? 'START' : type === 'end' ? 'END' : 'ขั้นตอนใหม่',
      position_x: 100 + (nodes.length % 3) * 60,
      position_y: 80 + nodes.length * 30,
      config: { color: cfg.color },
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
    setEditReqs(reqs.filter(r => r.node_id === node.id).map(r => ({
      label: r.label, req_type: r.req_type, required: r.required,
      instructions: r.instructions || '',
      responsible_role_group_id: r.responsible_role_group_id || null,
      responsible_user_id: r.responsible_user_id || null,
    })))
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
      target_id: targetId, condition: 'yes', label: 'Yes',
    })
    if (data) setEdges(prev => [...prev, data as FlowEdge])
    onToast('เชื่อมแล้ว', 'เพิ่ม Connection สำเร็จ', 'success')
  }

  const handleDeleteNode = async (node: FlowNode) => {
    await deleteNode(node.id)
    setNodes(prev => prev.filter(n => n.id !== node.id))
    setEdges(prev => prev.filter(e => e.source_id !== node.id && e.target_id !== node.id))
    setReqs(prev => prev.filter(r => r.node_id !== node.id))
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
    await setNodeRequirements(selectedNode.id, editReqs)
    const fresh = await fetchFlowDetail(selectedFlow!.id)
    setReqs(fresh.requirements as FlowReq[])
    setNodes(prev => prev.map(n => n.id === selectedNode.id ? selectedNode : n))
    onToast('บันทึกแล้ว', selectedNode.label, 'success')
    setSaving(false)
  }

  const getNodeColor = (node: FlowNode) => {
    const cfg = node.config as { color?: string } | undefined
    return cfg?.color || NODE_TYPES.find(t => t.type === node.node_type)?.color || '#5eaeff'
  }

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>กำลังโหลด...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>

      {/* ─── Left Panel ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Flow List */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">🔀</div>
            <div className="card-title">Flow Templates</div>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNewFlow(v => !v)}>+ ใหม่</button>
          </div>
          {showNewFlow && (
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8, padding: '10px', background: 'var(--surface2)', borderRadius: 8 }}>
              <input className="input" placeholder="ชื่อ Flow" value={newFlow.name} onChange={e => setNewFlow(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="คำอธิบาย" value={newFlow.description} onChange={e => setNewFlow(p => ({ ...p, description: e.target.value }))} />
              <button className="btn btn-success" onClick={handleCreateFlow} disabled={saving || !newFlow.name} style={{ justifyContent: 'center' }}>✓ สร้าง</button>
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

        {/* Node Palette */}
        {selectedFlow && (
          <div className="card">
            <div className="card-header"><div className="card-icon">🧩</div><div className="card-title">เพิ่ม Node</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {NODE_TYPES.map(nt => (
                <button key={nt.type} onClick={() => addNode(nt.type)} style={{
                  background: `${nt.color}18`, border: `1px solid ${nt.color}`,
                  color: nt.color, borderRadius: 7, padding: '7px 12px',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}>+ {nt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Node Editor */}
        {selectedNode && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon">✏️</div>
              <div className="card-title">แก้ไข Node</div>
              <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }} onClick={() => handleDeleteNode(selectedNode)}>ลบ Node</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ชื่อ */}
              <div>
                <label style={labelStyle}>ชื่อขั้นตอน</label>
                <input className="input" value={selectedNode.label}
                  onChange={e => setSelectedNode(p => p ? { ...p, label: e.target.value } : p)} />
              </div>

              {/* คำอธิบาย */}
              <div>
                <label style={labelStyle}>คำอธิบาย</label>
                <textarea className="input" rows={2} placeholder="รายละเอียดขั้นตอน"
                  value={selectedNode.description || ''}
                  onChange={e => setSelectedNode(p => p ? { ...p, description: e.target.value } : p)} />
              </div>

              {/* Role รับผิดชอบ — เลือกกลุ่มหรือคนเดียว */}
              <div>
                <label style={labelStyle}>Role หลักที่รับผิดชอบ</label>
                <select className="input" value={selectedNode.role_group_id || ''}
                  onChange={e => setSelectedNode(p => p ? { ...p, role_group_id: e.target.value || null } : p)}>
                  <option value="">— ไม่ระบุ —</option>
                  <optgroup label="กลุ่ม Role">
                    {roleGroups.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* เพิ่มหลาย Role */}
              <div>
                <label style={labelStyle}>Role เพิ่มเติมที่เกี่ยวข้อง</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {roleGroups.map(r => {
                    const selected = (selectedNode.role_group_ids || []).includes(r.id)
                    return (
                      <div key={r.id} onClick={() => {
                        const cur = selectedNode.role_group_ids || []
                        setSelectedNode(p => p ? {
                          ...p,
                          role_group_ids: selected ? cur.filter(x => x !== r.id) : [...cur, r.id]
                        } : p)
                      }} style={{
                        padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                        background: selected ? `${r.color}22` : 'var(--surface2)',
                        border: `1px solid ${selected ? r.color : 'var(--border)'}`,
                        color: selected ? r.color : 'var(--text2)',
                      }}>{r.label}</div>
                    )
                  })}
                </div>
              </div>

              {/* เอกสาร/เงื่อนไขที่ต้องการ */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={labelStyle}>เอกสาร / เงื่อนไขที่ต้องการ</label>
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditReqs(p => [...p, {
                    label: '', req_type: 'attachment', required: true,
                    instructions: '', responsible_role_group_id: null, responsible_user_id: null,
                  }])}>+ เพิ่ม</button>
                </div>

                {editReqs.length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>
                    ยังไม่มีเอกสาร — กด + เพิ่ม
                  </div>
                )}

                {editReqs.map((r, i) => (
                  <div key={i} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 10, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input className="input" placeholder="ชื่อเอกสาร / เงื่อนไข" value={r.label}
                        onChange={e => setEditReqs(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        style={{ flex: 1 }} />
                      <button onClick={() => setEditReqs(p => p.filter((_, j) => j !== i))}
                        style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                      {/* ประเภท */}
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>ประเภท</div>
                        <select className="input" value={r.req_type} style={{ fontSize: 11 }}
                          onChange={e => setEditReqs(p => p.map((x, j) => j === i ? { ...x, req_type: e.target.value } : x))}>
                          <option value="attachment">ไฟล์แนบ</option>
                          <option value="approval">ลายเซ็น/อนุมัติ</option>
                          <option value="check">เช็คลิสต์</option>
                          <option value="report">รายงาน</option>
                        </select>
                      </div>

                      {/* บังคับหรือไม่ */}
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>บังคับ</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          {[true, false].map(v => (
                            <div key={String(v)} onClick={() => setEditReqs(p => p.map((x, j) => j === i ? { ...x, required: v } : x))}
                              style={{
                                flex: 1, textAlign: 'center', padding: '5px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                                background: r.required === v ? (v ? 'rgba(240,80,96,0.15)' : 'rgba(62,207,142,0.15)') : 'var(--surface3)',
                                border: `1px solid ${r.required === v ? (v ? 'var(--red)' : 'var(--green)') : 'var(--border)'}`,
                                color: r.required === v ? (v ? 'var(--red)' : 'var(--green)') : 'var(--text3)',
                              }}>{v ? 'บังคับ' : 'Optional'}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Role ที่รับผิดชอบส่งเอกสารนี้ */}
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', fontWeight: 700 }}>ผู้รับผิดชอบส่งเอกสารนี้</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <select className="input" value={r.responsible_role_group_id || ''} style={{ fontSize: 11 }}
                          onChange={e => setEditReqs(p => p.map((x, j) => j === i ? { ...x, responsible_role_group_id: e.target.value || null, responsible_user_id: null } : x))}>
                          <option value="">— กลุ่ม Role —</option>
                          {roleGroups.map(rg => <option key={rg.id} value={rg.id}>{rg.label}</option>)}
                        </select>
                        <select className="input" value={r.responsible_user_id || ''} style={{ fontSize: 11 }}
                          onChange={e => setEditReqs(p => p.map((x, j) => j === i ? { ...x, responsible_user_id: e.target.value || null, responsible_role_group_id: null } : x))}>
                          <option value="">— เฉพาะคน —</option>
                          {profiles.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* คำแนะนำ */}
                    <div style={{ marginTop: 6 }}>
                      <input className="input" placeholder="คำแนะนำ / instruction สำหรับผู้ส่งเอกสาร"
                        value={r.instructions || ''}
                        onChange={e => setEditReqs(p => p.map((x, j) => j === i ? { ...x, instructions: e.target.value } : x))}
                        style={{ fontSize: 11 }} />
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn btn-primary" onClick={saveNode} disabled={saving} style={{ justifyContent: 'center' }}>
                {saving ? '⟳ บันทึก...' : '💾 บันทึก Node'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Canvas ─── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!selectedFlow ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔀</div>
            <div style={{ fontSize: 14 }}>เลือก Flow ทางซ้ายเพื่อเริ่มแก้ไข</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedFlow.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{nodes.length} nodes · {edges.length} edges</div>
              {connecting && (
                <div style={{
                  marginLeft: 'auto', background: 'rgba(245,197,66,0.15)',
                  border: '1px solid var(--yellow)', color: 'var(--yellow)',
                  borderRadius: 6, padding: '4px 10px', fontSize: 12,
                }}>
                  🔗 คลิก Node ปลายทาง |{' '}
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setConnecting(null)}>ยกเลิก</span>
                </div>
              )}
            </div>

            <div ref={canvasRef}
              style={{
                position: 'relative', overflow: 'auto',
                width: '100%', height: 'calc(100vh - 180px)',
                background: 'radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 24px 24px',
                cursor: connecting ? 'crosshair' : 'default',
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={() => { if (!connecting) setSelectedNode(null) }}
            >
              {/* SVG Edges */}
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
                  const isNo = edge.condition === 'no'
                  return (
                    <g key={edge.id} style={{ pointerEvents: 'all' }}>
                      <path d={path} fill="none"
                        stroke={isNo ? 'var(--red)' : 'var(--border2)'}
                        strokeWidth={isNo ? 2 : 1.5}
                        strokeDasharray={isNo ? '6 3' : 'none'}
                        markerEnd="url(#arr)" />
                      {edge.label && (
                        <text x={mx} y={my - 4} textAnchor="middle" fontSize={10}
                          fill={isNo ? 'var(--red)' : 'var(--text3)'}>{edge.label}</text>
                      )}
                      <circle cx={mx} cy={my + 8} r={7} fill="var(--surface)"
                        stroke="var(--red)" strokeWidth={1} style={{ cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); handleDeleteEdge(edge) }} />
                      <text x={mx} y={my + 12} textAnchor="middle" fontSize={9}
                        fill="var(--red)" style={{ pointerEvents: 'none' }}>✕</text>
                    </g>
                  )
                })}
              </svg>

              {/* Nodes */}
              {nodes.map(node => {
                const color = getNodeColor(node)
                const isSelected = selectedNode?.id === node.id
                const mainRole = roleGroups.find(r => r.id === node.role_group_id)
                const extraRoles = (node.role_group_ids || []).map(id => roleGroups.find(r => r.id === id)).filter(Boolean)
                const nodeReqs = reqs.filter(r => r.node_id === node.id)

                return (
                  <div key={node.id} onMouseDown={e => handleNodeMouseDown(e, node)}
                    style={{
                      position: 'absolute', left: node.position_x, top: node.position_y,
                      width: NODE_W, minHeight: NODE_H,
                      background: `${color}18`,
                      border: `2px solid ${isSelected ? color : `${color}55`}`,
                      borderRadius: node.node_type === 'start' || node.node_type === 'end' ? 30 : 10,
                      padding: '8px 12px', cursor: connecting ? 'crosshair' : 'grab',
                      userSelect: 'none', zIndex: isSelected ? 10 : 1,
                      boxShadow: isSelected ? `0 0 0 3px ${color}33` : 'none',
                    }}
                  >
                    {/* Label */}
                    <div style={{ fontSize: 12, fontWeight: 700, color, textAlign: 'center' }}>{node.label}</div>

                    {/* Main Role */}
                    {mainRole && (
                      <div style={{
                        fontSize: 9, textAlign: 'center', marginTop: 3,
                        color: mainRole.color, fontFamily: 'IBM Plex Mono, monospace',
                      }}>👤 {mainRole.label}</div>
                    )}

                    {/* Extra Roles */}
                    {extraRoles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', marginTop: 2 }}>
                        {extraRoles.map(r => r && (
                          <span key={r.id} style={{
                            fontSize: 8, padding: '1px 4px', borderRadius: 3,
                            background: `${r.color}22`, border: `1px solid ${r.color}`, color: r.color,
                          }}>{r.label}</span>
                        ))}
                      </div>
                    )}

                    {/* Requirements */}
                    {nodeReqs.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                        {nodeReqs.map(r => {
                          const respRole = roleGroups.find(rg => rg.id === r.responsible_role_group_id)
                          const respUser = profiles.find(u => u.id === r.responsible_user_id)
                          return (
                            <span key={r.id} title={`${r.required ? 'บังคับ' : 'Optional'}${respRole ? ` — ส่งโดย: ${respRole.label}` : ''}${respUser ? ` — ส่งโดย: ${respUser.name}` : ''}`}
                              style={{
                                fontSize: 8, padding: '1px 5px', borderRadius: 3,
                                background: r.required ? 'rgba(240,80,96,0.12)' : 'rgba(94,174,255,0.12)',
                                border: `1px solid ${r.required ? 'var(--red)' : 'var(--accent2)'}`,
                                color: r.required ? 'var(--red)' : 'var(--accent2)',
                                cursor: 'help',
                              }}>{r.label}</span>
                          )
                        })}
                      </div>
                    )}

                    {/* Connect Button */}
                    {!connecting && node.node_type !== 'end' && (
                      <div onClick={e => { e.stopPropagation(); setConnecting({ sourceId: node.id }) }}
                        style={{
                          position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'var(--surface)', border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, cursor: 'pointer', color, zIndex: 20,
                        }} title="เชื่อมกับ Node อื่น">+</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
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