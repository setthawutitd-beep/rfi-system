import { supabase } from './supabase'

export async function fetchRoleGroups() {
  const { data: groups } = await supabase
    .from('role_groups')
    .select('*')
    .order('created_at')

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('role_group_id, permission_id')

  return (groups || []).map(g => ({
    ...g,
    permissions: (perms || [])
      .filter(p => p.role_group_id === g.id)
      .map(p => p.permission_id)
  }))
}

export async function fetchPermissions() {
  const { data } = await supabase
    .from('permissions')
    .select('*')
    .order('category')
  return data || []
}

export async function createRoleGroup(data: {
  name: string
  label: string
  color: string
  description: string
}) {
  return supabase.from('role_groups').insert(data).select().single()
}

export async function updateRoleGroup(id: string, data: {
  label?: string
  color?: string
  description?: string
}) {
  return supabase.from('role_groups').update(data).eq('id', id)
}

export async function deleteRoleGroup(id: string) {
  return supabase.from('role_groups').delete().eq('id', id)
}

export async function setRolePermissions(
  roleGroupId: string,
  permissionIds: string[]
) {
  await supabase
    .from('role_permissions')
    .delete()
    .eq('role_group_id', roleGroupId)

  if (permissionIds.length === 0) return

  return supabase.from('role_permissions').insert(
    permissionIds.map(pid => ({
      role_group_id: roleGroupId,
      permission_id: pid,
    }))
  )
}