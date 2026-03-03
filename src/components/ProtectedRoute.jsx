import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }) {
  const { user, profile, loading, signOut } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'"DM Sans",sans-serif',color:'#8a7560'}}>Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.activo === false) {
    signOut()
    return <Navigate to="/login?inactivo=1" replace />
  }
  return children
}

export function AdminRoute({ children }) {
  const { user, profile, loading, signOut } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'"DM Sans",sans-serif',color:'#8a7560'}}>Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.activo === false) {
    signOut()
    return <Navigate to="/login?inactivo=1" replace />
  }
  if (!profile || profile.rol !== 'admin') return <Navigate to="/" replace />
  return children
}
