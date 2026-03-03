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

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [recibos, setRecibos] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const isAdmin = profile && profile.rol === 'admin'

  // Filtros
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAnio, setFiltroAnio] = useState('')

  // Ordenamiento
  const [sortField, setSortField] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => { fetchRecibos() }, [user])

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

  async function viewRecibo(recibo) {
    const { data } = await supabase.storage.from('recibos-pdf').createSignedUrl(recibo.archivo_path, 300)
    if (data && data.signedUrl) setPdfUrl(data.signedUrl)
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
          <div style={{marginBottom:'24px'}}>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'28px',fontWeight:400,color:'#2c1f0e',margin:'0 0 6px'}}>Mis Recibos de Sueldo</h2>
            <p style={{color:'#8a7560',fontSize:'14px',margin:0}}>Accede y descarga tus liquidaciones de haberes</p>
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
                <div key={r.id} style={{background:'#fff',borderRadius:'4px',padding:'18px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 1px 4px rgba(44,31,14,0.05)',border:'1px solid #ede6d8',gap:'16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'16px',flex:1,minWidth:0}}>
                    <div style={{background:'#0f1f3d',color:'#7eb3ff',borderRadius:'3px',padding:'6px 8px',fontSize:'10px',fontWeight:700,letterSpacing:'0.05em',flexShrink:0}}>PDF</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'15px',fontWeight:600,color:'#2c1f0e',marginBottom:'2px'}}>{formatFecha(r.fecha)}</div>
                      <div style={{fontSize:'12px',color:'#a89070',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.descripcion || 'Liquidacion de haberes'}</div>
                      {r.monto && <div style={{fontSize:'13px',color:'#2a6a2a',fontWeight:600,marginTop:'4px'}}>$ {parseFloat(r.monto).toLocaleString('es-AR',{minimumFractionDigits:2})}</div>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'8px',flexShrink:0}}>
                    <button onClick={() => viewRecibo(r)} style={{background:'transparent',border:'1.5px solid #0f1f3d',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',color:'#0f1f3d',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>Ver</button>
                    <button onClick={() => downloadRecibo(r)} disabled={downloading===r.id} style={{background:'#0f1f3d',color:'#fff',border:'none',borderRadius:'3px',padding:'8px 16px',fontSize:'13px',cursor:'pointer',fontFamily:'"DM Sans",sans-serif',opacity:downloading===r.id?0.6:1}}>{downloading===r.id?'...':'Descargar'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
