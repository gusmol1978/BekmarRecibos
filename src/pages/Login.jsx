import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logo from '../LogoBekmar.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inactivo = new URLSearchParams(location.search).get('inactivo')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Email o contrasena incorrectos.')
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.bg1} />
      <div style={styles.bg2} />
      <div style={styles.card}>
        <img src={logo} alt="Bekmar" style={styles.logoImg} />
        <h1 style={styles.title}>Portal de Recibos</h1>
        <p style={styles.subtitle}>Bekmar Distribuciones</p>

        {inactivo && (
          <div style={styles.inactivo}>
            Tu cuenta fue deshabilitada. Contacta a RRHH para mas informacion.
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="tu@empresa.com"
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contrasena</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Ingresa tu contrasena"
              style={styles.input}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={{...styles.btn, opacity: loading ? 0.7 : 1}}>
            {loading ? 'Ingresando...' : 'Ingresar al Portal'}
          </button>
        </form>
        <p style={styles.footer}>Problemas para acceder? Contacta a RRHH</p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f7f4ef',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"DM Sans", sans-serif',
    position: 'relative',
    overflow: 'hidden',
    padding: '20px',
    boxSizing: 'border-box',
  },
  bg1: {
    position: 'fixed', top: '-200px', right: '-200px',
    width: '700px', height: '700px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(200,169,110,0.15) 0%, transparent 65%)',
    pointerEvents: 'none',
  },
  bg2: {
    position: 'fixed', bottom: '-300px', left: '-200px',
    width: '600px', height: '600px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(44,31,14,0.06) 0%, transparent 65%)',
    pointerEvents: 'none',
  },
  card: {
    background: '#ffffff',
    borderRadius: '4px',
    padding: '44px 36px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 2px 24px rgba(44,31,14,0.07), 0 1px 3px rgba(44,31,14,0.05)',
    borderTop: '3px solid #c8a96e',
    position: 'relative',
    zIndex: 1,
  },
  logoImg: {
    width: '52px',
    height: '52px',
    borderRadius: '8px',
    objectFit: 'cover',
    marginBottom: '16px',
  },
  title: {
    fontFamily: '"DM Serif Display", serif',
    fontSize: '24px', fontWeight: 400,
    color: '#2c1f0e', margin: '0 0 4px',
  },
  subtitle: { color: '#8a7560', fontSize: '13px', margin: '0 0 28px', fontWeight: 300 },
  inactivo: {
    background: '#fdf2f2',
    borderLeft: '3px solid #b53a2f',
    color: '#b53a2f',
    fontSize: '13px',
    padding: '10px 12px',
    borderRadius: '0 3px 3px 0',
    marginBottom: '20px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: {
    fontSize: '11px', fontWeight: 500, color: '#5c4a32',
    textTransform: 'uppercase', letterSpacing: '0.09em',
  },
  input: {
    border: '1.5px solid #e2d9cc', borderRadius: '3px',
    padding: '11px 13px', fontSize: '14px', color: '#2c1f0e',
    background: '#faf8f5', outline: 'none',
    fontFamily: '"DM Sans", sans-serif',
    transition: 'border-color 0.15s',
    width: '100%', boxSizing: 'border-box',
  },
  error: {
    color: '#b53a2f', fontSize: '13px', margin: 0,
    padding: '9px 12px', background: '#fdf3f2',
    borderLeft: '3px solid #b53a2f', borderRadius: '0 3px 3px 0',
  },
  btn: {
    background: '#2c1f0e', color: '#f0e8da',
    border: 'none', borderRadius: '3px',
    padding: '13px', fontSize: '14px', fontWeight: 500,
    cursor: 'pointer', letterSpacing: '0.03em',
    fontFamily: '"DM Sans", sans-serif',
    marginTop: '4px',
    transition: 'background 0.15s',
    width: '100%',
  },
  footer: { textAlign: 'center', color: '#b0987a', fontSize: '12px', marginTop: '20px', marginBottom: 0 },
}
