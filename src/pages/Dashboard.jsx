import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import logo from '../LogoBekmar.png'

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
function formatFecha(s) { const d = new Date(s+'T00:00:00'); return meses[d.getMonth()]+' '+d.getFullYear() }

function SortIcon({ direction }) {
  if (!direction) return <span style={{color:'#c0b09a',fontSize:'11px',marginLeft:'4px'}}>⇅</span>
  return <span style={{color:'#c8a96e',fontSize:'11px',marginLeft:'4px'}}>{direction === 'asc' ? '↑' : '↓'}</span>
}

function FirmaBadge({ recibo }) {
  if (recibo.firmado) {
    const tipo = recibo.firmado_tipo === 'fisico' ? 'Firma física' : 'Firmado'
    const fecha = recibo.firmado_at
      ? new Date(recibo.firmado_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : ''
    return (
      <div style={{display:'flex',alignItems:'center',gap:'5px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'20px',padding:'4px 10px',flexShrink:0}}>
        <span style={{color:'#16a34a',fontSize:'12px'}}>✓</span>
        <span style={{color:'#16a34a',fontSize:'11px',fontWeight:600}}>{tipo}</span>
        {fecha && <span style={{color:'#4ade80',fontSize:'10px'}}>{fecha}</span>}
      </div>
    )
  }
  return (
    <div style={{display:'flex',alignItems:'center',gap:'5px',background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'20px',padding:'4px 10px',flexShrink:0}}>
      <span style={{color:'#d97706',fontSize:'12px'}}>⏳</span>
      <span style={{color:'#d97706',fontSize:'11px',fontWeight:600}}>Sin firmar</span>
    </div>
  )
}

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [recibos, setRecibos] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const isAdmin = profile && profile.rol === 'admin'

  // Cambiar contraseña
  const [showCambiarPass, setShowCambiarPass] = useState(false)
  const [passForm, setPassForm] = useState({ nueva: '', confirmar: '' })
  const [passMsg, setPassMsg] = useState('')
  const [passLoading, setPassLoading] = useState(false)

  // Firma digital
  const [firmandoId, setFirmandoId] = useState(null)
  const [firmaPass, setFirmaPass] = useState('')
  const [firmaMsg, setFirmaMsg] = useState('')
  const [firmaLoading, setFirmaLoading] = useState(false)

  // Filtros
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAnio, setFiltroAnio] = useState('')

  // Ordenamiento
  const [sortField, setSortField] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  // Tabs
  const [activeTab, setActiveTab] = useState('recibos')

  // Vacaciones
  const [solicitudes, setSolicitudes] = useState([])
  const [vacForm, setVacForm] = useState({ tipo: 'vacaciones', fecha_desde: '', fecha_hasta: '', comentario: '' })
  const [vacMsg, setVacMsg] = useState('')
  const [vacLoading, setVacLoading] = useState(false)
  const [showVacForm, setShowVacForm] = useState(false)
  const [editandoSol, setEditandoSol] = useState(null)
  const [editVacForm, setEditVacForm] = useState({ tipo: 'vacaciones', fecha_desde: '', fecha_hasta: '', comentario: '' })
  const [editVacMsg, setEditVacMsg] = useState('')
  const [editVacLoading, setEditVacLoading] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [vacFeatureOn, setVacFeatureOn] = useState(false)
  const [vacPersonalOn, setVacPersonalOn] = useState(true)

  const tiposLabel = { vacaciones: 'Vacaciones', licencia_medica: 'Licencia médica', licencia_personal: 'Licencia personal', otro: 'Otro' }

  // Feriados fijos Uruguay (MM-DD)
  const FERIADOS_UY = ['01-01', '05-01', '07-18', '08-25', '12-25']

  function esFeriadoODomingo(date) {
    if (date.getDay() === 0) return true // domingo
    const mmdd = String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    return FERIADOS_UY.includes(mmdd)
  }

  function diasHabiles(desde, hasta) {
    if (!desde || !hasta || hasta < desde) return 0
    let count = 0
    const cur = new Date(desde + 'T00:00:00')
    const end = new Date(hasta + 'T00:00:00')
    while (cur <= end) {
      if (!esFeriadoODomingo(cur)) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  useEffect(() => { fetchRecibos(); fetchSolicitudes(); fetchVacFeature() }, [user])

  async function fetchVacFeature() {
    const { data } = await supabase.from('feature_flags').select('enabled').eq('nombre', 'vacaciones').single()
    if (data) setVacFeatureOn(data.enabled)
    // Leer permiso individual del empleado
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('vacaciones_habilitadas').eq('id', user.id).single()
      if (prof) setVacPersonalOn(prof.vacaciones_habilitadas !== false)
    }
  }

  async function fetchSolicitudes() {
    const { data } = await supabase.from('solicitudes_vacaciones').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setSolicitudes(data || [])
  }

  async function handleSolicitarVacaciones(e) {
    e.preventDefault()
    if (!vacForm.fecha_desde || !vacForm.fecha_hasta) { setVacMsg('Ingresá las fechas'); return }
    if (vacForm.fecha_hasta < vacForm.fecha_desde) { setVacMsg('La fecha de fin debe ser posterior al inicio'); return }
    setVacLoading(true); setVacMsg('')
    const { error } = await supabase.from('solicitudes_vacaciones').insert({
      user_id: user.id,
      tipo: vacForm.tipo,
      fecha_desde: vacForm.fecha_desde,
      fecha_hasta: vacForm.fecha_hasta,
      comentario: vacForm.comentario || null,
      estado: 'pendiente'
    })
    if (error) setVacMsg('Error: ' + error.message)
    else {
      setVacMsg('OK Solicitud enviada correctamente')
      setVacForm({ tipo: 'vacaciones', fecha_desde: '', fecha_hasta: '', comentario: '' })
      setShowVacForm(false)
      fetchSolicitudes()
    }
    setVacLoading(false)
  }

  function iniciarEdicion(s) {
    setEditandoSol(s.id)
    setEditVacForm({ tipo: s.tipo, fecha_desde: s.fecha_desde, fecha_hasta: s.fecha_hasta, comentario: s.comentario || '' })
    setEditVacMsg('')
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault()
    if (!editVacForm.fecha_desde || !editVacForm.fecha_hasta) { setEditVacMsg('Ingresá las fechas'); return }
    if (editVacForm.fecha_hasta < editVacForm.fecha_desde) { setEditVacMsg('La fecha de fin debe ser posterior al inicio'); return }
    setEditVacLoading(true); setEditVacMsg('')
    const { error } = await supabase.from('solicitudes_vacaciones').update({
      tipo: editVacForm.tipo,
      fecha_desde: editVacForm.fecha_desde,
      fecha_hasta: editVacForm.fecha_hasta,
      comentario: editVacForm.comentario || null
    }).eq('id', editandoSol).eq('user_id', user.id).eq('estado', 'pendiente')
    if (error) setEditVacMsg('Error: ' + error.message)
    else { setEditandoSol(null); fetchSolicitudes() }
    setEditVacLoading(false)
  }

  async function handleEliminarSolicitud(id) {
    const { error } = await supabase.from('solicitudes_vacaciones').delete()
      .eq('id', id).eq('user_id', user.id).eq('estado', 'pendiente')
    if (!error) { setEliminandoId(null); fetchSolicitudes() }
  }

  async function fetchRecibos() {
    setLoading(true)
    const { data } = await supabase.from('recibos').select('*').eq('user_id', user.id).order('fecha', { ascending: false })
    setRecibos(data || [])
    setLoading(false)
  }

  async function downloadRecibo(recibo) {
    setDownloading(recibo.id)
    const { data, error } = await supabase.storage.from('recibos-pdf').download(recibo.archivo_path)
    if (!error && data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = recibo.nombre_archivo || 'recibo.pdf'; a.click()
      URL.revokeObjectURL(url)
    }
    setDownloading(null)
  }

  async function handleCambiarPass(e) {
    e.preventDefault()
    if (passForm.nueva !== passForm.confirmar) { setPassMsg('Las contraseñas no coinciden'); return }
    if (passForm.nueva.length < 6) { setPassMsg('La contraseña debe tener al menos 6 caracteres'); return }
    setPassLoading(true); setPassMsg('')
    const { error } = await supabase.auth.updateUser({ password: passForm.nueva })
    if (error) setPassMsg('Error: ' + error.message)
    else { setPassMsg('OK Contraseña actualizada correctamente.'); setPassForm({ nueva: '', confirmar: '' }); setShowCambiarPass(false) }
    setPassLoading(false)
  }

  async function viewRecibo(recibo) {
    const { data } = await supabase.storage.from('recibos-pdf').createSignedUrl(recibo.archivo_path, 300)
    if (data && data.signedUrl) setPdfUrl(data.signedUrl)
  }

  async function handleFirmar(recibo) {
    if (!firmaPass) { setFirmaMsg('Ingresá tu contraseña para firmar'); return }
    setFirmaLoading(true); setFirmaMsg('')
    // Verificar identidad re-autenticando con la contraseña
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: firmaPass })
    if (authError) {
      setFirmaMsg('Contraseña incorrecta. Intentá nuevamente.')
      setFirmaLoading(false)
      return
    }
    // Registrar la firma digital
    const { error } = await supabase.from('recibos').update({
      firmado: true,
      firmado_at: new Date().toISOString(),
      firmado_tipo: 'digital'
    }).eq('id', recibo.id).eq('user_id', user.id)
    if (error) {
      setFirmaMsg('Error al registrar la firma: ' + error.message)
    } else {
      setFirmandoId(null)
      setFirmaPass('')
      setFirmaMsg('')
      fetchRecibos()
    }
    setFirmaLoading(false)
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Años disponibles a partir de los recibos
  const aniosDisponibles = useMemo(() => {
    const years = [...new Set(recibos.map(r => new Date(r.fecha + 'T00:00:00').getFullYear()))]
    return years.sort((a, b) => b - a)
  }, [recibos])

  // Filtrado + ordenamiento
  const recibosFiltrados = useMemo(() => {
    let result = [...recibos]

    if (filtroMes !== '') {
      result = result.filter(r => new Date(r.fecha + 'T00:00:00').getMonth() === parseInt(filtroMes))
    }
    if (filtroAnio !== '') {
      result = result.filter(r => new Date(r.fecha + 'T00:00:00').getFullYear() === parseInt(filtroAnio))
    }

    result.sort((a, b) => {
      let valA, valB
      if (sortField === 'fecha') {
        valA = a.fecha || ''
        valB = b.fecha || ''
      } else if (sortField === 'descripcion') {
        valA = (a.descripcion || '').toLowerCase()
        valB = (b.descripcion || '').toLowerCase()
      } else if (sortField === 'monto') {
        valA = parseFloat(a.monto) || 0
        valB = parseFloat(b.monto) || 0
      } else {
        valA = a[sortField] || ''
        valB = b[sortField] || ''
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [recibos, filtroMes, filtroAnio, sortField, sortDir])

  const nombreUsuario = profile && profile.nombre_completo ? profile.nombre_completo : user && user.email

  const hayFiltros = filtroMes !== '' || filtroAnio !== ''

  return (
    <div style={{minHeight:'100vh',background:'#f7f4ef',fontFamily:'"DM Sans",sans-serif'}}>
      {pdfUrl && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',flexDirection:'column'}} onClick={() => setPdfUrl(null)}>
          <div style={{display:'flex',justifyContent:'flex-end',padding:'12px 20px'}}>
            <button onClick={() => setPdfUrl(null)} style={{background:'white',border:'none',borderRadius:'3px',padding:'8px 18px',fontSize:'14px',cursor:'pointer',fontWeight:600}}>Cerrar</button>
          </div>
          <div style={{flex:1,padding:'0 20px 20px'}} onClick={e => e.stopPropagation()}>
            <iframe src={pdfUrl} style={{width:'100%',height:'100%',border:'none',borderRadius:'4px'}} title="Recibo" />
          </div>
        </div>
      )}
      <header style={{background:'#0f1f3d',position:'sticky',top:0,zIndex:10}}>
        <div style={{maxWidth:'960px',margin:'0 auto',padding:'0 24px',height:'68px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            <img src={logo} alt="Bekmar" style={{height:'44px',width:'44px',borderRadius:'6px',objectFit:'cover'}} />
            <div>
              <div style={{fontSize:'16px',fontWeight:700,color:'#ffffff'}}>Bekmar SA</div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>Portal de Recibos</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            {isAdmin && (
              <button onClick={() => navigate('/admin')} style={{background:'#c8a96e',border:'none',borderRadius:'3px',padding:'7px 16px',fontSize:'12px',color:'#0f1f3d',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:600}}>Panel Admin</button>
            )}
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'15px',fontWeight:600,color:'#ffffff'}}>{nombreUsuario}</div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>{user && user.email}</div>
            </div>
            <button onClick={signOut} style={{background:'transparent',border:'1.5px solid rgba(255,255,255,0.25)',borderRadius:'3px',padding:'7px 14px',fontSize:'12px',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Salir</button>
          </div>
        </div>
      </header>
      <main style={{padding:'40px 0 80px'}}>
        <div style={{maxWidth:'960px',margin:'0 auto',padding:'0 24px'}}>

          {/* Tabs principales */}
          <div style={{borderBottom:'1px solid #e2d9cc',display:'flex',gap:'0',marginBottom:'28px'}}>
            <button onClick={() => setActiveTab('recibos')} style={{padding:'10px 24px',fontSize:'14px',fontWeight:500,cursor:'pointer',border:'none',background:'transparent',fontFamily:'"DM Sans",sans-serif',color:activeTab==='recibos'?'#2c1f0e':'#a89070',borderBottom:activeTab==='recibos'?'2px solid #c8a96e':'2px solid transparent'}}>
              Mis Recibos
            </button>
            {vacFeatureOn && vacPersonalOn && (
              <button onClick={() => setActiveTab('vacaciones')} style={{padding:'10px 24px',fontSize:'14px',fontWeight:500,cursor:'pointer',border:'none',background:'transparent',fontFamily:'"DM Sans",sans-serif',color:activeTab==='vacaciones'?'#2c1f0e':'#a89070',borderBottom:activeTab==='vacaciones'?'2px solid #c8a96e':'2px solid transparent'}}>
                Vacaciones {solicitudes.filter(s=>s.estado==='pendiente').length > 0 && <span style={{background:'#d97706',color:'#fff',borderRadius:'10px',padding:'1px 6px',fontSize:'10px',marginLeft:'4px'}}>{solicitudes.filter(s=>s.estado==='pendiente').length}</span>}
              </button>
            )}
          </div>

          {/* TAB VACACIONES */}
          {activeTab === 'vacaciones' && vacFeatureOn && vacPersonalOn && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
                <div>
                  <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'26px',fontWeight:400,color:'#2c1f0e',margin:'0 0 4px'}}>Vacaciones y Licencias</h2>
                  <p style={{color:'#8a7560',fontSize:'13px',margin:0}}>Solicitá días y seguí el estado de tus pedidos</p>
                </div>
                <button onClick={() => { setShowVacForm(v => !v); setVacMsg('') }}
                  style={{background:showVacForm?'transparent':'#0f1f3d',color:showVacForm?'#5c4a32':'#fff',border:showVacForm?'1.5px solid #e2d9cc':'none',borderRadius:'3px',padding:'9px 18px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                  {showVacForm ? 'Cancelar' : '+ Nueva solicitud'}
                </button>
              </div>

              {/* Formulario nueva solicitud */}
              {showVacForm && (
                <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                  <form onSubmit={handleSolicitarVacaciones} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                    <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                      <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'180px'}}>
                        <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Tipo</label>
                        <select value={vacForm.tipo} onChange={e => setVacForm({...vacForm,tipo:e.target.value})} style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}}>
                          <option value="vacaciones">Vacaciones</option>
                          <option value="licencia_medica">Licencia médica</option>
                          <option value="licencia_personal">Licencia personal</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'150px'}}>
                        <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Desde</label>
                        <input type="date" value={vacForm.fecha_desde} onChange={e => setVacForm({...vacForm,fecha_desde:e.target.value})} required style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}} />
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'150px'}}>
                        <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Hasta</label>
                        <input type="date" value={vacForm.fecha_hasta} onChange={e => setVacForm({...vacForm,fecha_hasta:e.target.value})} required style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}} />
                      </div>
                    </div>
                    {vacForm.fecha_desde && vacForm.fecha_hasta && vacForm.fecha_hasta >= vacForm.fecha_desde && (
                      <div style={{fontSize:'13px',color:'#5c4a32',background:'#f7f4ef',padding:'8px 12px',borderRadius:'3px'}}>
                        📅 {diasHabiles(vacForm.fecha_desde, vacForm.fecha_hasta)} días hábiles (sin domingos ni feriados)
                      </div>
                    )}
                    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                      <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Comentario (opcional)</label>
                      <textarea value={vacForm.comentario} onChange={e => setVacForm({...vacForm,comentario:e.target.value})} placeholder="Agregá un comentario o aclaración..." rows={3}
                        style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',resize:'vertical'}} />
                    </div>
                    {vacMsg && <p style={{margin:0,padding:'9px 12px',borderRadius:'3px',fontSize:'13px',background:vacMsg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:vacMsg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(vacMsg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>{vacMsg.startsWith('OK')?vacMsg.slice(3):vacMsg}</p>}
                    <div>
                      <button type="submit" disabled={vacLoading} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'10px 22px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:vacLoading?0.7:1}}>
                        {vacLoading ? 'Enviando...' : 'Enviar solicitud'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Lista de solicitudes */}
              {solicitudes.length === 0 ? (
                <div style={{textAlign:'center',padding:'60px 0',color:'#a89070'}}>
                  <div style={{fontSize:'32px',marginBottom:'12px'}}>🏖️</div>
                  <p style={{fontSize:'15px',fontWeight:500,color:'#5c4a32',margin:'0 0 6px'}}>No tenés solicitudes aún</p>
                  <p style={{fontSize:'13px',margin:0}}>Usá el botón "Nueva solicitud" para pedir días</p>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {solicitudes.map(s => {
                    const estadoColor = s.estado === 'aprobada' ? { bg:'#f0fdf4',border:'#86efac',text:'#16a34a',label:'✓ Aprobada' }
                      : s.estado === 'rechazada' ? { bg:'#fdf2f2',border:'#fca5a5',text:'#b53a2f',label:'✗ Rechazada' }
                      : { bg:'#fffbeb',border:'#fcd34d',text:'#d97706',label:'⏳ Pendiente' }
                    const dias = diasHabiles(s.fecha_desde, s.fecha_hasta)
                    return (
                      <div key={s.id} style={{background:'#fff',borderRadius:'4px',border:'1px solid #ede6d8',padding:'16px 20px'}}>
                        {editandoSol === s.id ? (
                          <form onSubmit={handleGuardarEdicion} style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                            <div style={{fontSize:'13px',fontWeight:600,color:'#2c1f0e',marginBottom:'2px'}}>Editando solicitud</div>
                            <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                              <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'160px'}}>
                                <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Tipo</label>
                                <select value={editVacForm.tipo} onChange={e => setEditVacForm({...editVacForm,tipo:e.target.value})}
                                  style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'9px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}}>
                                  <option value="vacaciones">Vacaciones</option>
                                  <option value="licencia_medica">Licencia médica</option>
                                  <option value="licencia_personal">Licencia personal</option>
                                  <option value="otro">Otro</option>
                                </select>
                              </div>
                              <div style={{display:'flex',flexDirection:'column',gap:'4px',minWidth:'140px'}}>
                                <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Desde</label>
                                <input type="date" value={editVacForm.fecha_desde} onChange={e => setEditVacForm({...editVacForm,fecha_desde:e.target.value})} required
                                  style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'9px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}} />
                              </div>
                              <div style={{display:'flex',flexDirection:'column',gap:'4px',minWidth:'140px'}}>
                                <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Hasta</label>
                                <input type="date" value={editVacForm.fecha_hasta} onChange={e => setEditVacForm({...editVacForm,fecha_hasta:e.target.value})} required
                                  style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'9px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif'}} />
                              </div>
                            </div>
                            {editVacForm.fecha_desde && editVacForm.fecha_hasta && editVacForm.fecha_hasta >= editVacForm.fecha_desde && (
                              <div style={{fontSize:'13px',color:'#5c4a32',background:'#f7f4ef',padding:'7px 12px',borderRadius:'3px'}}>
                                📅 {diasHabiles(editVacForm.fecha_desde, editVacForm.fecha_hasta)} días hábiles (sin domingos ni feriados)
                              </div>
                            )}
                            <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                              <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Comentario (opcional)</label>
                              <textarea value={editVacForm.comentario} onChange={e => setEditVacForm({...editVacForm,comentario:e.target.value})} rows={2}
                                placeholder="Agregá un comentario o aclaración..."
                                style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'9px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',resize:'vertical'}} />
                            </div>
                            {editVacMsg && <p style={{margin:0,padding:'8px 12px',borderRadius:'3px',fontSize:'13px',background:'#fdf2f2',color:'#b53a2f',borderLeft:'3px solid #b53a2f'}}>{editVacMsg}</p>}
                            <div style={{display:'flex',gap:'8px'}}>
                              <button type="submit" disabled={editVacLoading}
                                style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'8px 18px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:editVacLoading?0.7:1}}>
                                {editVacLoading ? 'Guardando...' : 'Guardar cambios'}
                              </button>
                              <button type="button" onClick={() => { setEditandoSol(null); setEditVacMsg('') }}
                                style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                                Cancelar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
                            <div style={{flex:1}}>
                              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                                <span style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e'}}>{tiposLabel[s.tipo] || s.tipo}</span>
                                <span style={{fontSize:'12px',color:'#a89070'}}>·</span>
                                <span style={{fontSize:'13px',color:'#5c4a32'}}>
                                  {new Date(s.fecha_desde+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}
                                  {' → '}
                                  {new Date(s.fecha_hasta+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}
                                </span>
                                <span style={{fontSize:'12px',color:'#8a7560',fontWeight:500}}>{dias} día{dias!==1?'s':''} hábil{dias!==1?'es':''}</span>
                              </div>
                              {s.comentario && <div style={{fontSize:'12px',color:'#8a7560',marginTop:'4px'}}>"{s.comentario}"</div>}
                              {s.comentario_admin && (
                                <div style={{fontSize:'12px',color: s.estado==='aprobada'?'#15803d':'#b53a2f',marginTop:'6px',background:estadoColor.bg,padding:'6px 10px',borderRadius:'3px',borderLeft:'3px solid '+estadoColor.border}}>
                                  <strong>Admin:</strong> {s.comentario_admin}
                                </div>
                              )}
                            </div>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px',flexShrink:0}}>
                              <div style={{display:'inline-flex',alignItems:'center',gap:'5px',background:estadoColor.bg,border:'1px solid '+estadoColor.border,borderRadius:'20px',padding:'4px 12px'}}>
                                <span style={{fontSize:'12px',fontWeight:600,color:estadoColor.text}}>{estadoColor.label}</span>
                              </div>
                              {s.estado === 'pendiente' && (
                                <div style={{display:'flex',gap:'6px'}}>
                                  <button onClick={() => iniciarEdicion(s)}
                                    style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'5px 12px',fontSize:'12px',color:'#2c1f0e',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                                    ✏ Editar
                                  </button>
                                  {eliminandoId === s.id ? (
                                    <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                                      <span style={{fontSize:'12px',color:'#b53a2f'}}>¿Eliminar?</span>
                                      <button onClick={() => handleEliminarSolicitud(s.id)}
                                        style={{background:'#b53a2f',color:'#fff',border:'none',borderRadius:'3px',padding:'5px 10px',fontSize:'12px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:600}}>
                                        Sí
                                      </button>
                                      <button onClick={() => setEliminandoId(null)}
                                        style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'5px 8px',fontSize:'12px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setEliminandoId(s.id)}
                                      style={{background:'transparent',border:'1.5px solid #fca5a5',borderRadius:'3px',padding:'5px 12px',fontSize:'12px',color:'#b53a2f',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                                      ✕ Eliminar
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB RECIBOS */}
          {activeTab === 'recibos' && (
          <div>
          <div style={{marginBottom:'24px'}}>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'28px',fontWeight:400,color:'#2c1f0e',margin:'0 0 6px'}}>Mis Recibos de Sueldo</h2>
            <p style={{color:'#8a7560',fontSize:'14px',margin:0}}>Accedé, descargá y firmá tus liquidaciones de haberes</p>
          </div>

          {/* Filtros */}
          {!loading && recibos.length > 0 && (
            <div style={{background:'#fff',borderRadius:'4px',padding:'16px 20px',marginBottom:'16px',border:'1px solid #ede6d8',display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:'13px',color:'#5c4a32',fontWeight:600,whiteSpace:'nowrap'}}>Filtrar por:</span>
              <select
                value={filtroMes}
                onChange={e => setFiltroMes(e.target.value)}
                style={{border:'1.5px solid #ddd5c8',borderRadius:'3px',padding:'7px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',cursor:'pointer',minWidth:'140px'}}
              >
                <option value=''>Todos los meses</option>
                {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select
                value={filtroAnio}
                onChange={e => setFiltroAnio(e.target.value)}
                style={{border:'1.5px solid #ddd5c8',borderRadius:'3px',padding:'7px 12px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',cursor:'pointer',minWidth:'110px'}}
              >
                <option value=''>Todos los años</option>
                {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {hayFiltros && (
                <button
                  onClick={() => { setFiltroMes(''); setFiltroAnio('') }}
                  style={{background:'transparent',border:'1.5px solid #c8a96e',borderRadius:'3px',padding:'7px 14px',fontSize:'12px',color:'#8a6a2a',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:600}}
                >
                  Limpiar filtros
                </button>
              )}
              <span style={{marginLeft:'auto',fontSize:'12px',color:'#a89070'}}>
                {recibosFiltrados.length} {recibosFiltrados.length === 1 ? 'recibo' : 'recibos'}
              </span>
            </div>
          )}

          {/* Cabecera ordenable */}
          {!loading && recibosFiltrados.length > 0 && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'8px',padding:'8px 24px',marginBottom:'4px'}}>
              <button
                onClick={() => handleSort('fecha')}
                style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#8a7560',letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:'"DM Sans",sans-serif',padding:0,display:'flex',alignItems:'center'}}
              >
                Período <SortIcon direction={sortField === 'fecha' ? sortDir : null} />
              </button>
              <button
                onClick={() => handleSort('descripcion')}
                style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#8a7560',letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:'"DM Sans",sans-serif',padding:0,display:'flex',alignItems:'center'}}
              >
                Descripción <SortIcon direction={sortField === 'descripcion' ? sortDir : null} />
              </button>
              <button
                onClick={() => handleSort('monto')}
                style={{background:'none',border:'none',cursor:'pointer',textAlign:'right',fontSize:'11px',fontWeight:700,color:'#8a7560',letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:'"DM Sans",sans-serif',padding:0,display:'flex',alignItems:'center',justifyContent:'flex-end'}}
              >
                Monto <SortIcon direction={sortField === 'monto' ? sortDir : null} />
              </button>
            </div>
          )}

          {loading ? (
            <div style={{textAlign:'center',padding:'80px 0',color:'#8a7560'}}>Cargando recibos...</div>
          ) : recibos.length === 0 ? (
            <div style={{textAlign:'center',padding:'80px 0'}}>
              <p style={{color:'#5c4a32',fontSize:'16px',margin:'0 0 6px',fontWeight:500}}>No tenes recibos disponibles aun</p>
              <p style={{color:'#a89070',fontSize:'13px',margin:0}}>Cuando RRHH suba tus recibos apareceran aqui</p>
            </div>
          ) : recibosFiltrados.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <p style={{color:'#5c4a32',fontSize:'15px',margin:'0 0 6px',fontWeight:500}}>No hay recibos para los filtros seleccionados</p>
              <button onClick={() => { setFiltroMes(''); setFiltroAnio('') }} style={{marginTop:'12px',background:'transparent',border:'1.5px solid #c8a96e',borderRadius:'3px',padding:'8px 18px',fontSize:'13px',color:'#8a6a2a',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:600}}>Ver todos los recibos</button>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {recibosFiltrados.map(r => (
                <div key={r.id} style={{background:'#fff',borderRadius:'4px',border:'1px solid #ede6d8',boxShadow:'0 1px 4px rgba(44,31,14,0.05)',overflow:'hidden'}}>
                  {/* Fila principal */}
                  <div style={{padding:'18px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',flexWrap:'wrap'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'16px',flex:1,minWidth:0}}>
                      <div style={{background:'#0f1f3d',color:'#7eb3ff',borderRadius:'3px',padding:'6px 8px',fontSize:'10px',fontWeight:700,letterSpacing:'0.05em',flexShrink:0}}>PDF</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'15px',fontWeight:600,color:'#2c1f0e',marginBottom:'2px'}}>{formatFecha(r.fecha)}</div>
                        <div style={{fontSize:'12px',color:'#a89070',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.descripcion || 'Liquidacion de haberes'}</div>
                        {r.monto && <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600,marginTop:'4px'}}>$ {parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2})}</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
                      <FirmaBadge recibo={r} />
                      <button onClick={() => viewRecibo(r)} style={{background:'transparent',border:'1.5px solid #0f1f3d',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',color:'#0f1f3d',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Ver</button>
                      <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'Descargar'}</button>
                      {!r.firmado && (
                        <button
                          onClick={() => { setFirmandoId(firmandoId === r.id ? null : r.id); setFirmaPass(''); setFirmaMsg('') }}
                          style={{
                            background: firmandoId === r.id ? 'transparent' : '#16a34a',
                            color: firmandoId === r.id ? '#5c4a32' : '#fff',
                            border: firmandoId === r.id ? '1.5px solid #e2d9cc' : 'none',
                            borderRadius:'3px', padding:'8px 16px', fontSize:'13px', cursor:'pointer', fontFamily:'"DM Sans",sans-serif'
                          }}
                        >
                          {firmandoId === r.id ? 'Cancelar' : '✍ Firmar'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel de firma */}
                  {firmandoId === r.id && (
                    <div style={{borderTop:'1px solid #bbf7d0',background:'#f0fdf4',padding:'16px 24px'}}>
                      <div style={{fontSize:'13px',color:'#15803d',fontWeight:600,marginBottom:'8px'}}>Firma digital del recibo</div>
                      <p style={{fontSize:'12px',color:'#4b7a56',margin:'0 0 12px',lineHeight:'1.6'}}>
                        Al firmar confirmás haber recibido y leído este recibo de sueldo. Ingresá tu contraseña de acceso para confirmar tu identidad.
                      </p>
                      <div style={{display:'flex',gap:'10px',alignItems:'flex-start',flexWrap:'wrap'}}>
                        <input
                          type="password"
                          value={firmaPass}
                          onChange={e => { setFirmaPass(e.target.value); setFirmaMsg('') }}
                          placeholder="Tu contraseña de acceso"
                          onKeyDown={e => e.key === 'Enter' && handleFirmar(r)}
                          style={{border:'1.5px solid #bbf7d0',borderRadius:'3px',padding:'9px 13px',fontSize:'13px',color:'#2c1f0e',background:'#fff',fontFamily:'"DM Sans",sans-serif',minWidth:'220px',flex:1}}
                        />
                        <button
                          onClick={() => handleFirmar(r)}
                          disabled={firmaLoading}
                          style={{background:'#15803d',color:'#fff',border:'none',borderRadius:'3px',padding:'9px 20px',fontSize:'13px',fontWeight:600,cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:firmaLoading?0.7:1,whiteSpace:'nowrap'}}
                        >
                          {firmaLoading ? 'Firmando...' : 'Confirmar firma'}
                        </button>
                      </div>
                      {firmaMsg && (
                        <p style={{margin:'10px 0 0',fontSize:'12px',color:'#b53a2f',padding:'7px 10px',background:'#fdf2f2',borderLeft:'3px solid #b53a2f',borderRadius:'0 3px 3px 0'}}>{firmaMsg}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
          )}
        </div>
      </main>

      {/* Cambiar contraseña — footer */}
      <div style={{borderTop:'1px solid #ede6d8',padding:'20px 0 40px'}}>
        <div style={{maxWidth:'960px',margin:'0 auto',padding:'0 24px'}}>
          {!showCambiarPass ? (
            <button onClick={() => { setShowCambiarPass(true); setPassMsg('') }}
              style={{background:'none',border:'none',color:'#b0987a',fontSize:'12px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',textDecoration:'underline',padding:0}}>
              Cambiar contraseña
            </button>
          ) : (
            <div style={{maxWidth:'400px'}}>
              <div style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e',marginBottom:'14px'}}>Cambiar contraseña</div>
              <form onSubmit={handleCambiarPass} style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Nueva contraseña</label>
                  <input type="password" value={passForm.nueva} onChange={e => setPassForm({...passForm,nueva:e.target.value})} required placeholder="Mínimo 6 caracteres"
                    style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',width:'100%',boxSizing:'border-box'}} />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em'}}>Confirmar contraseña</label>
                  <input type="password" value={passForm.confirmar} onChange={e => setPassForm({...passForm,confirmar:e.target.value})} required placeholder="Repetí la contraseña"
                    style={{border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'10px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',width:'100%',boxSizing:'border-box'}} />
                </div>
                {passMsg && <p style={{margin:0,padding:'9px 12px',borderRadius:'3px',fontSize:'13px',background:passMsg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:passMsg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(passMsg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>{passMsg.startsWith('OK')?passMsg.slice(3):passMsg}</p>}
                <div style={{display:'flex',gap:'8px'}}>
                  <button type="submit" disabled={passLoading} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'9px 18px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:passLoading?0.7:1}}>
                    {passLoading ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => { setShowCambiarPass(false); setPassMsg(''); setPassForm({nueva:'',confirmar:''}) }}
                    style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'9px 16px',fontSize:'13px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
