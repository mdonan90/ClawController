import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setStoredApiKey, getStoredApiKey } from '../api'
import clawLogo from '../assets/clawcontroller-logo.jpg'
import { Key, ArrowRight, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // If already has key, go home
    if (getStoredApiKey()) {
      navigate('/')
    }
  }, [navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('API Key is required')
      return
    }

    setStoredApiKey(apiKey.trim())
    // Hard redirect to home to trigger a full app re-initialization
    window.location.href = '/'
  }

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: '2rem' }}>
      <div className="loading-content">
        <img src={clawLogo} alt="ClawController" className="loading-logo" />
        <h2>ClawController</h2>
        <p style={{ color: 'var(--accent)', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Security Portal
        </p>
      </div>

      <div style={{
        background: 'var(--bg-secondary)',
        padding: '2.5rem',
        borderRadius: '1.5rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Authentication Required</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Enter your API Key to access the command center</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="password"
              placeholder="Claw API Key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setError('')
              }}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                padding: '0.875rem 1rem 0.875rem 3rem',
                borderRadius: '0.75rem',
                color: 'var(--text)',
                outline: 'none'
              }}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.875rem', justifyContent: 'center' }}>
              <ShieldAlert size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            style={{ width: '100%', justifyContent: 'center', padding: '0.875rem' }}
          >
            Access Dashboard
            <ArrowRight size={18} />
          </button>
        </form>

        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Your API Key is stored locally in your browser and used to sign all requests to the backend.
        </p>
      </div>
    </div>
  )
}
