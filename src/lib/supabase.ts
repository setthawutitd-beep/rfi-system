import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// ─── Auth helpers ────────────────────────────────────────────────
export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}

// ─── RFI queries ─────────────────────────────────────────────────
export async function fetchRfis() {
  return supabase
    .from('rfis')
    .select(`
      *,
      requester:profiles!rfis_requester_id_fkey(id, name, role, avatar, color),
      history:rfi_history(*, user:profiles!rfi_history_user_id_fkey(id, name, role, avatar, color)),
      comments:rfi_comments(*, user:profiles!rfi_comments_user_id_fkey(id, name, role, avatar, color)),
      attachments:rfi_attachments(*, uploader:profiles!rfi_attachments_uploaded_by_fkey(id, name))
    `)
    .order('created_at', { ascending: false })
}

export async function fetchRfi(id: string) {
  return supabase
    .from('rfis')
    .select(`
      *,
      requester:profiles!rfis_requester_id_fkey(id, name, role, avatar, color),
      history:rfi_history(*, user:profiles!rfi_history_user_id_fkey(id, name, role, avatar, color)),
      comments:rfi_comments(*, user:profiles!rfi_comments_user_id_fkey(id, name, role, avatar, color)),
      attachments:rfi_attachments(*, uploader:profiles!rfi_attachments_uploaded_by_fkey(id, name))
    `)
    .eq('id', id)
    .single()
}

export async function createRfi(data: {
  id: string
  type: string
  discipline: string
  location: string
  zone: string
  description: string
  priority: string
  team: string[]
  inspect_date: string | null
  requester_id: string
}) {
  return supabase.from('rfis').insert(data).select().single()
}

export async function updateRfiStatus(
  rfiId: string,
  status: string,
  resubmit_count?: number
) {
  const update: Record<string, unknown> = { status }
  if (resubmit_count !== undefined) update.resubmit_count = resubmit_count
  return supabase.from('rfis').update(update).eq('id', rfiId)
}

export async function addHistory(data: {
  rfi_id: string
  action: string
  user_id: string
  note: string
}) {
  return supabase.from('rfi_history').insert(data)
}

export async function addComment(data: {
  rfi_id: string
  user_id: string
  text: string
  type: string
}) {
  return supabase.from('rfi_comments').insert(data).select(`
    *, user:profiles!rfi_comments_user_id_fkey(id, name, role, avatar, color)
  `).single()
}

export async function addNotification(data: {
  user_id: string
  rfi_id?: string
  message: string
  icon: string
}) {
  return supabase.from('notifications').insert(data)
}

export async function fetchNotifications(userId: string) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
}

export async function markNotificationsRead(userId: string) {
  return supabase
    .from('notifications')
    .update({ unread: false })
    .eq('user_id', userId)
    .eq('unread', true)
}

export async function fetchProfiles() {
  return supabase.from('profiles').select('*').order('name')
}

export async function fetchSettings() {
  return supabase.from('settings').select('*').single()
}

export async function updateSettings(id: string, data: Record<string, unknown>) {
  return supabase.from('settings').update(data).eq('id', id)
}

// ─── File upload ──────────────────────────────────────────────────
export async function uploadFile(rfiId: string, file: File, userId: string) {
  const ext = file.name.split('.').pop()
  const path = `${rfiId}/${userId}-${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('rfi-attachments')
    .upload(path, file)
  if (uploadError) return { error: uploadError }

  return supabase.from('rfi_attachments').insert({
    rfi_id: rfiId,
    filename: file.name,
    storage_path: path,
    file_size: file.size,
    uploaded_by: userId,
  })
}

export async function getFileUrl(path: string) {
  return supabase.storage
    .from('rfi-attachments')
    .createSignedUrl(path, 3600) // 1 hour
}

export async function fetchRfiFlow(flowTemplateId: string) {
  const [{ data: nodes }, { data: edges }, { data: reqs }] = await Promise.all([
    supabase.from('flow_nodes').select('*').eq('flow_id', flowTemplateId).order('position_y'),
    supabase.from('flow_edges').select('*').eq('flow_id', flowTemplateId),
    supabase.from('flow_node_requirements').select('*'),
  ])
  return {
    nodes: nodes || [],
    edges: edges || [],
    requirements: reqs || [],
  }
}
export async function fetchWorkCategories() {
  const { data } = await supabase
    .from('work_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  return data || []
}

export async function fetchRfiFlowFull(flowTemplateId: string, currentNodeId: string) {
  const [{ data: nodes }, { data: edges }, { data: levels }] = await Promise.all([
    supabase.from('flow_nodes').select('*').eq('flow_id', flowTemplateId).order('position_y'),
    supabase.from('flow_edges').select('*').eq('flow_id', flowTemplateId),
    supabase.from('flow_node_levels').select('*').order('sort_order'),
  ])
  return {
    nodes: nodes || [],
    edges: edges || [],
    levels: levels || [],
    currentNode: (nodes || []).find((n: any) => n.id === currentNodeId) || null,
  }
}

export async function advanceRfiNode(rfiId: string, nextNodeId: string) {
  return supabase.from('rfis').update({ current_node_id: nextNodeId }).eq('id', rfiId)
}

export async function fetchRfiDocRequests(rfiId: string) {
  return supabase.from('rfi_doc_requests').select('*').eq('rfi_id', rfiId).order('sort_order')
}

export async function fetchRfiDocSubmissions(rfiId: string) {
  return supabase.from('rfi_doc_submissions').select('*, submitted_by_profile:profiles(name, color)').eq('rfi_id', rfiId)
}
