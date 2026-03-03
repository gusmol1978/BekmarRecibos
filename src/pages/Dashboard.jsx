import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import logo from '../LogoBekmar.png'

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
function formatFecha(s) { const d = new Date(s+'T00:00:00'); return meses[d.getMonth()]+' '+d.getFullYear() }

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [recibos, setRecibos] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const isAdmin = profile && profile.rol === 'admin'

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

  const nombreUsuario = profile && profile.nombre_completo ? profile.nombre_completo : user && user.email

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
          <div style={{marginBottom:'32px'}}>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'28px',fontWeight:400,color:'#2c1f0e',margin:'0 0 6px'}}>Mis Recibos de Sueldo</h2>
            <p style={{color:'#8a7560',fontSize:'14px',margin:0}}>Accede y descarga tus liquidaciones de haberes</p>
          </div>
          {loading ? (
            <div style={{textAlign:'center',padding:'80px 0',color:'#8a7560'}}>Cargando recibos...</div>
          ) : recibos.length === 0 ? (
            <div style={{textAlign:'center',padding:'80px 0'}}>
              <p style={{color:'#5c4a32',fontSize:'16px',margin:'0 0 6px',fontWeight:500}}>No tenes recibos disponibles aun</p>
              <p style={{color:'#a89070',fontSize:'13px',margin:0}}>Cuando RRHH suba tus recibos apareceran aqui</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              {recibos.map(r => (
                <div key={r.id} style={{background:'#fff',borderRadius:'4px',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 1px 4px rgba(44,31,14,0.05)',border:'1px solid #ede6d8',gap:'16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'16px',flex:1}}>
                    <div style={{background:'#0f1f3d',color:'#7eb3ff',borderRadius:'3px',padding:'6px 8px',fontSize:'10px',fontWeight:700,letterSpacing:'0.05em',flexShrink:0}}>PDF</div>
                    <div>
                      <div style={{fontSize:'15px',fontWeight:600,color:'#2c1f0e',marginBottom:'2px'}}>{formatFecha(r.fecha)}</div>
                      <div style={{fontSize:'12px',color:'#a89070'}}>{r.descripcion || 'Liquidacion de haberes'}</div>
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
