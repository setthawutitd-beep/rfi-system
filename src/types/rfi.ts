// ═══════════════════════════════════════════════════════════════
// RFI System — TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type RfiStatus = 'open' | 'qc' | 'consult' | 'inspect' | 'resubmit' | 'reject' | 'closed'
export type RfiPriority = 'high' | 'medium' | 'low'
export type RfiDiscipline = 'CIV' | 'STR' | 'ARC' | 'MEP' | 'GEO'
export type UserRole = 'contractor' | 'qc' | 'consultant' | 'pm' | 'admin'
export type HistoryAction = 'submit' | 'approve' | 'reject' | 'resubmit' | 'inspect' | 'complete' | 'close' | 'comment'
export type CommentType = 'approve' | 'reject' | 'comment' | 'resubmit'

export interface Profile {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string
  color: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface Rfi {
  id: string
  type: string
  discipline: RfiDiscipline
  location: string
  zone: string
  description: string
  status: RfiStatus
  priority: RfiPriority
  team: string[]
  inspect_date: string | null
  resubmit_count: number
  requester_id: string
  created_at: string
  updated_at: string
  // Joined
  requester?: Profile
  history?: RfiHistory[]
  comments?: RfiComment[]
  attachments?: RfiAttachment[]
    flow_template_id?: string | null
  current_node_id?: string | null
}

export interface RfiHistory {
  id: string
  rfi_id: string
  action: HistoryAction
  user_id: string
  note: string | null
  created_at: string
  // Joined
  user?: Profile
}

export interface RfiComment {
  id: string
  rfi_id: string
  user_id: string
  text: string
  type: CommentType
  created_at: string
  // Joined
  user?: Profile
}

export interface RfiAttachment {
  id: string
  rfi_id: string
  filename: string
  storage_path: string
  file_size: number | null
  uploaded_by: string
  created_at: string
  // Joined
  uploader?: Profile
}

export interface Notification {
  id: string
  user_id: string
  rfi_id: string | null
  message: string
  icon: string
  unread: boolean
  created_at: string
}

export interface Settings {
  id: string
  project_name: string
  project_code: string
  workflow_data: WorkflowConfig
  lead_times: LeadTimeConfig[]
  disciplines: Record<RfiDiscipline, DisciplineConfig>
  updated_at: string
}

export interface WorkflowConfig {
  leadTimeDays: number
  cutoffTime: string
  maxResubmit: number
  requireReason: boolean
  requireAttachment: boolean
}

export interface LeadTimeConfig {
  disc: RfiDiscipline
  type: string
  leadDays: number
  cutoff: string
  duration: number
}

export interface DisciplineConfig {
  color: string
  active: boolean
  steps: string[]
}



// ─── Constants ───────────────────────────────────────────────
export const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  contractor:  { label: 'Contractor',   color: '#fb923c', icon: 'ส' },
  qc:          { label: 'QC Engineer',  color: '#f5c542', icon: 'ว' },
  consultant:  { label: 'Consultant',   color: '#5eaeff', icon: 'น' },
  pm:          { label: 'PM',           color: '#a78bfa', icon: 'ธ' },
  admin:       { label: 'Admin',        color: '#f07060', icon: 'A' },
  inspector:   { label: 'Inspector',    color: '#3ecf8e', icon: 'I' },
  survey:      { label: 'Survey',       color: '#2dd4bf', icon: 'ส' },
  lab:         { label: 'Lab',          color: '#a78bfa', icon: 'ล' },
}

export const WORKFLOWS: Record<RfiDiscipline, string[]> = {
  CIV: ['Open', 'QC L1', 'Consultant L2', 'Site Inspection', 'PM Verify', 'Closed'],
  STR: ['Open', 'QC L1', 'Structural Review', 'Site Inspection', 'Closed'],
  ARC: ['Open', 'QC L1', 'Architect Review', 'Closed'],
  MEP: ['Open', 'QC L1', 'MEP Specialist', 'Site Inspection', 'Closed'],
  GEO: ['Open', 'QC L1', 'Geotech Expert', 'Lab Test', 'Closed'],
}

export const WORK_TYPES: Record<string, { disc: RfiDiscipline; duration: number }> = {
  'Soil Testing':       { disc: 'CIV', duration: 60 },
  'Concrete Pouring':   { disc: 'CIV', duration: 90 },
  'Rebar Inspection':   { disc: 'STR', duration: 45 },
  'Steel Frame Check':  { disc: 'STR', duration: 120 },
  'Facade Inspection':  { disc: 'ARC', duration: 60 },
  'Pipe Installation':  { disc: 'MEP', duration: 90 },
  'Foundation Testing': { disc: 'GEO', duration: 180 },
}

export const STATUS_LABEL: Record<RfiStatus, string> = {
  open:     'Open',
  qc:       'Pending QC',
  consult:  'In Consult',
  inspect:  'Inspection',
  resubmit: 'Re-submitted',
  reject:   'Rejected',
  closed:   'Closed',
}

export const STATUS_BADGE_CLASS: Record<RfiStatus, string> = {
  open:     'badge-open',
  qc:       'badge-qc',
  consult:  'badge-consult',
  inspect:  'badge-inspect',
  resubmit: 'badge-resubmit',
  reject:   'badge-reject',
  closed:   'badge-closed',
}

export const PRIORITY_COLOR: Record<RfiPriority, string> = {
  high:   'var(--red)',
  medium: 'var(--yellow)',
  low:    'var(--text3)',
}

// Next status transition per action
export const ACTION_NEXT_STATUS: Record<string, RfiStatus> = {
  approve_qc:       'consult',
  reject_qc:        'reject',
  approve_consult:  'inspect',
  reject_consult:   'reject',
  approve_resubmit: 'qc',
  reject_resubmit:  'reject',
  resubmit:         'resubmit',
  complete_inspect: 'inspect',
  close_pm:         'closed',
}
