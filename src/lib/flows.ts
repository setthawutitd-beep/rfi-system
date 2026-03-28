import { supabase } from './supabase'

export async function fetchFlowTemplates() {
  const { data } = await supabase
    .from('flow_templates')
    .select('*')
    .order('created_at')
  return data || []
}

export async function fetchFlowDetail(flowId: string) {
  const [{ data: nodes }, { data: edges }, { data: reqs }] = await Promise.all([
    supabase.from('flow_nodes').select('*').eq('flow_id', flowId),
    supabase.from('flow_edges').select('*').eq('flow_id', flowId),
    supabase.from('flow_node_requirements').select('*'),
  ])
  return {
    nodes: nodes || [],
    edges: edges || [],
    requirements: reqs || [],
  }
}

export async function createFlowTemplate(data: { name: string; description: string }) {
  return supabase.from('flow_templates').insert(data).select().single()
}

export async function deleteFlowTemplate(id: string) {
  return supabase.from('flow_templates').delete().eq('id', id)
}

export async function upsertNode(node: {
  id?: string; flow_id: string; node_type: string; label: string
  description?: string; role_group_id?: string | null
  position_x: number; position_y: number; config?: object
}) {
  if (node.id) {
    return supabase.from('flow_nodes').update(node).eq('id', node.id).select().single()
  }
  return supabase.from('flow_nodes').insert(node).select().single()
}

export async function deleteNode(id: string) {
  return supabase.from('flow_nodes').delete().eq('id', id)
}

export async function upsertEdge(edge: {
  id?: string; flow_id: string; source_id: string
  target_id: string; label?: string; condition: string
}) {
  if (edge.id) {
    return supabase.from('flow_edges').update(edge).eq('id', edge.id).select().single()
  }
  return supabase.from('flow_edges').insert(edge).select().single()
}

export async function deleteEdge(id: string) {
  return supabase.from('flow_edges').delete().eq('id', id)
}

export async function setNodeRequirements(nodeId: string, reqs: { label: string; req_type: string; required: boolean }[]) {
  await supabase.from('flow_node_requirements').delete().eq('node_id', nodeId)
  if (reqs.length === 0) return
  return supabase.from('flow_node_requirements').insert(
    reqs.map(r => ({ ...r, node_id: nodeId }))
  )
}