import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../LogoBekmar.png'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase detecta el token en la URL y dispara PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    // También chequeamos si ya hay sesión activa (recarga de página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (password !== confirm) { setMsg('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setMsg('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMsg('Error: ' + error.message)
      setLoading(false)
    } else {
      setMsg('OK Contraseña actualizada correctamente. Redirigiendo...')
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 2000)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.bg1} />
      <div style={styles.bg2} />
      <div style={styles.card}>
        <img src={logo} alt="Bekmar" style={styles.logoImg} />
        <h1 style={styles.title}>Nueva contraseña</h1>
        <p style={styles.subtitle}>Bekmar Distribuciones</p>

        {!ready ? (
          <div style={{textAlign:'center',padding:'20px 0',color:'#8a7560',fontSize:'14px'}}>
            Verificando enlace...
          </div>
        ) : msg.startsWith('OK') ? (
          <p style={styles.success}>{msg.slice(3)}</p>
        ) : (
          <form onSubmit={handleReset} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Confirmar contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repetí la contraseña"
                style={styles.input}
              />
            </div>
            {msg && <p style={styles.error}>{msg}</p>}
            <button type="submit" disabled={loading} style={{...styles.btn, opacity: loading ? 0.7 : 1}}>
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh', background: '#f7f4ef',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '"DM Sans", sans-serif', position: 'relative', overflow: 'hidden',
    padding: '20px', boxSizing: 'border-box',
  },
  bg1: {
    position: 'fixed', top: '-200px', right: '-200px', width: '700px', height: '700px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,169,110,0.15) 0%, transparent 65%)', pointerEvents: 'none',
  },
  bg2: {
    position: 'fixed', bottom: '-300px', left: '-200px', width: '600px', height: '600px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(44,31,14,0.06) 0%, transparent 65%)', pointerEvents: 'none',
  },
  card: {
    background: '#ffffff', borderRadius: '4px', padding: '44px 36px', width: '100%', maxWidth: '400px',
    boxShadow: '0 2px 24px rgba(44,31,14,0.07), 0 1px 3px rgba(44,31,14,0.05)',
    borderTop: '3px solid #c8a96e', position: 'relative', zIndex: 1,
  },
  logoImg: { width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', marginBottom: '16px' },
  title: { fontFamily: '"DM Serif Display", serif', fontSize: '24px', fontWeight: 400, color: '#2c1f0e', margin: '0 0 4px' },
  subtitle: { color: '#8a7560', fontSize: '13px', margin: '0 0 28px', fontWeight: 300 },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '11px', fontWeight: 500, color: '#5c4a32', textTransform: 'uppercase', letterSpacing: '0.09em' },
  input: {
    border: '1.5px solid #e2d9cc', borderRadius: '3px', padding: '11px 13px', fontSize: '14px',
    color: '#2c1f0e', background: '#faf8f5', outline: 'none', fontFamily: '"DM Sans", sans-serif',
    width: '100%', boxSizing: 'border-box',
  },
  error: {
    color: '#b53a2f', fontSize: '13px', margin: 0,
    padding: '9px 12px', background: '#fdf3f2', borderLeft: '3px solid #b53a2f', borderRadius: '0 3px 3px 0',
  },
  success: {
    color: '#2a7a2a', fontSize: '14px', margin: 0,
    padding: '12px 14px', background: '#f0fdf0', borderLeft: '3px solid #2a7a2a', borderRadius: '0 3px 3px 0',
  },
  btn: {
    background: '#2c1f0e', color: '#f0e8da', border: 'none', borderRadius: '3px',
    padding: '13px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
    letterSpacing: '0.03em', fontFamily: '"DM Sans", sans-serif', marginTop: '4px', width: '100%',
  },
}
