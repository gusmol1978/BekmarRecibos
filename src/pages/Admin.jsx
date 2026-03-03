import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import logo from '../LogoBekmar.png'

export default function Admin() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState([])
  const [recibos, setRecibos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ user_id: '', fecha: '', descripcion: '', monto: '' })
  const [file, setFile] = useState(null)
  const [activeTab, setActiveTab] = useState('subir')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAnio, setFiltroAnio] = useState('')
  const [sortBy, setSortBy] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ nombre_completo: '', telefono: '' })
  const [editMsg, setEditMsg] = useState('')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700)
  const [editingRecibo, setEditingRecibo] = useState(null)
  const [editReciboForm, setEditReciboForm] = useState({ fecha: '', descripcion: '', monto: '' })
  const [newReciboFile, setNewReciboFile] = useState(null)
  const [savingRecibo, setSavingRecibo] = useState(false)
  const [reciboMsg, setReciboMsg] = useState('')
  const [showNewUser, setShowNewUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', nombre_completo: '', password: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [newUserMsg, setNewUserMsg] = useState('')

  useEffect(() => {
    fetchUsuarios(); fetchRecibos()
    const handler = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  async function fetchUsuarios() {
    const { data } = await supabase.from('profiles').select('id, nombre_completo, email, telefono, activo').order('nombre_completo')
    setUsuarios(data || [])
  }

  async function fetchRecibos() {
    const { data } = await supabase
      .from('recibos')
      .select('*, profiles!recibos_user_id_fkey(nombre_completo, email)')
      .order('created_at', { ascending: false })
      .limit(200)
    setRecibos(data || [])
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return setMsg('Selecciona un archivo PDF')
    if (!form.user_id) return setMsg('Selecciona un usuario')
    if (!form.fecha) return setMsg('Ingresa la fecha del recibo')
    setUploading(true); setMsg('')
    const ext = file.name.split('.').pop()
    const path = form.user_id + '/' + form.fecha + '-' + Date.now() + '.' + ext
    const { error: uploadError } = await supabase.storage.from('recibos-pdf').upload(path, file, { contentType: 'application/pdf' })
    if (uploadError) { setMsg('Error al subir: ' + uploadError.message); setUploading(false); return }
    const { error: dbError } = await supabase.from('recibos').insert({
      user_id: form.user_id, fecha: form.fecha,
      descripcion: form.descripcion || 'Liquidacion de haberes',
      monto: form.monto ? parseFloat(form.monto) : null,
      archivo_path: path, nombre_archivo: file.name, subido_por: user.id
    })
    if (dbError) setMsg('Error en DB: ' + dbError.message)
    else { setMsg('OK Recibo subido correctamente'); setForm({ user_id: '', fecha: '', descripcion: '', monto: '' }); setFile(null); fetchRecibos() }
    setUploading(false)
  }

  async function deleteRecibo(recibo) {
    if (!window.confirm('Eliminar este recibo?')) return
    await supabase.storage.from('recibos-pdf').remove([recibo.archivo_path])
    await supabase.from('recibos').delete().eq('id', recibo.id)
    fetchRecibos()
  }

  async function viewRecibo(recibo) {
    const { data } = await supabase.storage.from('recibos-pdf').createSignedUrl(recibo.archivo_path, 300)
    if (data && data.signedUrl) setPdfUrl(data.signedUrl)
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

  async function saveRecibo(r) {
    setSavingRecibo(true); setReciboMsg('')
    let archivo_path = r.archivo_path
    let nombre_archivo = r.nombre_archivo
    if (newReciboFile) {
      await supabase.storage.from('recibos-pdf').remove([r.archivo_path])
      const ext = newReciboFile.name.split('.').pop()
      const path = r.user_id + '/' + editReciboForm.fecha + '-' + Date.now() + '.' + ext
      const { error: uploadError } = await supabase.storage.from('recibos-pdf').upload(path, newReciboFile, { contentType: 'application/pdf' })
      if (uploadError) { setReciboMsg('Error al subir archivo: ' + uploadError.message); setSavingRecibo(false); return }
      archivo_path = path
      nombre_archivo = newReciboFile.name
    }
    const { error } = await supabase.from('recibos').update({
      fecha: editReciboForm.fecha,
      descripcion: editReciboForm.descripcion || 'Liquidacion de haberes',
      monto: editReciboForm.monto ? parseFloat(editReciboForm.monto) : null,
      archivo_path, nombre_archivo,
    }).eq('id', r.id)
    if (error) setReciboMsg('Error: ' + error.message)
    else { setEditingRecibo(null); setNewReciboFile(null); setReciboMsg(''); fetchRecibos() }
    setSavingRecibo(false)
  }

  function startEditRecibo(r) {
    setEditingRecibo(r.id)
    setEditReciboForm({ fecha: r.fecha, descripcion: r.descripcion || '', monto: r.monto ? String(r.monto) : '' })
    setNewReciboFile(null); setReciboMsg('')
  }

  async function saveUser(u) {
    const { error } = await supabase.from('profiles')
      .update({ nombre_completo: editForm.nombre_completo, telefono: editForm.telefono })
      .eq('id', u.id)
    if (error) setEditMsg('Error: ' + error.message)
    else { setEditMsg('OK Guardado'); setEditingUser(null); fetchUsuarios() }
  }

  async function toggleActivo(u) {
    const nuevoEstado = u.activo === false ? true : false
    const { error } = await supabase.from('profiles').update({ activo: nuevoEstado }).eq('id', u.id)
    if (!error) fetchUsuarios()
  }

  async function createUser(e) {
    e.preventDefault()
    if (!newUserForm.email) return setNewUserMsg('Ingresa un email')
    if (!newUserForm.password || newUserForm.password.length < 6) return setNewUserMsg('La contraseña debe tener al menos 6 caracteres')
    setCreatingUser(true); setNewUserMsg('')
    const { data, error } = await supabase.auth.signUp({
      email: newUserForm.email,
      password: newUserForm.password,
      options: { data: { nombre_completo: newUserForm.nombre_completo } }
    })
    if (error) {
      setNewUserMsg('Error: ' + error.message)
      setCreatingUser(false)
      return
    }
    // Si el usuario fue creado, actualizar nombre_completo en profiles
    if (data.user && newUserForm.nombre_completo) {
      // Esperar un momento para que el trigger cree el perfil
      await new Promise(res => setTimeout(res, 800))
      await supabase.from('profiles')
        .update({ nombre_completo: newUserForm.nombre_completo })
        .eq('id', data.user.id)
    }
    setNewUserMsg('OK Empleado creado correctamente. Si la confirmacion de email esta activada en Supabase, el empleado recibira un email para confirmar su cuenta.')
    setNewUserForm({ email: '', nombre_completo: '', password: '' })
    setCreatingUser(false)
    fetchUsuarios()
  }

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const recibosFiltrados = recibos
    .filter(r => {
      if (filtroUsuario && r.user_id !== filtroUsuario) return false
      if (filtroMes || filtroAnio) {
        const d = new Date(r.fecha + 'T00:00:00')
        if (filtroMes && (d.getMonth() + 1) !== parseInt(filtroMes)) return false
        if (filtroAnio && d.getFullYear() !== parseInt(filtroAnio)) return false
      }
      return true
    })
    .sort((a, b) => {
      let va, vb
      if (sortBy === 'nombre') {
        va = (a.profiles?.nombre_completo || a.profiles?.email || '').toLowerCase()
        vb = (b.profiles?.nombre_completo || b.profiles?.email || '').toLowerCase()
      } else {
        va = a.fecha; vb = b.fecha
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const mesesCompletos = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesesCortos = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  function fmtFecha(s) { const d = new Date(s + 'T00:00:00'); return mesesCompletos[d.getMonth()] + ' ' + d.getFullYear() }
  function fmtFechaCorta(s) { const d = new Date(s + 'T00:00:00'); return mesesCortos[d.getMonth()] + ' ' + d.getFullYear() }
  const aniosDisponibles = [...new Set(recibos.map(r => new Date(r.fecha + 'T00:00:00').getFullYear()))].sort((a,b) => b-a)

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span style={{color:'#c8b89a',marginLeft:'4px'}}>↕</span>
    return <span style={{color:'#c8a96e',marginLeft:'4px'}}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const Toggle = ({ activo, onClick }) => (
    <div onClick={onClick} title={activo !== false ? 'Deshabilitar acceso' : 'Habilitar acceso'} style={{width:'40px',height:'22px',borderRadius:'11px',background:activo!==false?'#2a6a2a':'#ccc',cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0}}>
      <div style={{position:'absolute',top:'3px',left:activo!==false?'21px':'3px',width:'16px',height:'16px',borderRadius:'50%',background:'white',transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.25)'}} />
    </div>
  )

  const inp = { border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'11px 13px',fontSize:'14px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif',width:'100%',boxSizing:'border-box' }
  const inpSm = { border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'8px 10px',fontSize:'13px',color:'#2c1f0e',background:'#faf8f5',fontFamily:'"DM Sans",sans-serif' }
  const lbl = { fontSize:'11px',fontWeight:500,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.09em' }
  const tabStyle = (t) => ({ padding: isMobile ? '8px 12px' : '10px 20px',fontSize:'13px',fontWeight:500,cursor:'pointer',border:'none',background:'transparent',fontFamily:'"DM Sans",sans-serif',color:activeTab===t?'#2c1f0e':'#a89070',borderBottom:activeTab===t?'2px solid #c8a96e':'2px solid transparent' })
  const btnSm = (variant) => ({
    background: variant === 'primary' ? '#0f1f3d' : 'transparent',
    color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#b53a2f' : '#0f1f3d',
    border: variant === 'primary' ? 'none' : `1.5px solid ${variant === 'danger' ? '#e2d9cc' : '#0f1f3d'}`,
    borderRadius:'3px', padding:'6px 10px', fontSize:'12px', cursor:'pointer',
    fontFamily:'"DM Sans",sans-serif', whiteSpace:'nowrap'
  })

  return (
    <div style={{minHeight:'100vh',background:'#f7f4ef',fontFamily:'"DM Sans",sans-serif'}}>

      {/* Visor PDF */}
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

      {/* Header */}
      <header style={{background:'#0f1f3d',position:'sticky',top:0,zIndex:10}}>
        <div style={{maxWidth:'1100px',margin:'0 auto',padding:'0 16px',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px',minWidth:0}}>
            <img src={logo} alt="Bekmar" style={{height:'38px',width:'38px',borderRadius:'6px',objectFit:'cover',flexShrink:0}} />
            {!isMobile && <div>
              <div style={{fontSize:'15px',fontWeight:700,color:'#ffffff'}}>Bekmar SA</div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)'}}>Panel de Administracion</div>
            </div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            {!isMobile && <button onClick={() => navigate('/')} style={{background:'transparent',border:'1.5px solid rgba(255,255,255,0.25)',borderRadius:'3px',padding:'6px 12px',fontSize:'12px',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Mis recibos</button>}
            {!isMobile && <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)'}}>{profile && profile.nombre_completo ? profile.nombre_completo : user && user.email}</div>}
            <button onClick={signOut} style={{background:'transparent',border:'1.5px solid rgba(255,255,255,0.25)',borderRadius:'3px',padding:'6px 12px',fontSize:'12px',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Salir</button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:'1100px',margin:'0 auto',padding:'0 16px'}}>
        <div style={{borderBottom:'1px solid #e2d9cc',display:'flex',gap:'0px',marginTop:'20px'}}>
          <button onClick={() => setActiveTab('subir')} style={tabStyle('subir')}>Subir</button>
          <button onClick={() => setActiveTab('lista')} style={tabStyle('lista')}>Recibos ({recibosFiltrados.length})</button>
          <button onClick={() => setActiveTab('empleados')} style={tabStyle('empleados')}>Empleados ({usuarios.length})</button>
        </div>

        {/* TAB: SUBIR */}
        {activeTab === 'subir' && (
          <div style={{maxWidth:'560px',marginTop:'28px'}}>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'22px',fontWeight:400,color:'#2c1f0e',margin:'0 0 20px'}}>Subir Recibo de Sueldo</h2>
            <form onSubmit={handleUpload} style={{display:'flex',flexDirection:'column',gap:'16px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                <label style={lbl}>Empleado</label>
                <select value={form.user_id} onChange={e => setForm({...form,user_id:e.target.value})} required style={inp}>
                  <option value="">-- Seleccionar empleado --</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:'12px',flexWrap: isMobile ? 'wrap' : 'nowrap'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'5px',flex:1,minWidth:'140px'}}>
                  <label style={lbl}>Fecha del Recibo</label>
                  <input type="date" value={form.fecha} onChange={e => setForm({...form,fecha:e.target.value})} required style={inp} />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'5px',flex:1,minWidth:'140px'}}>
                  <label style={lbl}>Monto (opcional)</label>
                  <input type="number" step="0.01" value={form.monto} onChange={e => setForm({...form,monto:e.target.value})} placeholder="0.00" style={inp} />
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                <label style={lbl}>Descripcion (opcional)</label>
                <input type="text" value={form.descripcion} onChange={e => setForm({...form,descripcion:e.target.value})} placeholder="Liquidacion de haberes" style={inp} />
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                <label style={lbl}>Archivo PDF</label>
                <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} required style={inp} />
              </div>
              {msg && <p style={{margin:0,padding:'10px 12px',borderRadius:'3px',fontSize:'13px',background:msg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:msg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(msg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>{msg.startsWith('OK')?msg.slice(3):msg}</p>}
              <button type="submit" disabled={uploading} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'13px',fontSize:'14px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:uploading?0.7:1}}>{uploading?'Subiendo...':'Subir Recibo'}</button>
            </form>
          </div>
        )}

        {/* TAB: LISTA */}
        {activeTab === 'lista' && (
          <div style={{marginTop:'28px'}}>
            {/* Filtros */}
            <div style={{display:'flex',alignItems: isMobile ? 'flex-start' : 'center',justifyContent:'space-between',marginBottom:'16px',flexDirection: isMobile ? 'column' : 'row',gap:'12px'}}>
              <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'22px',fontWeight:400,color:'#2c1f0e',margin:0}}>Todos los Recibos</h2>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
                <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)} style={{...inpSm,maxWidth: isMobile ? '100%' : '180px'}}>
                  <option value="">Todos los empleados</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
                </select>
                <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={inpSm}>
                  <option value="">Todos los meses</option>
                  {mesesCompletos.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} style={inpSm}>
                  <option value="">Todos los años</option>
                  {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {(filtroUsuario || filtroMes || filtroAnio) && (
                  <button onClick={() => { setFiltroUsuario(''); setFiltroMes(''); setFiltroAnio('') }} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'8px 12px',fontSize:'12px',color:'#8a7560',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Limpiar</button>
                )}
              </div>
            </div>

            {recibosFiltrados.length === 0 ? (
              <p style={{color:'#a89070'}}>No hay recibos para los filtros seleccionados.</p>
            ) : isMobile ? (
              /* Vista mobile: tarjetas */
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {recibosFiltrados.map(r => (
                  <div key={r.id} style={{background:'#fff',borderRadius:'4px',border:'1px solid #ede6d8',overflow:'hidden'}}>
                    {editingRecibo === r.id ? (
                      <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:'10px'}}>
                        <div style={{fontSize:'13px',fontWeight:600,color:'#2c1f0e'}}>{r.profiles && (r.profiles.nombre_completo || r.profiles.email)}</div>
                        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:'3px',flex:1,minWidth:'130px'}}>
                            <label style={lbl}>Fecha</label>
                            <input type="date" value={editReciboForm.fecha} onChange={e => setEditReciboForm({...editReciboForm,fecha:e.target.value})} style={{...inp,padding:'8px 10px',fontSize:'13px'}} />
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:'3px',flex:1,minWidth:'100px'}}>
                            <label style={lbl}>Monto</label>
                            <input type="number" step="0.01" value={editReciboForm.monto} onChange={e => setEditReciboForm({...editReciboForm,monto:e.target.value})} placeholder="0.00" style={{...inp,padding:'8px 10px',fontSize:'13px'}} />
                          </div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                          <label style={lbl}>Descripcion</label>
                          <input type="text" value={editReciboForm.descripcion} onChange={e => setEditReciboForm({...editReciboForm,descripcion:e.target.value})} style={{...inp,padding:'8px 10px',fontSize:'13px'}} />
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                          <label style={lbl}>Reemplazar PDF (opcional)</label>
                          <input type="file" accept=".pdf" onChange={e => setNewReciboFile(e.target.files[0])} style={{...inp,padding:'7px 10px',fontSize:'12px'}} />
                        </div>
                        {reciboMsg && <p style={{margin:0,fontSize:'12px',color:'#b53a2f'}}>{reciboMsg}</p>}
                        <div style={{display:'flex',gap:'6px'}}>
                          <button onClick={() => saveRecibo(r)} disabled={savingRecibo} style={{...btnSm('primary'),opacity:savingRecibo?0.6:1}}>{savingRecibo?'Guardando...':'Guardar'}</button>
                          <button onClick={() => setEditingRecibo(null)} style={btnSm('outline')}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{padding:'14px 16px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                          <div>
                            <div style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e'}}>{r.profiles && (r.profiles.nombre_completo || r.profiles.email)}</div>
                            <div style={{fontSize:'12px',color:'#a89070'}}>{fmtFechaCorta(r.fecha)} · {r.descripcion || 'Liquidacion'}</div>
                          </div>
                          {r.monto && <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600,flexShrink:0}}>$ {parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2})}</div>}
                        </div>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          <button onClick={() => viewRecibo(r)} style={btnSm('outline')}>Ver</button>
                          <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{...btnSm('primary'),opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'Descargar'}</button>
                          <button onClick={() => startEditRecibo(r)} style={btnSm('outline')}>Editar</button>
                          <button onClick={() => deleteRecibo(r)} style={btnSm('danger')}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Vista desktop: tabla */
              <div style={{background:'#fff',borderRadius:'4px',border:'1px solid #ede6d8',overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 130px 160px 110px 190px',padding:'10px 20px',background:'#f7f4ef',borderBottom:'1px solid #ede6d8',gap:'12px'}}>
                  <button onClick={() => toggleSort('nombre')} style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'"DM Sans",sans-serif',padding:0}}>
                    Empleado <SortIcon col="nombre" />
                  </button>
                  <button onClick={() => toggleSort('fecha')} style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'"DM Sans",sans-serif',padding:0}}>
                    Fecha <SortIcon col="fecha" />
                  </button>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Descripcion</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Monto</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Acciones</div>
                </div>
                {recibosFiltrados.map((r, i) => (
                  editingRecibo === r.id ? (
                    <div key={r.id} style={{padding:'16px 20px',borderBottom:i < recibosFiltrados.length-1 ? '1px solid #f3ede3' : 'none',background:'#fdf8f0'}}>
                      <div style={{fontSize:'13px',fontWeight:600,color:'#2c1f0e',marginBottom:'12px'}}>{r.profiles && (r.profiles.nombre_completo || r.profiles.email)}</div>
                      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'10px'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px',minWidth:'140px'}}>
                          <label style={lbl}>Fecha</label>
                          <input type="date" value={editReciboForm.fecha} onChange={e => setEditReciboForm({...editReciboForm,fecha:e.target.value})} style={{...inp,width:'auto',padding:'8px 10px',fontSize:'13px'}} />
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px',flex:1,minWidth:'160px'}}>
                          <label style={lbl}>Descripcion</label>
                          <input type="text" value={editReciboForm.descripcion} onChange={e => setEditReciboForm({...editReciboForm,descripcion:e.target.value})} style={{...inp,width:'auto',padding:'8px 10px',fontSize:'13px'}} />
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px',minWidth:'120px'}}>
                          <label style={lbl}>Monto</label>
                          <input type="number" step="0.01" value={editReciboForm.monto} onChange={e => setEditReciboForm({...editReciboForm,monto:e.target.value})} placeholder="0.00" style={{...inp,width:'auto',padding:'8px 10px',fontSize:'13px'}} />
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px',flex:2,minWidth:'200px'}}>
                          <label style={lbl}>Reemplazar PDF (opcional)</label>
                          <input type="file" accept=".pdf" onChange={e => setNewReciboFile(e.target.files[0])} style={{...inp,width:'auto',padding:'7px 10px',fontSize:'12px'}} />
                        </div>
                      </div>
                      {reciboMsg && <p style={{margin:'0 0 8px',fontSize:'12px',color:'#b53a2f'}}>{reciboMsg}</p>}
                      <div style={{display:'flex',gap:'8px'}}>
                        <button onClick={() => saveRecibo(r)} disabled={savingRecibo} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'7px 16px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:savingRecibo?0.6:1}}>{savingRecibo?'Guardando...':'Guardar cambios'}</button>
                        <button onClick={() => setEditingRecibo(null)} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'7px 14px',fontSize:'13px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 130px 160px 110px 220px',padding:'13px 20px',gap:'12px',alignItems:'center',borderBottom:i < recibosFiltrados.length-1 ? '1px solid #f3ede3' : 'none',background:i%2===0?'#fff':'#fdfbf8'}}>
                      <div>
                        <div style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e'}}>{r.profiles && (r.profiles.nombre_completo || r.profiles.email)}</div>
                        {r.profiles && r.profiles.nombre_completo && <div style={{fontSize:'11px',color:'#a89070'}}>{r.profiles.email}</div>}
                      </div>
                      <div style={{fontSize:'13px',color:'#5c4a32'}}>{fmtFecha(r.fecha)}</div>
                      <div style={{fontSize:'13px',color:'#8a7560'}}>{r.descripcion || 'Liquidacion'}</div>
                      <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600}}>{r.monto ? '$ '+parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2}) : '—'}</div>
                      <div style={{display:'flex',gap:'5px'}}>
                        <button onClick={() => viewRecibo(r)} style={btnSm('outline')}>Ver</button>
                        <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{...btnSm('primary'),opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'Descargar'}</button>
                        <button onClick={() => startEditRecibo(r)} style={btnSm('outline')}>Editar</button>
                        <button onClick={() => deleteRecibo(r)} style={btnSm('danger')}>✕</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: EMPLEADOS */}
        {activeTab === 'empleados' && (
          <div style={{marginTop:'28px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',gap:'12px',flexWrap:'wrap'}}>
              <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'22px',fontWeight:400,color:'#2c1f0e',margin:0}}>Empleados</h2>
              <button
                onClick={() => { setShowNewUser(v => !v); setNewUserMsg(''); setNewUserForm({ email: '', nombre_completo: '', password: '' }) }}
                style={{background: showNewUser ? 'transparent' : '#0f1f3d',color: showNewUser ? '#5c4a32' : '#fff',border: showNewUser ? '1.5px solid #e2d9cc' : 'none',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}
              >{showNewUser ? 'Cancelar' : '+ Nuevo Empleado'}</button>
            </div>

            {/* Formulario nuevo empleado */}
            {showNewUser && (
              <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                <h3 style={{fontFamily:'"DM Serif Display",serif',fontSize:'17px',fontWeight:400,color:'#2c1f0e',margin:'0 0 16px'}}>Crear nuevo empleado</h3>
                <form onSubmit={createUser} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{display:'flex',gap:'12px',flexWrap: isMobile ? 'wrap' : 'nowrap'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'200px'}}>
                      <label style={lbl}>Nombre completo</label>
                      <input
                        type="text"
                        value={newUserForm.nombre_completo}
                        onChange={e => setNewUserForm({...newUserForm, nombre_completo: e.target.value})}
                        placeholder="Juan Perez"
                        style={inp}
                      />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'200px'}}>
                      <label style={lbl}>Email *</label>
                      <input
                        type="email"
                        value={newUserForm.email}
                        onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                        placeholder="empleado@bekmar.com"
                        required
                        style={inp}
                      />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'180px'}}>
                      <label style={lbl}>Contraseña temporal *</label>
                      <input
                        type="text"
                        value={newUserForm.password}
                        onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                        placeholder="Min. 6 caracteres"
                        required
                        style={inp}
                      />
                    </div>
                  </div>
                  {newUserMsg && (
                    <p style={{margin:0,padding:'10px 12px',borderRadius:'3px',fontSize:'13px',background:newUserMsg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:newUserMsg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(newUserMsg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>
                      {newUserMsg.startsWith('OK') ? newUserMsg.slice(3) : newUserMsg}
                    </p>
                  )}
                  <div>
                    <button type="submit" disabled={creatingUser} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'10px 20px',fontSize:'13px',fontWeight:500,cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:creatingUser?0.7:1}}>
                      {creatingUser ? 'Creando...' : 'Crear empleado'}
                    </button>
                  </div>
                </form>
                <p style={{fontSize:'11px',color:'#a89070',margin:'12px 0 0'}}>
                  Nota: si la confirmacion de email esta activada en Supabase, el empleado recibira un email para confirmar su cuenta antes de poder ingresar. Para desactivarla, ir a Authentication → Email → Confirm email en tu proyecto de Supabase.
                </p>
              </div>
            )}

            {editMsg && <p style={{margin:'0 0 14px',padding:'10px 12px',borderRadius:'3px',fontSize:'13px',background:editMsg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:editMsg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(editMsg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>{editMsg.startsWith('OK')?editMsg.slice(3):editMsg}</p>}
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {usuarios.map(u => (
                <div key={u.id} style={{background:'#fff',borderRadius:'4px',padding:'16px 20px',border:'1px solid #ede6d8',opacity: u.activo === false ? 0.65 : 1}}>
                  {editingUser === u.id ? (
                    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                      <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'160px'}}>
                          <label style={lbl}>Nombre completo</label>
                          <input value={editForm.nombre_completo} onChange={e => setEditForm({...editForm,nombre_completo:e.target.value})} style={{...inp,width:'auto'}} placeholder="Nombre y Apellido" />
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'160px'}}>
                          <label style={lbl}>Telefono</label>
                          <input value={editForm.telefono} onChange={e => setEditForm({...editForm,telefono:e.target.value})} style={{...inp,width:'auto'}} placeholder="+598 9X XXX XXX" />
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'8px'}}>
                        <button onClick={() => saveUser(u)} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'8px 18px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Guardar</button>
                        <button onClick={() => { setEditingUser(null); setEditMsg('') }} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                          <div style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e'}}>
                            {u.nombre_completo || <span style={{color:'#a89070',fontStyle:'italic',fontWeight:400}}>Sin nombre</span>}
                          </div>
                          {u.activo === false && <span style={{fontSize:'11px',background:'#fdf2f2',color:'#b53a2f',padding:'2px 7px',borderRadius:'10px',fontWeight:500}}>Sin acceso</span>}
                        </div>
                        <div style={{fontSize:'12px',color:'#a89070',marginTop:'2px'}}>{u.email}</div>
                        {u.telefono && <div style={{fontSize:'12px',color:'#8a7560',marginTop:'2px'}}>Tel: {u.telefono}</div>}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                          <Toggle activo={u.activo} onClick={() => toggleActivo(u)} />
                          <span style={{fontSize:'10px',color:'#a89070'}}>{u.activo !== false ? 'Activo' : 'Bloqueado'}</span>
                        </div>
                        <button
                          onClick={() => { setEditingUser(u.id); setEditForm({ nombre_completo: u.nombre_completo || '', telefono: u.telefono || '' }); setEditMsg('') }}
                          style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'6px 14px',fontSize:'12px',color:'#2c1f0e',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}
                        >Editar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
