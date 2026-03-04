import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import logo from '../LogoBekmar.png'
import * as XLSX from 'xlsx'

// Cliente sin persistencia de sesion, solo para crear usuarios sin desloguear al admin
const supabaseNoSession = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function FirmaAdminBadge({ recibo }) {
  if (recibo.firmado) {
    const tipo = recibo.firmado_tipo === 'fisico' ? 'Física' : 'Digital'
    const fecha = recibo.firmado_at
      ? new Date(recibo.firmado_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : ''
    return (
      <div style={{display:'flex',flexDirection:'column',gap:'1px'}}>
        <span style={{fontSize:'12px',color:'#16a34a',fontWeight:600}}>✓ {tipo}</span>
        {fecha && <span style={{fontSize:'10px',color:'#86efac'}}>{fecha}</span>}
      </div>
    )
  }
  return <span style={{fontSize:'12px',color:'#d97706',fontWeight:500}}>⏳ Pendiente</span>
}

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
  const [filtroFirmado, setFiltroFirmado] = useState('')
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
  const [listMsg, setListMsg] = useState('')
  const [resetPassId, setResetPassId] = useState(null)
  const [resetPassMsg, setResetPassMsg] = useState({})
  const [empleadosTab, setEmpleadosTab] = useState('activos')

  // Subida masiva
  const [subirMode, setSubirMode] = useState('individual')
  const [bulkPeriodo, setBulkPeriodo] = useState('')
  const [bulkDescripcion, setBulkDescripcion] = useState('Liquidacion de haberes')
  const [bulkCsvRows, setBulkCsvRows] = useState([])
  const [bulkPdfMap, setBulkPdfMap] = useState({})
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [bulkResults, setBulkResults] = useState([])
  const [bulkMsg, setBulkMsg] = useState('')

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
      .order('fecha', { ascending: false })
      .limit(1000)
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
    setListMsg('')
    if (!recibo.archivo_path) { setListMsg('Este recibo no tiene archivo adjunto.'); return }
    const { data, error } = await supabase.storage.from('recibos-pdf').createSignedUrl(recibo.archivo_path, 300)
    if (error || !data?.signedUrl) {
      setListMsg('No se pudo abrir el archivo. Verificá los permisos de Storage en Supabase (ver instrucciones de políticas).')
      return
    }
    setPdfUrl(data.signedUrl)
  }

  async function downloadRecibo(recibo) {
    setListMsg('')
    if (!recibo.archivo_path) { setListMsg('Este recibo no tiene archivo adjunto.'); return }
    setDownloading(recibo.id)
    const { data, error } = await supabase.storage.from('recibos-pdf').download(recibo.archivo_path)
    if (!error && data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = recibo.nombre_archivo || 'recibo.pdf'; a.click()
      URL.revokeObjectURL(url)
    } else {
      setListMsg('No se pudo descargar el archivo. Verificá los permisos de Storage en Supabase (ver instrucciones de políticas).')
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
    const { data: updated, error } = await supabase.from('recibos').update({
      fecha: editReciboForm.fecha,
      descripcion: editReciboForm.descripcion || 'Liquidacion de haberes',
      monto: editReciboForm.monto ? parseFloat(editReciboForm.monto) : null,
      archivo_path, nombre_archivo,
    }).eq('id', r.id).select()
    if (error) setReciboMsg('Error: ' + error.message)
    else if (!updated || updated.length === 0) setReciboMsg('No se guardaron los cambios. Falta la política RLS de UPDATE para admin en Supabase (ver instrucciones de políticas).')
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
    const { data, error } = await supabaseNoSession.auth.signUp({
      email: newUserForm.email,
      password: newUserForm.password,
      options: { data: { nombre_completo: newUserForm.nombre_completo } }
    })
    if (error) {
      setNewUserMsg('Error: ' + error.message)
      setCreatingUser(false)
      return
    }
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      setNewUserMsg('Error: Ya existe un usuario registrado con ese email')
      setCreatingUser(false)
      return
    }
    if (newUserForm.nombre_completo) {
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

  async function sendResetPassword(u) {
    setResetPassMsg(prev => ({ ...prev, [u.id]: 'enviando' }))
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
      redirectTo: window.location.origin + '/reset-password'
    })
    if (error) setResetPassMsg(prev => ({ ...prev, [u.id]: 'Error: ' + error.message }))
    else setResetPassMsg(prev => ({ ...prev, [u.id]: 'OK Email enviado a ' + u.email }))
    setResetPassId(null)
  }

  async function validarFirmaFisica(r) {
    const nombre = r.profiles?.nombre_completo || r.profiles?.email || 'este empleado'
    if (!window.confirm(`¿Validar firma física del recibo de ${nombre}?\n\nEsto registrará que el empleado firmó el recibo en papel.`)) return
    const { error } = await supabase.from('recibos').update({
      firmado: true,
      firmado_at: new Date().toISOString(),
      firmado_tipo: 'fisico'
    }).eq('id', r.id)
    if (error) setListMsg('Error al validar firma: ' + error.message)
    else fetchRecibos()
  }

  function enviarAviso(u) {
    const sinFirmar = recibos.filter(r => r.user_id === u.id && !r.firmado)
    const count = sinFirmar.length
    if (count === 0) {
      alert(`${u.nombre_completo || u.email} no tiene recibos pendientes de firma.`)
      return
    }
    const subject = encodeURIComponent('Recibos pendientes de firma - Bekmar Distribuciones')
    const body = encodeURIComponent(
      `Hola ${u.nombre_completo || ''},\n\n` +
      `Tenés ${count} recibo${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''} de firma en el Portal de Recibos de Bekmar Distribuciones.\n\n` +
      `Por favor ingresá al portal para revisarlos y firmarlos:\n${window.location.origin}\n\n` +
      `Saludos,\nRRHH - Bekmar Distribuciones`
    )
    window.open(`mailto:${u.email}?subject=${subject}&body=${body}`)
  }

  // ── SUBIDA MASIVA ──────────────────────────────────────────────

  const usuariosActivos   = usuarios.filter(u => u.activo !== false)
  const usuariosInactivos = usuarios.filter(u => u.activo === false)

  function countSinFirmar(userId) {
    return recibos.filter(r => r.user_id === userId && !r.firmado).length
  }

  function downloadPlantilla() {
    const wsData = [
      ['email', 'nombre_completo', 'monto', 'descripcion', 'archivo'],
      ...usuariosActivos.map(u => [u.email, u.nombre_completo || '', '', 'Liquidacion de haberes', ''])
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 32 }, { wch: 26 }, { wch: 12 }, { wch: 28 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recibos')
    XLSX.writeFile(wb, `plantilla_recibos${bulkPeriodo ? '_' + bulkPeriodo : ''}.xlsx`)
  }

  function parseExcelFile(file) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (rawRows.length === 0) { setBulkMsg('El archivo Excel no tiene datos.'); return }
        const rows = rawRows.map(row => {
          const obj = {}
          Object.keys(row).forEach(k => { obj[k.toLowerCase().trim()] = String(row[k] ?? '').trim() })
          return obj
        }).filter(r => r.email)
        if (rows.length === 0) { setBulkMsg('No se encontró la columna "email" en el archivo.'); return }
        setBulkCsvRows(rows)
        setBulkMsg('')
      } catch (err) {
        setBulkMsg('Error al leer el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleBulkPdfs(files) {
    const map = {}
    Array.from(files).forEach(f => { map[f.name] = f })
    setBulkPdfMap(map)
  }

  async function handleBulkUpload() {
    if (!bulkPeriodo) return setBulkMsg('Seleccioná el período (mes y año)')
    if (bulkCsvRows.length === 0) return setBulkMsg('Cargá el archivo CSV primero')
    const fecha = bulkPeriodo + '-01'
    setBulkUploading(true); setBulkResults([]); setBulkMsg('')
    const results = []
    for (let i = 0; i < bulkCsvRows.length; i++) {
      const row = bulkCsvRows[i]
      setBulkProgress({ current: i + 1, total: bulkCsvRows.length })
      const emp = usuarios.find(u => u.email.toLowerCase() === (row.email || '').toLowerCase())
      if (!emp) {
        results.push({ nombre: row.nombre_completo || row.email, email: row.email, archivo: row.archivo, status: 'error', msg: 'Empleado no encontrado en el sistema' })
        continue
      }
      const pdfFile = bulkPdfMap[row.archivo]
      if (!pdfFile) {
        results.push({ nombre: emp.nombre_completo || emp.email, email: emp.email, archivo: row.archivo, status: 'error', msg: `Archivo "${row.archivo}" no seleccionado` })
        continue
      }
      const ext = pdfFile.name.split('.').pop()
      const base = pdfFile.name.replace(/\.[^/.]+$/, '')
      const storedName = `${base}_${bulkPeriodo}.${ext}`
      const path = `${emp.id}/${fecha}-${Date.now()}-${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('recibos-pdf').upload(path, pdfFile, { contentType: 'application/pdf' })
      if (upErr) {
        results.push({ nombre: emp.nombre_completo || emp.email, email: emp.email, archivo: row.archivo, status: 'error', msg: upErr.message })
        continue
      }
      const desc = row.descripcion || bulkDescripcion || 'Liquidacion de haberes'
      const { error: dbErr } = await supabase.from('recibos').insert({
        user_id: emp.id, fecha,
        descripcion: desc,
        monto: row.monto ? parseFloat(row.monto) : null,
        archivo_path: path, nombre_archivo: storedName, subido_por: user.id
      })
      if (dbErr) {
        await supabase.storage.from('recibos-pdf').remove([path])
        results.push({ nombre: emp.nombre_completo || emp.email, email: emp.email, archivo: row.archivo, status: 'error', msg: dbErr.message })
      } else {
        results.push({ nombre: emp.nombre_completo || emp.email, email: emp.email, archivo: storedName, status: 'ok', msg: 'Subido correctamente' })
      }
    }
    setBulkResults(results)
    setBulkProgress(null)
    setBulkUploading(false)
    fetchRecibos()
  }

  // Preview de la carga masiva (computed)
  const bulkPreview = bulkCsvRows.map(row => {
    const emp = usuarios.find(u => u.email.toLowerCase() === (row.email || '').toLowerCase())
    const pdfOk = !!bulkPdfMap[row.archivo]
    const empOk = !!emp
    return { ...row, nombre: emp?.nombre_completo || row.nombre_completo || row.email, empOk, pdfOk, ready: empOk && pdfOk && !!row.archivo }
  })
  const bulkReadyCount = bulkPreview.filter(r => r.ready).length

  // ───────────────────────────────────────────────────────────────

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
      if (filtroFirmado === 'si' && !r.firmado) return false
      if (filtroFirmado === 'no' && r.firmado) return false
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
    background: variant === 'primary' ? '#0f1f3d' : variant === 'green' ? '#16a34a' : 'transparent',
    color: variant === 'primary' ? '#fff' : variant === 'green' ? '#fff' : variant === 'danger' ? '#b53a2f' : '#0f1f3d',
    border: (variant === 'primary' || variant === 'green') ? 'none' : `1.5px solid ${variant === 'danger' ? '#e2d9cc' : '#0f1f3d'}`,
    borderRadius:'3px', padding:'6px 10px', fontSize:'12px', cursor:'pointer',
    fontFamily:'"DM Sans",sans-serif', whiteSpace:'nowrap'
  })

  const hayFiltrosLista = filtroUsuario || filtroMes || filtroAnio || filtroFirmado

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
          <button onClick={() => setActiveTab('empleados')} style={tabStyle('empleados')}>Empleados ({usuariosActivos.length})</button>
        </div>

        {/* TAB: SUBIR */}
        {activeTab === 'subir' && (
          <div style={{marginTop:'28px'}}>
            {/* Toggle Individual / Masiva */}
            <div style={{display:'flex',gap:'0',marginBottom:'28px',background:'#ede6d8',borderRadius:'4px',padding:'3px',width:'fit-content'}}>
              {['individual','masiva'].map(mode => (
                <button key={mode} onClick={() => { setSubirMode(mode); setMsg(''); setBulkMsg(''); setBulkResults([]); setBulkProgress(null) }}
                  style={{padding:'7px 20px',fontSize:'13px',fontWeight:500,cursor:'pointer',border:'none',borderRadius:'3px',fontFamily:'"DM Sans",sans-serif',
                    background: subirMode === mode ? '#0f1f3d' : 'transparent',
                    color: subirMode === mode ? '#fff' : '#8a7560'}}>
                  {mode === 'individual' ? 'Individual' : 'Masiva'}
                </button>
              ))}
            </div>

            {/* MODO INDIVIDUAL */}
            {subirMode === 'individual' && (
              <div style={{maxWidth:'560px'}}>
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

            {/* MODO MASIVA */}
            {subirMode === 'masiva' && (
              <div style={{maxWidth:'860px'}}>
                <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'22px',fontWeight:400,color:'#2c1f0e',margin:'0 0 6px'}}>Subida Masiva de Recibos</h2>
                <p style={{color:'#8a7560',fontSize:'13px',margin:'0 0 24px'}}>Subí los recibos de todos los empleados para un mismo período en un solo paso.</p>

                <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                  <div style={{fontWeight:600,fontSize:'13px',color:'#2c1f0e',marginBottom:'14px'}}>1. Configurá el período</div>
                  <div style={{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'flex-end'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'5px',minWidth:'180px'}}>
                      <label style={lbl}>Período (mes y año)</label>
                      <input type="month" value={bulkPeriodo} onChange={e => setBulkPeriodo(e.target.value)} style={inp} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'5px',flex:1,minWidth:'220px'}}>
                      <label style={lbl}>Descripcion (para todos)</label>
                      <input type="text" value={bulkDescripcion} onChange={e => setBulkDescripcion(e.target.value)} placeholder="Liquidacion de haberes" style={inp} />
                    </div>
                  </div>
                </div>

                <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                  <div style={{fontWeight:600,fontSize:'13px',color:'#2c1f0e',marginBottom:'6px'}}>2. Descargá la plantilla Excel</div>
                  <p style={{color:'#8a7560',fontSize:'13px',margin:'0 0 14px'}}>Tiene todos los empleados cargados. Completá la columna <strong>monto</strong> y <strong>archivo</strong> (nombre del PDF de cada empleado, ej: bonilla.pdf).</p>
                  <button onClick={downloadPlantilla} style={{background:'transparent',border:'1.5px solid #0f1f3d',borderRadius:'3px',padding:'9px 18px',fontSize:'13px',color:'#0f1f3d',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:500}}>
                    ↓ Descargar plantilla Excel
                  </button>
                  <div style={{marginTop:'10px',background:'#f7f4ef',borderRadius:'3px',padding:'10px 14px',fontSize:'11px',color:'#8a7560'}}>
                    <strong>Columnas:</strong> email · nombre_completo · monto · descripcion · archivo<br/>
                    <span style={{fontFamily:'monospace'}}>alvaro@gmail.com | Alvaro Bonilla | 15000 | Liquidacion de haberes | bonilla.pdf</span>
                  </div>
                </div>

                <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                  <div style={{fontWeight:600,fontSize:'13px',color:'#2c1f0e',marginBottom:'14px'}}>3. Cargá el CSV completado y los PDFs</div>
                  <div style={{display:'flex',gap:'16px',flexWrap:'wrap'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'5px',flex:1,minWidth:'220px'}}>
                      <label style={lbl}>Archivo Excel completado (.xlsx)</label>
                      <input type="file" accept=".xlsx,.xls" onChange={e => e.target.files[0] && parseExcelFile(e.target.files[0])} style={inp} />
                      {bulkCsvRows.length > 0 && <span style={{fontSize:'12px',color:'#2a6a2a'}}>✓ {bulkCsvRows.length} empleados cargados del Excel</span>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'5px',flex:1,minWidth:'220px'}}>
                      <label style={lbl}>Archivos PDF (todos juntos)</label>
                      <input type="file" accept=".pdf" multiple onChange={e => handleBulkPdfs(e.target.files)} style={inp} />
                      {Object.keys(bulkPdfMap).length > 0 && <span style={{fontSize:'12px',color:'#2a6a2a'}}>✓ {Object.keys(bulkPdfMap).length} PDFs seleccionados</span>}
                    </div>
                  </div>
                </div>

                {bulkPreview.length > 0 && bulkResults.length === 0 && (
                  <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',overflow:'hidden',marginBottom:'20px'}}>
                    <div style={{padding:'12px 20px',background:'#f7f4ef',borderBottom:'1px solid #ede6d8',display:'grid',gridTemplateColumns:'1fr 1fr 100px 80px',gap:'12px'}}>
                      {['Empleado','Archivo PDF','Monto','Estado'].map(h => (
                        <div key={h} style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</div>
                      ))}
                    </div>
                    {bulkPreview.map((row, i) => (
                      <div key={i} style={{padding:'11px 20px',borderBottom:i < bulkPreview.length-1?'1px solid #f3ede3':'none',display:'grid',gridTemplateColumns:'1fr 1fr 100px 80px',gap:'12px',alignItems:'center',background:i%2===0?'#fff':'#fdfbf8'}}>
                        <div>
                          <div style={{fontSize:'13px',fontWeight:600,color:'#2c1f0e'}}>{row.nombre}</div>
                          <div style={{fontSize:'11px',color:'#a89070'}}>{row.email}</div>
                        </div>
                        <div style={{fontSize:'13px',color: row.pdfOk ? '#5c4a32' : '#b53a2f'}}>
                          {row.archivo || <span style={{color:'#b53a2f',fontStyle:'italic'}}>Sin archivo</span>}
                          {row.archivo && !row.pdfOk && <span style={{fontSize:'11px',color:'#b53a2f',display:'block'}}>No encontrado</span>}
                          {row.pdfOk && <span style={{fontSize:'11px',color:'#2a6a2a',display:'block'}}>→ {row.archivo?.replace(/\.[^/.]+$/, '')}_{bulkPeriodo}.{row.archivo?.split('.').pop()}</span>}
                        </div>
                        <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600}}>{row.monto ? '$ '+parseFloat(row.monto).toLocaleString('es-AR',{minimumFractionDigits:2}) : '—'}</div>
                        <div style={{fontSize:'12px',fontWeight:600,color: row.ready ? '#2a6a2a' : '#b53a2f'}}>
                          {row.ready ? '✓ Listo' : !row.empOk ? '✗ Sin usuario' : !row.archivo ? '✗ Sin archivo' : '✗ PDF faltante'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {bulkMsg && <p style={{margin:'0 0 16px',padding:'10px 12px',borderRadius:'3px',fontSize:'13px',background:'#fdf2f2',color:'#b53a2f',borderLeft:'3px solid #b53a2f'}}>{bulkMsg}</p>}

                {bulkUploading && bulkProgress && (
                  <div style={{marginBottom:'16px'}}>
                    <div style={{fontSize:'13px',color:'#5c4a32',marginBottom:'6px'}}>Subiendo {bulkProgress.current} de {bulkProgress.total}...</div>
                    <div style={{background:'#ede6d8',borderRadius:'99px',height:'6px',overflow:'hidden'}}>
                      <div style={{background:'#0f1f3d',height:'100%',borderRadius:'99px',width:`${(bulkProgress.current/bulkProgress.total)*100}%`,transition:'width 0.3s'}} />
                    </div>
                  </div>
                )}

                {bulkResults.length > 0 && (
                  <div style={{marginBottom:'20px'}}>
                    <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',overflow:'hidden',marginBottom:'12px'}}>
                      <div style={{padding:'12px 20px',background:'#f7f4ef',borderBottom:'1px solid #ede6d8',fontSize:'13px',fontWeight:600,color:'#2c1f0e'}}>
                        Resultado: {bulkResults.filter(r=>r.status==='ok').length} ok · {bulkResults.filter(r=>r.status==='error').length} con error
                      </div>
                      {bulkResults.map((r, i) => (
                        <div key={i} style={{padding:'10px 20px',borderBottom:i<bulkResults.length-1?'1px solid #f3ede3':'none',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',background:i%2===0?'#fff':'#fdfbf8'}}>
                          <div>
                            <span style={{fontSize:'13px',fontWeight:600,color:'#2c1f0e'}}>{r.nombre}</span>
                            <span style={{fontSize:'12px',color:'#a89070',marginLeft:'8px'}}>{r.archivo}</span>
                          </div>
                          <span style={{fontSize:'12px',fontWeight:600,color:r.status==='ok'?'#2a6a2a':'#b53a2f',flexShrink:0}}>
                            {r.status==='ok' ? '✓ ' + r.msg : '✗ ' + r.msg}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => { setBulkResults([]); setBulkCsvRows([]); setBulkPdfMap({}); setBulkPeriodo(''); setBulkProgress(null) }}
                      style={{background:'transparent',border:'1.5px solid #0f1f3d',borderRadius:'3px',padding:'8px 18px',fontSize:'13px',color:'#0f1f3d',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                      Subir otro período
                    </button>
                  </div>
                )}

                {bulkResults.length === 0 && (
                  <button onClick={handleBulkUpload} disabled={bulkUploading || bulkReadyCount === 0}
                    style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'13px 28px',fontSize:'14px',fontWeight:500,cursor:bulkReadyCount===0?'not-allowed':'pointer',fontFamily:'"DM Sans",sans-serif',opacity:bulkUploading||bulkReadyCount===0?0.5:1}}>
                    {bulkUploading ? 'Subiendo...' : `Subir ${bulkReadyCount} recibo${bulkReadyCount !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}
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
                <select value={filtroFirmado} onChange={e => setFiltroFirmado(e.target.value)} style={inpSm}>
                  <option value="">Todos (firma)</option>
                  <option value="no">⏳ Sin firmar</option>
                  <option value="si">✓ Firmados</option>
                </select>
                {hayFiltrosLista && (
                  <button onClick={() => { setFiltroUsuario(''); setFiltroMes(''); setFiltroAnio(''); setFiltroFirmado('') }} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'8px 12px',fontSize:'12px',color:'#8a7560',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Limpiar</button>
                )}
              </div>
            </div>

            {listMsg && (
              <div style={{marginBottom:'12px',padding:'10px 14px',borderRadius:'3px',fontSize:'13px',background:'#fdf2f2',color:'#b53a2f',borderLeft:'3px solid #b53a2f'}}>
                {listMsg}
              </div>
            )}

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
                          {r.nombre_archivo && !newReciboFile && <span style={{fontSize:'11px',color:'#8a7560',marginTop:'3px'}}>Actual: {r.nombre_archivo}</span>}
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
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px'}}>
                            {r.monto && <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600}}>$ {parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2})}</div>}
                            <FirmaAdminBadge recibo={r} />
                          </div>
                        </div>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          <button onClick={() => viewRecibo(r)} style={btnSm('outline')}>Ver</button>
                          <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{...btnSm('primary'),opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'Descargar'}</button>
                          <button onClick={() => startEditRecibo(r)} style={btnSm('outline')}>Editar</button>
                          {!r.firmado && <button onClick={() => validarFirmaFisica(r)} style={btnSm('green')}>✓ Firma física</button>}
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
                <div style={{display:'grid',gridTemplateColumns:'1fr 120px 150px 100px 120px 230px',padding:'10px 20px',background:'#f7f4ef',borderBottom:'1px solid #ede6d8',gap:'12px'}}>
                  <button onClick={() => toggleSort('nombre')} style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'"DM Sans",sans-serif',padding:0}}>
                    Empleado <SortIcon col="nombre" />
                  </button>
                  <button onClick={() => toggleSort('fecha')} style={{background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'"DM Sans",sans-serif',padding:0}}>
                    Fecha <SortIcon col="fecha" />
                  </button>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Descripcion</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Monto</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:'#5c4a32',textTransform:'uppercase',letterSpacing:'0.08em'}}>Firma</div>
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
                          {r.nombre_archivo && !newReciboFile && <span style={{fontSize:'11px',color:'#8a7560',marginTop:'3px'}}>Actual: {r.nombre_archivo}</span>}
                        </div>
                      </div>
                      {reciboMsg && <p style={{margin:'0 0 8px',fontSize:'12px',color:'#b53a2f'}}>{reciboMsg}</p>}
                      <div style={{display:'flex',gap:'8px'}}>
                        <button onClick={() => saveRecibo(r)} disabled={savingRecibo} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'7px 16px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:savingRecibo?0.6:1}}>{savingRecibo?'Guardando...':'Guardar cambios'}</button>
                        <button onClick={() => setEditingRecibo(null)} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'7px 14px',fontSize:'13px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={r.id} style={{display:'grid',gridTemplateColumns:'1fr 120px 150px 100px 120px 230px',padding:'13px 20px',gap:'12px',alignItems:'center',borderBottom:i < recibosFiltrados.length-1 ? '1px solid #f3ede3' : 'none',background:i%2===0?'#fff':'#fdfbf8'}}>
                      <div>
                        <div style={{fontSize:'14px',fontWeight:600,color:'#2c1f0e'}}>{r.profiles && (r.profiles.nombre_completo || r.profiles.email)}</div>
                        {r.profiles && r.profiles.nombre_completo && <div style={{fontSize:'11px',color:'#a89070'}}>{r.profiles.email}</div>}
                      </div>
                      <div style={{fontSize:'13px',color:'#5c4a32'}}>{fmtFecha(r.fecha)}</div>
                      <div style={{fontSize:'13px',color:'#8a7560'}}>{r.descripcion || 'Liquidacion'}</div>
                      <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600}}>{r.monto ? '$ '+parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2}) : '—'}</div>
                      <div><FirmaAdminBadge recibo={r} /></div>
                      <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                        <button onClick={() => viewRecibo(r)} style={btnSm('outline')}>Ver</button>
                        <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{...btnSm('primary'),opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'↓'}</button>
                        <button onClick={() => startEditRecibo(r)} style={btnSm('outline')}>Editar</button>
                        {!r.firmado && <button onClick={() => validarFirmaFisica(r)} title="Validar firma física" style={btnSm('green')}>✓ Fís.</button>}
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

            {/* Sub-tabs Activos / Sin acceso */}
            <div style={{display:'flex',gap:'0',marginBottom:'16px',borderBottom:'1px solid #e2d9cc'}}>
              <button onClick={() => setEmpleadosTab('activos')}
                style={{padding:'7px 18px',fontSize:'13px',fontWeight:500,cursor:'pointer',border:'none',background:'transparent',fontFamily:'"DM Sans",sans-serif',
                  color: empleadosTab==='activos' ? '#2c1f0e' : '#a89070',
                  borderBottom: empleadosTab==='activos' ? '2px solid #c8a96e' : '2px solid transparent'}}>
                Activos ({usuariosActivos.length})
              </button>
              <button onClick={() => setEmpleadosTab('inactivos')}
                style={{padding:'7px 18px',fontSize:'13px',fontWeight:500,cursor:'pointer',border:'none',background:'transparent',fontFamily:'"DM Sans",sans-serif',
                  color: empleadosTab==='inactivos' ? '#2c1f0e' : '#a89070',
                  borderBottom: empleadosTab==='inactivos' ? '2px solid #c8a96e' : '2px solid transparent'}}>
                Sin acceso ({usuariosInactivos.length})
              </button>
            </div>

            {/* Formulario nuevo empleado */}
            {showNewUser && (
              <div style={{background:'#fff',border:'1px solid #ede6d8',borderRadius:'4px',padding:'20px',marginBottom:'20px'}}>
                <h3 style={{fontFamily:'"DM Serif Display",serif',fontSize:'17px',fontWeight:400,color:'#2c1f0e',margin:'0 0 16px'}}>Crear nuevo empleado</h3>
                <form onSubmit={createUser} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{display:'flex',gap:'12px',flexWrap: isMobile ? 'wrap' : 'nowrap'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'200px'}}>
                      <label style={lbl}>Nombre completo</label>
                      <input type="text" value={newUserForm.nombre_completo} onChange={e => setNewUserForm({...newUserForm, nombre_completo: e.target.value})} placeholder="Juan Perez" style={inp} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'200px'}}>
                      <label style={lbl}>Email *</label>
                      <input type="email" value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} placeholder="empleado@bekmar.com" required style={inp} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'180px'}}>
                      <label style={lbl}>Contraseña temporal *</label>
                      <input type="text" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} placeholder="Min. 6 caracteres" required style={inp} />
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
                  Nota: si la confirmacion de email esta activada en Supabase, el empleado recibira un email para confirmar su cuenta antes de poder ingresar.
                </p>
              </div>
            )}

            {editMsg && <p style={{margin:'0 0 14px',padding:'10px 12px',borderRadius:'3px',fontSize:'13px',background:editMsg.startsWith('OK')?'#f0fdf0':'#fdf2f2',color:editMsg.startsWith('OK')?'#2a7a2a':'#b53a2f',borderLeft:'3px solid '+(editMsg.startsWith('OK')?'#2a7a2a':'#b53a2f')}}>{editMsg.startsWith('OK')?editMsg.slice(3):editMsg}</p>}
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {(empleadosTab === 'activos' ? usuariosActivos : usuariosInactivos).map(u => {
                const sinFirmar = countSinFirmar(u.id)
                return (
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
                          <div style={{display:'flex',flexDirection:'column',gap:'4px',flex:1,minWidth:'200px'}}>
                            <label style={lbl}>Email (no editable)</label>
                            <input value={u.email} disabled style={{...inp,width:'auto',background:'#f0ece6',color:'#a89070',cursor:'not-allowed'}} />
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
                            {sinFirmar > 0 && (
                              <span style={{fontSize:'11px',background:'#fffbeb',color:'#d97706',padding:'2px 7px',borderRadius:'10px',fontWeight:600,border:'1px solid #fcd34d'}}>
                                ⏳ {sinFirmar} sin firmar
                              </span>
                            )}
                          </div>
                          <div style={{fontSize:'12px',color:'#a89070',marginTop:'2px'}}>{u.email}</div>
                          {u.telefono && <div style={{fontSize:'12px',color:'#8a7560',marginTop:'2px'}}>Tel: {u.telefono}</div>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                            <Toggle activo={u.activo} onClick={() => toggleActivo(u)} />
                            <span style={{fontSize:'10px',color:'#a89070'}}>{u.activo !== false ? 'Activo' : 'Bloqueado'}</span>
                          </div>
                          <button
                            onClick={() => { setEditingUser(u.id); setEditForm({ nombre_completo: u.nombre_completo || '', telefono: u.telefono || '' }); setEditMsg('') }}
                            style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'6px 12px',fontSize:'12px',color:'#2c1f0e',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}
                          >Editar</button>
                          {/* Enviar aviso de recibos sin firmar */}
                          {sinFirmar > 0 && u.activo !== false && (
                            <button
                              onClick={() => enviarAviso(u)}
                              title={`Enviar aviso por email: ${sinFirmar} recibo${sinFirmar !== 1 ? 's' : ''} sin firmar`}
                              style={{background:'#fffbeb',border:'1.5px solid #fcd34d',borderRadius:'3px',padding:'6px 12px',fontSize:'12px',color:'#92400e',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',fontWeight:500}}
                            >
                              ✉ Avisar
                            </button>
                          )}
                          {resetPassId === u.id ? (
                            <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                              <span style={{fontSize:'12px',color:'#5c4a32'}}>¿Enviar reset?</span>
                              <button onClick={() => sendResetPassword(u)} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'5px 10px',fontSize:'11px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Sí</button>
                              <button onClick={() => setResetPassId(null)} style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'5px 8px',fontSize:'11px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>No</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setResetPassId(u.id); setResetPassMsg(prev => ({...prev, [u.id]: ''})) }}
                              style={{background:'transparent',border:'1.5px solid #e2d9cc',borderRadius:'3px',padding:'6px 12px',fontSize:'12px',color:'#5c4a32',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}
                            >Reset pass</button>
                          )}
                          {resetPassMsg[u.id] && resetPassMsg[u.id] !== 'enviando' && (
                            <span style={{fontSize:'11px',color:resetPassMsg[u.id].startsWith('OK')?'#2a7a2a':'#b53a2f'}}>
                              {resetPassMsg[u.id].startsWith('OK') ? resetPassMsg[u.id].slice(3) : resetPassMsg[u.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
