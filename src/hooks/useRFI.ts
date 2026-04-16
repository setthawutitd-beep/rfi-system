import { useState, useEffect, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import {
  supabase, fetchRfis, updateRfiStatus, addHistory,
  addComment, fetchNotifications, markNotificationsRead,
  fetchProfiles, fetchSettings, addNotification,
} from '../lib/supabase'
import type {
  Rfi, Profile, Notification, Settings, RfiStatus,
  HistoryAction, CommentType, UserRole,
} from '../types/rfi'
import { ACTION_NEXT_STATUS } from '../types/rfi'

export function useRFI() {
  const [rfis, setRfis] = useState<Rfi[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Load initial data ────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const [rfiRes, profileRes, settingsRes] = await Promise.all([
        fetchRfis(),
        fetchProfiles(),
        fetchSettings(),
      ])

      if (rfiRes.data) setRfis(rfiRes.data as unknown as Rfi[])
if (profileRes.data) {
  setProfiles(profileRes.data as Profile[])
  const me = profileRes.data.find(p => p.id === session.user.id)
  if (me) setCurrentUser(me as Profile)
}
      if (settingsRes.data) setSettings(settingsRes.data as Settings)

      if (session.user.id) {
        const notifRes = await fetchNotifications(session.user.id)
        if (notifRes.data) setNotifications(notifRes.data as Notification[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Realtime subscriptions ───────────────────────────────────
useEffect(() => {
  // โหลดข้อมูลเมื่อ auth state เปลี่ยน
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      loadAll()
    } else {
      setCurrentUser(null)
      setRfis([])
      setProfiles([])
      setNotifications([])
      setLoading(false)
    }
  })

  // โหลดครั้งแรก
  loadAll()

  return () => {
    subscription.unsubscribe()
  }
}, [])

  // ─── Actions ─────────────────────────────────────────────────
  const doAction = useCallback(async (
    rfiId: string,
    actionKey: string,
    remark: string = ''
  ) => {
    if (!currentUser) return { error: 'Not logged in' }

    const rfi = rfis.find(r => r.id === rfiId)
    if (!rfi) return { error: 'RFI not found' }

    const nextStatus = ACTION_NEXT_STATUS[actionKey]
    if (!nextStatus) return { error: 'Unknown action' }

    const actionMap: Record<string, HistoryAction> = {
      approve_qc: 'approve', reject_qc: 'reject',
      approve_consult: 'approve', reject_consult: 'reject',
      approve_resubmit: 'approve', reject_resubmit: 'reject',
      resubmit: 'resubmit',
      complete_inspect: 'inspect',
      close_pm: 'close',
    }
    const commentTypeMap: Record<string, CommentType> = {
      approve_qc: 'approve', reject_qc: 'reject',
      approve_consult: 'approve', reject_consult: 'reject',
      approve_resubmit: 'approve', reject_resubmit: 'reject',
      resubmit: 'resubmit',
      complete_inspect: 'approve',
      close_pm: 'approve',
    }

    const noteMap: Record<string, string> = {
      approve_qc: 'ผ่าน QC L1',
      reject_qc: `ตีกลับ — ${remark || 'ไม่ผ่าน QC'}`,
      approve_consult: 'Approved by Consultant',
      reject_consult: `ตีกลับโดย Consultant — ${remark}`,
      approve_resubmit: 'Accept Re-submit → กลับ QC',
      reject_resubmit: `ตีกลับอีกครั้ง — ${remark}`,
      resubmit: `Re-submit: ${remark || 'ส่งคำขอใหม่'}`,
      complete_inspect: 'ตรวจหน้างานเสร็จสิ้น',
      close_pm: 'PM Verify & Closed',
    }

    const resubmitCount = actionKey === 'resubmit'
      ? rfi.resubmit_count + 1
      : undefined

    // Update RFI status
    const { error: statusErr } = await updateRfiStatus(rfiId, nextStatus, resubmitCount)
    if (statusErr) return { error: statusErr.message }

    // Add history
    await addHistory({
      rfi_id: rfiId,
      action: actionMap[actionKey] || 'comment',
      user_id: currentUser.id,
      note: noteMap[actionKey] || remark,
    })

    // Add comment if remark exists
    if (remark.trim()) {
      await addComment({
        rfi_id: rfiId,
        user_id: currentUser.id,
        text: remark,
        type: commentTypeMap[actionKey] || 'comment',
      })
    }

    // Notify requester
    if (rfi.requester_id !== currentUser.id) {
      const iconMap: Record<string, string> = {
        approve_qc: '✅', reject_qc: '🔴', approve_consult: '✅',
        reject_consult: '🔴', resubmit: '♻️', complete_inspect: '🔍',
        close_pm: '🎉',
      }
      await addNotification({
        user_id: rfi.requester_id,
        rfi_id: rfiId,
        message: `${rfiId} — ${noteMap[actionKey]}`,
        icon: iconMap[actionKey] || '📋',
      })
    }

    return { error: null }
  }, [currentUser, rfis])

  const postComment = useCallback(async (rfiId: string, text: string) => {
    if (!currentUser || !text.trim()) return
    await addComment({ rfi_id: rfiId, user_id: currentUser.id, text, type: 'comment' })
  }, [currentUser])

  const markAllRead = useCallback(async () => {
    if (!currentUser) return
    await markNotificationsRead(currentUser.id)
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
  }, [currentUser])

  const switchRole = useCallback((role: UserRole) => {
    if (!currentUser) return
    setCurrentUser({ ...currentUser, role })
  }, [currentUser])

  return {
    rfis, profiles, notifications, settings, currentUser,
    loading, error,
    doAction, postComment, markAllRead, switchRole,
    reload: loadAll,
  }
}