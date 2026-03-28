export interface RoleGroup {
  id: string
  name: string
  label: string
  color: string
  description: string | null
  is_system: boolean
  created_at: string
  permissions?: string[]
}

export interface Permission {
  id: string
  category: string
  label: string
  description: string | null
}

export const PERMISSION_CATEGORIES = ['RFI', 'ADMIN', 'REPORT', 'MAP'] as const

export const CATEGORY_LABEL: Record<string, string> = {
  RFI:    'RFI Management',
  ADMIN:  'Admin',
  REPORT: 'Reports',
  MAP:    'Map',
}