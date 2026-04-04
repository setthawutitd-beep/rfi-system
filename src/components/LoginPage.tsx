import { useState } from 'react'
import { signIn } from '../lib/supabase'

interface Props {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error: authError } = await signIn(email, password)
    if (authError) {
      setError(authError.message)
    } else {
      onLogin()
    }
    setLoading(false)
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '32px 36px', width: 380,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, background: 'var(--accent)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
            fontFamily: 'IBM Plex Mono, monospace',
          }}>R</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>RFI System</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>TTT Land Reclamation · v2.0</div>
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>เข้าสู่ระบบ</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 24 }}>RFI Management System</div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Email</div>
            <input
              className="input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Password</div>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-bg)', border: '1px solid var(--red)',
              borderRadius: 7, padding: '8px 12px', marginBottom: 14,
              fontSize: 12, color: 'var(--red)',
            }}>{error}</div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={loading}>
            {loading ? '⟳ กำลังเข้าสู่ระบบ...' : '→ เข้าสู่ระบบ'}
          </button>
        </form>

        
        <div style={{ marginTop: 20, padding: '14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Demo Accounts — กดเพื่อเข้าระบบเลย</div>
          {[
            { email: 'contractor@ttt.co.th', role: 'CONTRACTOR', color: 'var(--orange)' },
            { email: 'qc@ttt.co.th', role: 'QC ENG.', color: 'var(--yellow)' },
            { email: 'consultant@ttt.co.th', role: 'CONSULTANT', color: 'var(--accent2)' },
            { email: 'survey@ttt.co.th', role: 'SURVEY', color: '#2dd4bf' },
            { email: 'lab@ttt.co.th', role: 'LAB', color: '#a78bfa' },
            { email: 'pm@ttt.co.th', role: 'PM', color: 'var(--purple)' },
          ].map(u => (
            <div
              key={u.email}
              onClick={async () => {
                setLoading(true)
                setError('')
                const { error: authError } = await signIn(u.email, 'password123')
                if (authError) setError(authError.message)
                else onLogin()
                setLoading(false)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 8px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                borderRadius: 6, marginBottom: 2,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface3)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{u.email}</span>
              <span style={{ fontSize: 10, color: u.color, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>
                {loading ? '⟳' : u.role} →
              </span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>password: password123</div>
        </div>
      </div>
    </div>
  )
}
