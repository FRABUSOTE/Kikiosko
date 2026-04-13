/* eslint-disable */
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { QRCodeSVG as QRCode } from "qrcode.react";

// ─── DATOS INICIALES ───
const SUPERADMIN = { email: "admin@kikiosko.pe", clave: "admin123" };

const PLANES = [
  { id: "Básico", precio: 29 },
  { id: "Pro", precio: 59 },
  { id: "Premium", precio: 99 },
];

function fmtFecha(f) {
  if (!f) return "—";
  const parts = f.split("-");
  if (parts.length !== 3) return f;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function diasRestantes(f) {
  if (!f) return 999;
  return Math.ceil((new Date(f) - new Date()) / (1000 * 60 * 60 * 24));
}

// ─── SUPER ADMIN ───
function SuperAdmin({ onSalir }) {
  const [kioskos, setKioskos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [toast, setToast] = useState(null);
  const [vistaProductos, setVistaProductos] = useState(null);
  const [nuevoKiosko, setNuevoKiosko] = useState({ nombre: "", dueno: "", email: "", clave: "", whatsapp: "", plan: "Pro", vence: "" });
  const fileRef = useRef();

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2500); };

  // Cargar kioskos desde Supabase
  useEffect(() => {
    cargarKioskos();
  }, []);

 const cargarKioskos = async () => {
  setCargando(true);
  
  const { data, error } = await supabase
    .from("kioskos")
    .select(`
      *,
      productos (*)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    mostrarToast("Error cargando kioskos", "error");
  } else {
    setKioskos(data);
  }
  
  setCargando(false);
};

  const toggleAcceso = async (id) => {
    const kiosko = kioskos.find(k => k.id === id);
    const nuevoActivo = !kiosko.activo;
    await supabase.from("kioskos").update({ activo: nuevoActivo }).eq("id", id);
    setKioskos(prev => prev.map(k => {
      if (k.id === id) {
        const nuevo = { ...k, activo: nuevoActivo };
        mostrarToast(nuevoActivo ? "✅ Acceso activado" : "❌ Acceso desactivado", nuevoActivo ? "ok" : "error");
        if (detalle?.id === id) setDetalle(nuevo);
        return nuevo;
      }
      return k;
    }));
  };

  const cambiarPlan = async (id, plan) => {
    const monto = PLANES.find(p => p.id === plan)?.precio || 59;
    await supabase.from("kioskos").update({ plan, monto }).eq("id", id);
    setKioskos(prev => prev.map(k => k.id === id ? { ...k, plan, monto } : k));
    setDetalle(prev => prev ? { ...prev, plan, monto } : null);
    mostrarToast(`✅ Plan cambiado a ${plan}`);
  };

  const enviarWhatsApp = (k) => {
    const msg = encodeURIComponent(`Hola ${k.dueno.split(" ")[0]}! 👋\n\nAquí están tus accesos a KiKiosko 🏪\n\n🛒 Link para tus compradores:\nkikiosko-vyvv.vercel.app/#/${k.slug}\n← Comparte este link con tus clientes\n\n⚙️ Tu panel de administrador:\nkikiosko-vyvv.vercel.app\n👤 Usuario: ${k.email}\n🔑 Clave: ${k.clave}\n\n📅 Acceso hasta: ${fmtFecha(k.vence)}\n\nCualquier consulta escríbeme 😊`);
    window.open(`https://wa.me/51${k.whatsapp}?text=${msg}`, "_blank");
  };

  const crearKiosko = async () => {
    const monto = PLANES.find(p => p.id === nuevoKiosko.plan)?.precio || 59;
    const slug = nuevoKiosko.nombre.toLowerCase().replace(/\s+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 20);
    const { data, error } = await supabase.from("kioskos").insert([{ ...nuevoKiosko, monto, slug, activo: true, pagos: 0 }]).select();
    if (error) { mostrarToast("Error creando kiosko", "error"); return; }
    setKioskos(prev => [...prev, { ...data[0], productos: [] }]);
    setModalNuevo(false);
    setNuevoKiosko({ nombre: "", dueno: "", email: "", clave: "", whatsapp: "", plan: "Pro", vence: "" });
    mostrarToast("✅ Kiosko creado exitosamente");
  };

const subirExcel = async (kioskoid, e) => {
    const file = e.target.files[0];
    if (!file) return;
    mostrarToast("⏳ Leyendo Excel...", "ok");

    try {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!filas || filas.length === 0) {
        mostrarToast("❌ El Excel está vacío", "error");
        return;
      }

     const productos = filas.map(fila => {
  const get = (keys) => {
    for (const k of keys) {
      const found = Object.keys(fila).find(f => f.toLowerCase().trim() === k.toLowerCase());
      if (found) return fila[found];
    }
    return "";
  };

  // 1. Capturamos los datos básicos
  const precioBaseExcel = parseFloat(get(["precio", "costo"])) || 0;
  const variacionesTexto = get(["variaciones", "tallas", "sabores", "presentacion"]);
  
  let variacionesFinales = [];
  let precioParaCatalogo = precioBaseExcel;

  // 2. Procesamos las variaciones si existen
  if (variacionesTexto && String(variacionesTexto).trim() !== "") {
    variacionesFinales = String(variacionesTexto).split(',').map(v => {
      const partes = v.split(':');
      const nombre = partes[0].trim();
      
      // REGLA: Si pusiste "Familiar:45" usa 45. Si solo pusiste "Familiar" usa el precio base.
      const precioV = partes[1] ? parseFloat(partes[1]) : precioBaseExcel;
      
      return { 
        nombre: nombre, 
        precio: precioV 
      };
    });

    // REGLA DE ORO: El precio que ve el cliente en el catálogo 
    // será siempre el más bajo de todas las variaciones.
    const todosLosPrecios = variacionesFinales.map(v => v.precio);
    precioParaCatalogo = Math.min(...todosLosPrecios);
  }

  // 3. Retornamos el objeto listo para Supabase
  return {
    nombre: String(get(["nombre", "producto", "name"]) || "").trim(),
    precio: precioParaCatalogo, // Este es el que usa el contenedor del catálogo
    categoria: String(get(["categoria", "tipo"]) || "Otros").trim(),
    emoji: String(get(["emoji", "icono"]) || "🛒").trim(),
    stock: true, // Por defecto activamos el stock al subir
    cantidad: parseInt(get(["cantidad", "stock_actual"])) || 0,
    kiosko_id: kioskoid, // El ID de tu kiosko actual
    foto: null,
    variaciones: variacionesFinales // Aquí se guarda el JSON [{nombre, precio}, ...]
  };
}).filter(p => p.nombre); // Evita subir filas vacías del Excel
      if (productos.length === 0) {
        mostrarToast("❌ No se encontraron productos con nombre", "error");
        return;
      }

      const { data, error } = await supabase
  .from("productos")
  .upsert(productos, { onConflict: 'nombre' }) 
  .select();
      if (error) { mostrarToast("❌ Error guardando: " + error.message, "error"); return; }

     setKioskos(prev => prev.map(k => {
  if (k.id === kioskoid) {
    // 1. Sacamos los nombres de los productos que acabamos de subir
    const nombresNuevos = data.map(d => d.nombre);
    
    // 2. Filtramos la lista actual para quitar los que ya existen y se van a actualizar
    const productosSinCambios = k.productos.filter(p => !nombresNuevos.includes(p.nombre));
    
    // 3. Devolvemos la unión de los que no cambiaron + la nueva data limpia
    return { ...k, productos: [...productosSinCambios, ...data] };
  }
  return k;
}));
      mostrarToast(`✅ ${data.length} productos cargados desde Excel`);
    } catch (err) {
      mostrarToast("❌ Error leyendo Excel: " + err.message, "error");
    }

    e.target.value = "";
  };

  const actualizarDato = async (id, campo, valor) => {
    await supabase.from("kioskos").update({ [campo]: valor }).eq("id", id);
    setKioskos(prev => prev.map(k => k.id === id ? { ...k, [campo]: valor } : k));
    if (detalle?.id === id) setDetalle(prev => ({ ...prev, [campo]: valor }));
    mostrarToast("✅ Dato actualizado");
  };

  const activos = kioskos.filter(k => k.activo);
  const inactivos = kioskos.filter(k => !k.activo);
  const ingresoMensual = activos.reduce((s, k) => s + k.monto, 0);

  const filtrados = kioskos.filter(k => {
    const matchFiltro = filtro === "todos" ? true : filtro === "activos" ? k.activo : !k.activo;
    const matchBusqueda = busqueda === "" || k.nombre.toLowerCase().includes(busqueda.toLowerCase()) || k.dueno.toLowerCase().includes(busqueda.toLowerCase());
    return matchFiltro && matchBusqueda;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Nunito', sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-weight: 700; transition: all 0.15s; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; }
        .toggle { position: relative; width: 42px; height: 23px; border-radius: 999px; cursor: pointer; border: none; outline: none; transition: background 0.2s; flex-shrink: 0; }
        .toggle-knob { position: absolute; top: 2.5px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .inp { width: 100%; background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; font-family: inherit; outline: none; transition: border 0.2s; }
        .inp:focus { border-color: #f97316; background: #fff; }
        select { font-family: inherit; background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; width: 100%; outline: none; cursor: pointer; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; overflow-y: auto; }
        .modal { background: #fff; border-radius: 18px; padding: 28px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 999px; font-size: 13px; font-weight: 700; z-index: 200; white-space: nowrap; }
        .row:hover { background: #fafafa; cursor: pointer; }
        .fade { animation: fade 0.3s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
        .upload-zone { border: 2px dashed #fed7aa; border-radius: 10px; padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s; background: #fff7ed; }
        .upload-zone:hover { border-color: #f97316; }
      `}</style>

      {toast && <div className="toast" style={{ background: toast.tipo === "ok" ? "#059669" : "#dc2626", color: "#fff" }}>{toast.msg}</div>}

      {cargando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#f97316" }}>⏳ Cargando kioskos...</p>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "13px 24px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 24 }}>🏪</span>
        <span style={{ fontWeight: 900, fontSize: 18 }}>Ki<span style={{ color: "#f97316" }}>Kiosko</span></span>
        <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 999, fontWeight: 700 }}>👑 SÚPER ADMIN</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#f97316", color: "#fff", padding: "9px 18px", fontSize: 12 }} onClick={() => setModalNuevo(true)}>+ Nuevo kiosko</button>
          <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "9px 14px", fontSize: 12, border: "1px solid #e5e7eb" }} onClick={onSalir}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total kioskos", val: kioskos.length, color: "#111827", icon: "🏪" },
            { label: "Activos", val: activos.length, color: "#059669", icon: "✅" },
            { label: "Inactivos", val: inactivos.length, color: "#dc2626", icon: "❌" },
            { label: "Ingreso mensual", val: `S/. ${ingresoMensual}`, color: "#f97316", icon: "💰" },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <p style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{s.label}</p>
                <span>{s.icon}</span>
              </div>
              <p style={{ fontWeight: 900, fontSize: 26, color: s.color }}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Alertas vencimiento */}
        {kioskos.filter(k => k.activo && diasRestantes(k.vence) <= 7 && diasRestantes(k.vence) >= 0).length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
            ⚠️ <strong>{kioskos.filter(k => k.activo && diasRestantes(k.vence) <= 7).length} kiosko(s)</strong> vencen en los próximos 7 días
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" style={{ width: 240 }} placeholder="🔍 Buscar kiosko o dueño..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {[["todos", "Todos"], ["activos", `✅ Activos (${activos.length})`], ["inactivos", `❌ Inactivos (${inactivos.length})`]].map(([id, label]) => (
            <button key={id} className="btn" style={{ padding: "8px 14px", fontSize: 11, background: filtro === id ? "#fff7ed" : "#f3f4f6", color: filtro === id ? "#f97316" : "#6b7280", border: `1px solid ${filtro === id ? "#fed7aa" : "#e5e7eb"}` }} onClick={() => setFiltro(id)}>{label}</button>
          ))}
        </div>

        {/* Tabla */}
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Kiosko", "Plan", "Productos", "Vence", "Estado", "Acceso"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(k => (
                <tr key={k.id} className="row" style={{ borderBottom: "1px solid #f3f4f6" }} onClick={() => setDetalle(k)}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: k.activo ? "#fff7ed" : "#fee2e2", display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800 }}>{k.nombre}</p>
                        <p style={{ fontSize: 11, color: "#9ca3af" }}>{k.dueno} · {k.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, color: "#f97316", fontWeight: 700 }}>{k.plan}</span>
                    <p style={{ fontSize: 11, color: "#9ca3af" }}>S/. {k.monto}/mes</p>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: k.productos.length > 0 ? "#059669" : "#dc2626" }}>
                    {k.productos.length} productos
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ fontSize: 12, color: diasRestantes(k.vence) <= 7 ? "#f97316" : "#6b7280", fontWeight: diasRestantes(k.vence) <= 7 ? 700 : 400 }}>{fmtFecha(k.vence)}</p>
                    {diasRestantes(k.vence) <= 7 && diasRestantes(k.vence) >= 0 && <p style={{ fontSize: 10, color: "#f97316" }}>Vence en {diasRestantes(k.vence)} días</p>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: k.activo ? "#dcfce7" : "#fee2e2", color: k.activo ? "#059669" : "#dc2626" }}>
                      {k.activo ? "✅ Activo" : "❌ Inactivo"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }} onClick={e => { e.stopPropagation(); toggleAcceso(k.id); }}>
                    <button className="toggle" style={{ background: k.activo ? "#f97316" : "#d1d5db" }}>
                      <div className="toggle-knob" style={{ left: k.activo ? "21px" : "3px" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle kiosko */}
      {detalle && (
        <div className="modal-bg" onClick={() => setDetalle(null)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🏪</span>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 16 }}>{detalle.nombre}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af" }}>{detalle.dueno}</p>
                </div>
              </div>
              <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "6px 12px", fontSize: 11, border: "1px solid #e5e7eb" }} onClick={() => setDetalle(null)}>✕</button>
            </div>

            {/* Link público */}
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px", margin: "12px 0" }}>
              <p style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginBottom: 4 }}>🛒 Link público para compradores</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>kikiosko-vyvv.vercel.app/#/{detalle.slug}</p>
              <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Comparte este link con tus clientes — sin usuario ni clave</p>
            </div>

            {/* Banner del kiosko */}
<div style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
  <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Banner del catálogo</p>
  
  {/* Preview del banner */}
  {detalle.banner && (
    <div style={{ marginBottom: 10, borderRadius: 8, overflow: "hidden", height: 120 }}>
      <img src={detalle.banner} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  )}

  <input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    id="banner-upload"
    style={{ display: "none" }}
    onChange={async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { mostrarToast("❌ La imagen no debe superar 2MB", "error"); return; }
      mostrarToast("⏳ Subiendo banner...", "ok");
      const ext = file.name.split(".").pop();
      const fileName = `banner_${detalle.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("fotos-productos")
        .upload(fileName, file, { upsert: true });
      if (uploadError) { mostrarToast("❌ Error subiendo banner", "error"); return; }
      const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
      const bannerUrl = urlData.publicUrl;
      await supabase.from("kioskos").update({ banner: bannerUrl }).eq("id", detalle.id);
      setKioskos(prev => prev.map(k => k.id === detalle.id ? { ...k, banner: bannerUrl } : k));
      setDetalle(prev => ({ ...prev, banner: bannerUrl }));
      mostrarToast("✅ Banner actualizado");
      e.target.value = "";
    }}
  />
  <div style={{ display: "flex", gap: 8 }}>
    <button className="btn" style={{ flex: 1, background: "#fff7ed", color: "#f97316", padding: "10px", fontSize: 12, border: "1.5px dashed #fed7aa", borderRadius: 8 }}
      onClick={() => document.getElementById("banner-upload").click()}>
      🖼️ {detalle.banner ? "Cambiar banner" : "Subir banner"}
    </button>
    {detalle.banner && (
      <button className="btn" style={{ background: "#fee2e2", color: "#dc2626", padding: "10px 14px", fontSize: 12, border: "1px solid #fecaca" }}
        onClick={async () => {
          await supabase.from("kioskos").update({ banner: null }).eq("id", detalle.id);
          setKioskos(prev => prev.map(k => k.id === detalle.id ? { ...k, banner: null } : k));
          setDetalle(prev => ({ ...prev, banner: null }));
          mostrarToast("🗑 Banner eliminado");
        }}>
        🗑
      </button>
    )}
  </div>
</div>
            {/* Datos editables */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
              {[
                ["WhatsApp", "whatsapp", detalle.whatsapp],
                ["Correo", "email", detalle.email],
                ["Clave", "clave", detalle.clave],
                ["Acceso hasta", "vence", detalle.vence],
              ].map(([label, key, val]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", width: 90, flexShrink: 0 }}>{label}</span>
                  <input
                    type={key === "vence" ? "date" : "text"}
                    defaultValue={val}
                    onBlur={e => actualizarDato(detalle.id, key, e.target.value)}
                    style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#111827", fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = "#f97316"}
                  />
                </div>
              ))}
              {[
                ["Monto", `S/. ${detalle.monto}/mes`],
                ["Pagos", `${detalle.pagos} pagos`],
                ["Productos", `${detalle.productos.length} productos`],
                ["Estado", detalle.activo ? "✅ Activo" : "❌ Inactivo"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span style={{ color: "#9ca3af" }}>{k}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Cambiar plan */}
            <div style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Plan actual</p>
              <div style={{ display: "flex", gap: 8 }}>
                {PLANES.map(p => (
                  <button key={p.id} className="btn" style={{ flex: 1, padding: "9px", fontSize: 11, background: detalle.plan === p.id ? "#fff7ed" : "#f3f4f6", color: detalle.plan === p.id ? "#f97316" : "#374151", border: `1px solid ${detalle.plan === p.id ? "#fed7aa" : "#e5e7eb"}` }}
                    onClick={() => cambiarPlan(detalle.id, p.id)}>
                    {p.id}<br /><span style={{ fontSize: 10 }}>S/. {p.precio}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Subir Excel */}
            <div style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Cargar productos desde Excel</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => subirExcel(detalle.id, e)} />
              <div className="upload-zone" onClick={() => fileRef.current.click()}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#f97316" }}>📊 Subir Excel de productos</p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>nombre · precio · categoría · emoji · stock</p>
              </div>
            </div>

            {/* Ver productos */}
            <button className="btn" style={{ width: "100%", background: "#f3f4f6", color: "#374151", padding: "10px", fontSize: 12, border: "1px solid #e5e7eb", marginTop: 12 }}
              onClick={() => { setVistaProductos(detalle); setDetalle(null); }}>
              📦 Ver y gestionar productos ({detalle.productos.length})
            </button>

            {/* Botones */}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn" style={{ flex: 1, padding: "11px", fontSize: 12, background: detalle.activo ? "#fee2e2" : "#dcfce7", color: detalle.activo ? "#dc2626" : "#059669", border: `1px solid ${detalle.activo ? "#fecaca" : "#bbf7d0"}` }}
                onClick={() => toggleAcceso(detalle.id)}>
                {detalle.activo ? "❌ Desactivar" : "✅ Activar"}
              </button>
              <button className="btn" style={{ flex: 1, padding: "11px", fontSize: 12, background: "#dcfce7", color: "#059669", border: "1px solid #bbf7d0" }}
                onClick={() => enviarWhatsApp(detalle)}>
                📱 Enviar accesos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo kiosko */}
      {modalNuevo && (
        <div className="modal-bg" onClick={() => setModalNuevo(false)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>🏪 Nuevo kiosko</span>
              <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "6px 12px", fontSize: 11, border: "1px solid #e5e7eb" }} onClick={() => setModalNuevo(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Nombre del kiosko", "nombre", "Kiosko Rosita"],
                ["Nombre del dueño", "dueno", "Rosa Flores"],
                ["Correo", "email", "rosita@correo.pe"],
                ["WhatsApp", "whatsapp", "999888777"],
                ["Contraseña", "clave", "clave123"],
              ].map(([label, key, ph]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>
                  <input className="inp" placeholder={ph} value={nuevoKiosko[key]} onChange={e => setNuevoKiosko(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Plan</label>
                <select value={nuevoKiosko.plan} onChange={e => setNuevoKiosko(p => ({ ...p, plan: e.target.value }))}>
                  {PLANES.map(p => <option key={p.id}>{p.id} — S/. {p.precio}/mes</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Acceso hasta</label>
                <input className="inp" type="date" value={nuevoKiosko.vence} onChange={e => setNuevoKiosko(p => ({ ...p, vence: e.target.value }))} />
              </div>
            </div>
            <button className="btn" style={{ width: "100%", background: "#f97316", color: "#fff", padding: 13, fontSize: 14, marginTop: 20 }}
              onClick={crearKiosko}
              disabled={!nuevoKiosko.nombre || !nuevoKiosko.email || !nuevoKiosko.clave || !nuevoKiosko.whatsapp || !nuevoKiosko.vence}>
              ✅ Crear kiosko y activar acceso
            </button>
          </div>
        </div>
      )}

{/* Modal gestión productos */}
      {vistaProductos && (
        <div className="modal-bg" onClick={() => setVistaProductos(null)}>
          <div className="modal fade" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>📦 Productos — {vistaProductos.nombre}</span>
              <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "6px 12px", fontSize: 11, border: "1px solid #e5e7eb" }} onClick={() => setVistaProductos(null)}>✕</button>
            </div>

            {vistaProductos.productos.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Sin productos aún — sube un Excel desde el detalle</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {vistaProductos.productos.map(p => (
                  <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px", background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 24 }}>{p.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{p.nombre}</p>
                        <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>{p.categoria}</p>
                      </div>
                      <span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 999, background: p.stock ? "#dcfce7" : "#fee2e2", color: p.stock ? "#059669" : "#dc2626", fontWeight: 800 }}>
                        {p.stock ? "✅" : "❌"}
                      </span>
                    </div>

                    <div style={{ background: "#fff", borderRadius: 8, padding: "10px", border: "1px solid #f3f4f6" }}>
                      {p.variaciones && p.variaciones.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {p.variaciones.map((v, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: idx !== p.variaciones.length - 1 ? 6 : 0, borderBottom: idx !== p.variaciones.length - 1 ? "1px dashed #f3f4f6" : "none" }}>
                              <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 600 }}>{v.nombre}</span>
                              <span style={{ fontWeight: 900, color: "#f97316", fontSize: 13 }}>S/. {parseFloat(v.precio).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>Precio único</span>
                          <span style={{ fontWeight: 900, color: "#f97316", fontSize: 15 }}>S/. {parseFloat(p.precio).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PANEL ADMIN KIOSKO ───
function AdminKiosko({ kiosko, onSalir, onVerCatalogo, onProductosChange }) {
  const [productos, setProductos] = useState(kiosko.productos);
  
  // --- AQUÍ COLOCAS LA PARTE UNO ---
  // Obtenemos categorías únicas de los productos actuales
  const categoriasExistentes = [
    ...new Set(productos.map(p => p.categoria))
  ].filter(Boolean);

  // Si no hay categorías (kiosko nuevo), usamos una lista base
  const categoriasParaMostrar = categoriasExistentes.length > 0 
    ? categoriasExistentes 
    : ["Bebidas", "Snacks", "Abarrotes", "Otros"];
  // ---------------------------------

  const actualizarProductos = (nuevos) => {
    setProductos(nuevos);
    onProductosChange(nuevos);
  };
  const [modalProducto, setModalProducto] = useState(null);
  const [nuevoProducto, setNuevoProducto] = useState({ 
  nombre: "", 
  precio: "", 
  categoria: categoriasParaMostrar[0], // <--- CAMBIO AQUÍ
  emoji: "🛒", 
  stock: true, 
  cantidad: 0, 
  foto: null 
});
  const [toast, setToast] = useState(null);

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2500); };

  const toggleStock = async (id) => {
    const p = productos.find(p => p.id === id);
    const nuevoStock = !p.stock;
    await supabase.from("productos").update({ stock: nuevoStock }).eq("id", id);
    const nuevos = productos.map(p => p.id === id ? { ...p, stock: nuevoStock } : p);
    actualizarProductos(nuevos);
    mostrarToast("✅ Stock actualizado");
  };

  const eliminar = async (id) => {
    await supabase.from("productos").delete().eq("id", id);
    const nuevos = productos.filter(p => p.id !== id);
    actualizarProductos(nuevos);
    mostrarToast("🗑 Producto eliminado");
  };

  const guardar = async () => {
    mostrarToast("⏳ Guardando...", "ok");
    let fotoUrl = nuevoProducto.foto && !nuevoProducto.fotoFile ? nuevoProducto.foto : null;

    // Si hay un archivo nuevo, subirlo a Supabase Storage
    if (nuevoProducto.fotoFile) {
      const ext = nuevoProducto.fotoFile.name.split(".").pop();
      const fileName = `${kiosko.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("fotos-productos")
        .upload(fileName, nuevoProducto.fotoFile, { upsert: true });
      if (uploadError) {
        mostrarToast("❌ Error subiendo foto: " + uploadError.message, "error");
        return;
      }
      const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
      fotoUrl = urlData.publicUrl;
    }

    const productoParaDB = {
      nombre: nuevoProducto.nombre,
      precio: parseFloat(nuevoProducto.precio) || 0,
      emoji: nuevoProducto.emoji || "🛒",
      categoria: nuevoProducto.categoria,
      cantidad: parseInt(nuevoProducto.cantidad) || 0,
      stock: (parseInt(nuevoProducto.cantidad) || 0) > 0,
      kiosko_id: kiosko.id,
      foto: fotoUrl,
    };

    let nuevos;
    if (modalProducto?.id) {
      const { error } = await supabase.from("productos").update(productoParaDB).eq("id", modalProducto.id);
      if (error) { mostrarToast("❌ Error: " + error.message, "error"); return; }
      nuevos = productos.map(p => p.id === modalProducto.id ? { ...p, ...productoParaDB } : p);
      mostrarToast("✅ Producto actualizado");
    } else {
      const { data, error } = await supabase.from("productos").insert([productoParaDB]).select();
      if (error) { mostrarToast("❌ Error: " + error.message, "error"); return; }
      if (!data || !data[0]) { mostrarToast("❌ No se pudo guardar", "error"); return; }
      nuevos = [...productos, data[0]];
      mostrarToast("✅ Producto agregado");
    }
    actualizarProductos(nuevos);
    setModalProducto(null);
    setNuevoProducto({ nombre: "", precio: "", categoria: "Bebidas", emoji: "🛒", stock: true, cantidad: 0, foto: null, fotoFile: null });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Nunito', sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-weight: 700; transition: all 0.15s; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; }
        .toggle { position: relative; width: 42px; height: 23px; border-radius: 999px; cursor: pointer; border: none; outline: none; transition: background 0.2s; flex-shrink: 0; }
        .toggle-knob { position: absolute; top: 2.5px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .inp { width: 100%; background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; font-family: inherit; outline: none; }
        .inp:focus { border-color: #f97316; background: #fff; }
        select { font-family: inherit; background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; width: 100%; outline: none; cursor: pointer; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal { background: #fff; border-radius: 18px; padding: 28px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 999px; font-size: 13px; font-weight: 700; z-index: 200; white-space: nowrap; }
        .row:hover { background: #fafafa; }
        .fade { animation: fade 0.3s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {toast && <div className="toast" style={{ background: toast.tipo === "ok" ? "#059669" : "#dc2626", color: "#fff" }}>{toast.msg}</div>}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "13px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🏪</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 900, fontSize: 15 }}>{kiosko.nombre}</p>
          <p style={{ fontSize: 11, color: "#9ca3af" }}>Panel de administración</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#f97316", color: "#fff", padding: "8px 14px", fontSize: 12 }}
            onClick={() => { setModalProducto({}); setNuevoProducto({ nombre: "", precio: "", categoria: "Bebidas", emoji: "🛒", stock: true, cantidad: 0, foto: null, fotoFile: null }); }}>
            + Agregar producto
          </button>
          <div style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
          <button className="btn" style={{ background: "#ecfdf5", color: "#059669", padding: "8px 14px", fontSize: 12, border: "1px solid #bbf7d0" }}
            onClick={onVerCatalogo}>
            👁 Ver catálogo
          </button>
          <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "8px 14px", fontSize: 12, border: "1px solid #e5e7eb" }}
            onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total productos", val: productos.length, color: "#111827", icon: "📦" },
            { label: "En stock", val: productos.filter(p => p.stock).length, color: "#059669", icon: "✅" },
            { label: "Sin stock", val: productos.filter(p => !p.stock).length, color: "#dc2626", icon: "❌" },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <p style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{s.label}</p>
                <span>{s.icon}</span>
              </div>
              <p style={{ fontWeight: 900, fontSize: 24, color: s.color }}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Link público + QR */}
<div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div>
      <p style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginBottom: 2 }}>🛒 Link para tus compradores</p>
      <p style={{ fontSize: 13, fontWeight: 800 }}>kikiosko-vyvv.vercel.app/#/{kiosko.slug}</p>
    </div>
    <button className="btn" style={{ background: "#059669", color: "#fff", padding: "8px 14px", fontSize: 11 }}
      onClick={() => { navigator.clipboard?.writeText(`kikiosko-vyvv.vercel.app/#/${kiosko.slug}`); mostrarToast("📋 Link copiado"); }}>
      📋 Copiar
    </button>
  </div>
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16, gap: 8 }}>
    <QRCode
      value={`https://kikiosko-vyvv.vercel.app/#/${kiosko.slug}`}
      size={160}
      bgColor="#ffffff"
      fgColor="#111827"
      level="H"
    />
    <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
      📲 Tus clientes escanean este QR y llegan directo a tu tienda
    </p>
  </div>
</div>

        {/* Tabla productos */}
        <div className="card" style={{ overflow: "hidden" }}>
          {productos.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              Sin productos — agrega el primero con el botón de arriba
            </div>
         // --- LÍNEA 724 ---
) : productos.map(p => (
  <div key={p.id} className="row" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
    
    {/* Fila 1: emoji + nombre + botones */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
      <span style={{ fontSize: '24px' }}>{p.emoji}</span>
      <div style={{ flex: 1 }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{p.nombre}</h4>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{p.categoria}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
  {kiosko.plan !== "Básico" && (
    <button
      className="btn"
      onClick={async () => {
        const nuevaOferta = !p.oferta;
        await supabase.from("productos").update({ oferta: nuevaOferta }).eq("id", p.id);
        actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, oferta: nuevaOferta } : pr));
        mostrarToast(nuevaOferta ? "🔥 Marcado como oferta" : "✅ Oferta desactivada");
      }}
      style={{ background: p.oferta ? "#fef3c7" : "#f3f4f6", color: p.oferta ? "#d97706" : "#9ca3af", padding: "5px 10px", border: `1px solid ${p.oferta ? "#fde68a" : "#e5e7eb"}` }}>
      🔥
    </button>
  )}
  <button className="btn" onClick={() => { setModalProducto(p); setNuevoProducto(p); }} style={{ background: "#fff7ed", color: "#f97316", padding: "5px 10px" }}>✏️</button>
  <button className="btn" onClick={() => eliminar(p.id)} style={{ background: "#fee2e2", color: "#dc2626", padding: "5px 10px" }}>🗑️</button>
</div>
    </div>

    {/* Fila 2: stock + precio o variaciones */}
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4, marginTop: 4 }}>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>Stock:</span>
        <button className="btn" style={{ width: 24, height: 24, background: "#fff7ed", color: "#f97316", fontSize: 14, border: "1px solid #fed7aa", borderRadius: 6, padding: 0, lineHeight: 1 }}
          onClick={async () => {
            const nuevaCantidad = Math.max(0, (parseInt(p.cantidad) || 0) - 1);
            await supabase.from("productos").update({ cantidad: nuevaCantidad, stock: nuevaCantidad > 0 }).eq("id", p.id);
            actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: nuevaCantidad, stock: nuevaCantidad > 0 } : pr));
          }}>−</button>
        <input type="number" min="0" value={p.cantidad ?? 0}
          onChange={e => { const val = parseInt(e.target.value) || 0; actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: val, stock: val > 0 } : pr)); }}
          onBlur={async e => { const val = parseInt(e.target.value) || 0; await supabase.from("productos").update({ cantidad: val, stock: val > 0 }).eq("id", p.id); }}
          style={{ width: 44, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 4px", fontSize: 12, fontWeight: 900, color: "#f97316", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
        <button className="btn" style={{ width: 24, height: 24, background: "#f97316", color: "#fff", fontSize: 14, borderRadius: 6, padding: 0, lineHeight: 1 }}
          onClick={async () => {
            const nuevaCantidad = (parseInt(p.cantidad) || 0) + 1;
            await supabase.from("productos").update({ cantidad: nuevaCantidad, stock: true }).eq("id", p.id);
            actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: nuevaCantidad, stock: true } : pr));
          }}>+</button>
      </div>

      {p.variaciones && p.variaciones.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {p.variaciones.map((v, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff7ed", padding: "7px 12px", borderRadius: 8, border: "1px solid #fed7aa" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{v.nombre}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>S/.</span>
                <input type="text" defaultValue={Number(v.precio).toFixed(2)}
                  onFocus={e => e.target.select()}
                  onBlur={async e => {
                    const nuevoPrecio = parseFloat(e.target.value.replace(",", ".")) || 0;
                    const nuevasVariaciones = p.variaciones.map((vv, i) => i === idx ? { ...vv, precio: nuevoPrecio } : vv);
                    const precioMin = Math.min(...nuevasVariaciones.map(vv => vv.precio));
                    await supabase.from("productos").update({ variaciones: nuevasVariaciones, precio: precioMin }).eq("id", p.id);
                    actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, variaciones: nuevasVariaciones, precio: precioMin } : pr));
                    mostrarToast("✅ Precio actualizado");
                  }}
                  style={{ width: 65, background: "#fff", border: "1.5px solid #fed7aa", borderRadius: 7, padding: "5px 8px", fontSize: 14, fontWeight: 900, color: "#f97316", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>S/.</span>
          <input type="text" value={isNaN(p.precio) ? "" : Number(p.precio).toFixed(2)}
            onChange={e => { const val = e.target.value.replace(",", "."); actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, precio: parseFloat(val) || 0 } : pr)); }}
            onFocus={e => { e.target.style.borderColor = "#f97316"; e.target.select(); }}
            onBlur={async e => { e.target.style.borderColor = "#fed7aa"; const val = parseFloat(e.target.value.replace(",", ".")) || 0; await supabase.from("productos").update({ precio: val }).eq("id", p.id); mostrarToast("✅ Precio actualizado"); }}
            style={{ width: 70, background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 7, padding: "6px 8px", fontSize: 14, fontWeight: 900, color: "#f97316", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
        </div>
      )}

    </div>
  </div>
))}
        </div>
      </div>
      {/* Modal agregar/editar */}
      {modalProducto !== null && (
        <div className="modal-bg" onClick={() => setModalProducto(null)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>{modalProducto?.id ? "✏️ Editar producto" : "➕ Nuevo producto"}</span>
              <button className="btn" style={{ background: "#f3f4f6", color: "#6b7280", padding: "6px 12px", fontSize: 11, border: "1px solid #e5e7eb" }} onClick={() => setModalProducto(null)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Foto del producto */}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Foto del producto</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {/* Preview */}
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: "#fff7ed", border: "1.5px solid #fed7aa", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
                    {nuevoProducto.foto ? (
                      <img src={nuevoProducto.foto} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 28 }}>{nuevoProducto.emoji || "📷"}</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      id="foto-upload"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { alert("La foto no debe superar 2MB"); return; }
                        // Guardamos el archivo original Y un preview base64 para mostrar
                        const reader = new FileReader();
                        reader.onload = ev => setNuevoProducto(p => ({ ...p, foto: ev.target.result, fotoFile: file }));
                        reader.readAsDataURL(file);
                      }}
                    />
                    <button className="btn" style={{ width: "100%", background: "#fff7ed", color: "#f97316", padding: "10px", fontSize: 12, border: "1.5px dashed #fed7aa", borderRadius: 8, marginBottom: 6 }}
                      onClick={() => document.getElementById("foto-upload").click()}>
                      📸 Subir foto
                    </button>
                    <p style={{ fontSize: 10, color: "#9ca3af" }}>JPG, PNG o WEBP · Máx. 2MB</p>
                    {nuevoProducto.foto && (
                      <button className="btn" style={{ fontSize: 10, color: "#dc2626", background: "transparent", padding: "4px 0", marginTop: 4 }}
                        onClick={() => setNuevoProducto(p => ({ ...p, foto: null }))}>
                        🗑 Quitar foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {[["Nombre", "nombre", "Juice 250ml"], ["Emoji (si no hay foto)", "emoji", "🥤"], ["Precio (S/.)", "precio", "1.50"]].map(([label, key, ph]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>
                  <input className="inp" placeholder={ph} value={nuevoProducto[key]} onChange={e => setNuevoProducto(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Categoría</label>
                <select value={nuevoProducto.categoria} onChange={e => setNuevoProducto(p => ({ ...p, categoria: e.target.value }))}>
                  {categoriasParaMostrar.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              {/* Stock cantidad manual */}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Cantidad en stock
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="btn" style={{ width: 36, height: 36, background: "#fff7ed", color: "#f97316", fontSize: 20, border: "1.5px solid #fed7aa", borderRadius: 8, flexShrink: 0 }}
                    onClick={() => setNuevoProducto(p => ({ ...p, cantidad: Math.max(0, (parseInt(p.cantidad) || 0) - 1), stock: Math.max(0, (parseInt(p.cantidad) || 0) - 1) > 0 }))}>
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={nuevoProducto.cantidad ?? ""}
                    placeholder="0"
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setNuevoProducto(p => ({ ...p, cantidad: val, stock: val > 0 }));
                    }}
                    style={{ flex: 1, background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 8, padding: "9px 14px", fontSize: 16, fontWeight: 900, color: "#f97316", fontFamily: "inherit", outline: "none", textAlign: "center" }}
                  />
                  <button className="btn" style={{ width: 36, height: 36, background: "#f97316", color: "#fff", fontSize: 20, borderRadius: 8, flexShrink: 0 }}
                    onClick={() => setNuevoProducto(p => ({ ...p, cantidad: (parseInt(p.cantidad) || 0) + 1, stock: true }))}>
                    +
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>
                  {(parseInt(nuevoProducto.cantidad) || 0) === 0 ? "⚠️ Sin stock — no aparecerá disponible en el catálogo" : `✅ ${nuevoProducto.cantidad} unidades disponibles`}
                </p>
              </div>
            </div>
            <button className="btn" style={{ width: "100%", background: "#f97316", color: "#fff", padding: 13, fontSize: 14, marginTop: 20 }}
              onClick={guardar} disabled={!nuevoProducto.nombre || !nuevoProducto.precio}>
              {modalProducto?.id ? "✅ Guardar cambios" : "✅ Agregar producto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogoCliente({ kiosko, onSalir }) {
  const [carrito, setCarrito] = useState({}); // Volvemos a objeto para manejar cantidades fácilmente
  const [categoria, setCategoria] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [verCarrito, setVerCarrito] = useState(false);

  // 1. AGREGAR: Usamos una llave única para agrupar (ID + Nombre de Variación)
  const agregar = (p, variacion) => {
    const key = variacion ? `${p.id}-${variacion.nombre}` : `${p.id}-unica`;
    
    setCarrito(prev => {
      const existente = prev[key];
      if (existente) {
        return { ...prev, [key]: { ...existente, cantidad: existente.cantidad + 1 } };
      } else {
        return {
          ...prev,
          [key]: {
            id: p.id,
            nombre: variacion ? `${p.nombre} (${variacion.nombre})` : p.nombre,
            precio: variacion ? Number(variacion.precio) : Number(p.precio),
            cantidad: 1,
            variacionObj: variacion // Guardamos la referencia por si acaso
          }
        };
      }
    });
  };

  // 2. QUITAR (REDUCIR): Si llega a 0, se elimina del objeto
  const quitar = (key) => {
    setCarrito(prev => {
      const nuevo = { ...prev };
      if (nuevo[key].cantidad > 1) {
        nuevo[key] = { ...nuevo[key], cantidad: nuevo[key].cantidad - 1 };
      } else {
        delete nuevo[key];
      }
      return nuevo;
    });
  };

  // 3. CÁLCULOS
  const listaCarrito = Object.entries(carrito);
  const totalPrecio = listaCarrito.reduce((s, [_, item]) => s + (item.precio * item.cantidad), 0);
  const totalItems = listaCarrito.reduce((s, [_, item]) => s + item.cantidad, 0);

  const enviarPedido = async () => {
    if (listaCarrito.length === 0) return;

    const lineas = listaCarrito
      .map(([_, item]) => `• ${item.nombre} x${item.cantidad} — S/. ${(item.precio * item.cantidad).toFixed(2)}`)
      .join("\n");

    const msg = encodeURIComponent(`*Nuevo Pedido*\n\n${lineas}\n\n*Total: S/. ${totalPrecio.toFixed(2)}*\n*Cliente:* ${nombreCliente || "No indicado"}`);
    
    await supabase.from("pedidos").insert([{
      kiosko_id: kiosko.id,
      nombre_cliente: nombreCliente || "Sin nombre",
      detalle: lineas,
      total: totalPrecio,
    }]);

    window.open(`https://wa.me/51${kiosko.whatsapp}?text=${msg}`, "_blank");
  };

  // --- COMPONENTE DE PRODUCTO (CATÁLOGO) ---
  const ProductoCard = ({ p }) => {
    const [varSel, setVarSel] = useState(p.variaciones?.length > 0 ? p.variaciones[0] : null);
    const precioDisplay = varSel ? Number(varSel.precio) : Number(p.precio);

    return (
      <div className="prod-card" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <div style={{ position: "relative" }}>
  {p.oferta && (
    <span style={{ position: "absolute", top: 8, left: 8, background: "#f97316", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, zIndex: 1 }}>
      🔥 Oferta
    </span>
  )}
 <div className="w-full h-[140px] bg-gray-100 flex items-center justify-center overflow-hidden">
  {p.foto ? (
    <img
      src={p.foto}
      className="max-w-full max-h-full object-contain mx-auto block"
    />
  ) : (
    <span className="text-4xl opacity-60">{p.emoji || "📦"}</span>
  )}
</div>
</div>
        <div style={{ padding: 12 }}>
          <p style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>{p.nombre}</p>
          {p.variaciones?.length > 0 && (
            <div style={{ display: "flex", gap: 5, margin: "8px 0", flexWrap: "wrap" }}>
              {p.variaciones.map((v, i) => (
                <button key={i} onClick={() => setVarSel(v)}
                  style={{ 
                    fontSize: 10, padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                    background: varSel?.nombre === v.nombre ? "#f97316" : "#eee",
                    color: varSel?.nombre === v.nombre ? "#fff" : "#666"
                  }}> {v.nombre} </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
  <span style={{ fontWeight: 900, color: "#f97316", fontSize: 15 }}>S/. {precioDisplay.toFixed(2)}</span>
  
  {(() => {
    const key = varSel ? `${p.id}-${varSel.nombre}` : `${p.id}-unica`;
    const cantidad = carrito[key]?.cantidad || 0;
    return cantidad === 0 ? (
      <button onClick={() => agregar(p, varSel)}
        style={{ width: "100%", marginTop: 8, background: "#f97316", color: "#fff", border: "none", padding: "10px", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
        + Agregar 
      </button>
    ) : (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, background: "#fff7ed", borderRadius: 8, padding: "4px" }}>
  <button onClick={() => quitar(key)}
    style={{ width: 26, height: 26, border: "none", background: "#f97316", color: "#fff", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 13 }}>−</button>
  <span style={{ fontWeight: 900, fontSize: 13, color: "#f97316" }}>{cantidad}</span>
  <button onClick={() => agregar(p, varSel)}
    style={{ width: 26, height: 26, border: "none", background: "#f97316", color: "#fff", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 13 }}>+</button>
</div>
    );
  })()}
</div>
        </div>
      </div>
    );
  };

 // Categorías únicas de los productos
  const categorias = ["Todos", ...new Set(kiosko.productos.map(p => p.categoria).filter(Boolean))];
  const productosFiltrados = categoria === "Todos" ? kiosko.productos : kiosko.productos.filter(p => p.categoria === categoria);

  return (
    <div style={{ minHeight: "100vh", background: "#fff7ed", fontFamily: "Nunito, sans-serif" }}>
      
      {/* --- ESTILOS PARA LAS 2 COLUMNAS Y RESPONSIVE --- */}
      <style>{`
        @media (min-width: 600px) {
          .productos-grid {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
          }
        }
        .prod-card img {
          height: 120px !important; 
        }
      `}</style>

      {/* Header */}
<div style={{ position: "relative" }}>
  {kiosko.banner ? (
    <div style={{ width: "100%", height: 180, overflow: "hidden", position: "relative" }}>
      <img src={kiosko.banner} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.6))", padding: "30px 20px 14px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 900, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{kiosko.nombre}</h2>
        {onSalir && <button onClick={onSalir} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>Salir</button>}
      </div>
    </div>
  ) : (
    <div style={{ background: "#f97316", padding: 20, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h2 style={{ margin: 0 }}>{kiosko.nombre}</h2>
      {onSalir && <button onClick={onSalir} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 8, fontWeight: 700 }}>Salir</button>}
    </div>
  )}
</div>
      
      {/* ... sigue el resto de tu código (filtros y el div con className="productos-grid") ... */}

      {/* Filtro de categorías */}
      <div style={{ display: "flex", gap: 8, padding: "12px 15px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #fed7aa" }}>
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCategoria(cat)}
            style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13,
              background: categoria === cat ? "#f97316" : "#fff7ed",
              color: categoria === cat ? "#fff" : "#f97316",
              boxShadow: categoria === cat ? "0 2px 8px rgba(249,115,22,0.3)" : "none"
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid de Productos */}
<div className="productos-grid" style={{ 
  padding: 15, 
  paddingBottom: 100,
  display: "grid", 
  gridTemplateColumns: "repeat(2, 1fr)", 
  gap: 12 
}}>
  {productosFiltrados.map(p => <ProductoCard key={p.id} p={p} />)}
</div>

      {/* Botón Flotante de Ver Pedido */}
      {totalItems > 0 && (
        <button onClick={() => setVerCarrito(true)}
  style={{ position: "fixed", bottom: 16, left: 16, right: 16, background: "#f97316", color: "#fff", padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, boxShadow: "0 4px 12px rgba(249,115,22,0.3)", zIndex: 50 }}>
  <span>🛒 Pedido ({totalItems})</span>
  <span>S/. {totalPrecio.toFixed(2)}</span>
</button>
      )}

      {/* Modal del Carrito con [+] y [-] */}
      {verCarrito && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
          <div style={{ background: "#fff", width: "100%", padding: "25px 20px", borderTopLeftRadius: 25, borderTopRightRadius: 25, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 900 }}>🛒 Tu pedido</h3>
              <button onClick={() => setVerCarrito(false)} style={{ border: "none", background: "#f3f4f6", width: 35, height: 35, borderRadius: "50%", fontSize: 18 }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {listaCarrito.map(([key, item]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{item.nombre}</p>
                    <p style={{ margin: 0, color: "#f97316", fontSize: 13, fontWeight: 700 }}>S/. {(item.precio * item.cantidad).toFixed(2)}</p>
                  </div>
                  
                  {/* BOTONES DE CONTROL DE CANTIDAD */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#f8fafc", padding: "4px 8px", borderRadius: 10 }}>
                    <button onClick={() => quitar(key)}
                      style={{ border: "none", background: "#e2e8f0", width: 28, height: 28, borderRadius: 6, fontWeight: 900, cursor: "pointer" }}>-</button>
                    <span style={{ fontWeight: 900, minWidth: 20, textAlign: "center" }}>{item.cantidad}</span>
                    <button onClick={() => agregar({id: item.id, nombre: item.nombre.split(' (')[0]}, item.variacionObj)}
                      style={{ border: "none", background: "#f97316", color: "#fff", width: 28, height: 28, borderRadius: 6, fontWeight: 900, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ margin: "20px 0", padding: "15px 0", borderTop: "2px solid #f97316", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Total a pagar:</span>
              <span style={{ fontWeight: 900, color: "#f97316", fontSize: 24 }}>S/. {totalPrecio.toFixed(2)}</span>
            </div>

            <input 
              style={{ width: "100%", padding: 14, borderRadius: 12, border: "1.5px solid #fed7aa", marginBottom: 15, boxSizing: "border-box", outline: "none", fontSize: 14, background: "#fff7ed" }} 
              placeholder="Escribe tu nombre aquí..." 
              value={nombreCliente} 
              onChange={e => setNombreCliente(e.target.value)} 
            />
            
            <button onClick={enviarPedido}
              style={{ width: "100%", background: "#25D366", color: "#fff", padding: 18, borderRadius: 15, border: "none", fontWeight: 800, fontSize: 16, boxShadow: "0 4px 15px rgba(37,211,102,0.3)" }}>
              📱 Enviar por WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── APP PRINCIPAL ───
export default function App() {
  const [pantalla, setPantalla] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", clave: "" });
  const [loginError, setLoginError] = useState("");
  const [kioskoCurrent, setKioskoCurrent] = useState(null);
  const [productosActuales, setProductosActuales] = useState([]);
  const [cargandoPublico, setCargandoPublico] = useState(false);
  const [kioskoPorSlug, setKioskoPorSlug] = useState(null);

  // Detectar link público tipo /#/rosita
  const hash = window.location.hash;
  const slug = hash.replace(/^#\/?/, "").replace(/\/$/, "").toLowerCase().trim();

  useEffect(() => {
    if (slug && slug.length > 0) {
      cargarKioskoPorSlug(slug);
    }
  }, [slug]);

  const cargarKioskoPorSlug = async (slug) => {
    setCargandoPublico(true);
    const { data: ks } = await supabase.from("kioskos").select("*").eq("slug", slug).single();
    if (ks) {
      const { data: prods } = await supabase.from("productos").select("*").eq("kiosko_id", ks.id);
      setKioskoPorSlug({ ...ks, productos: prods || [] });
    }
    setCargandoPublico(false);
  };

  if (cargandoPublico) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff7ed", fontFamily: "'Nunito', sans-serif" }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: "#f97316" }}>⏳ Cargando catálogo...</p>
    </div>
  );

  if (kioskoPorSlug) {
    if (!kioskoPorSlug.activo) return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", background: "#fff7ed" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>🔒</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: "#dc2626" }}>Kiosko no disponible</p>
          <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>Contacta al administrador</p>
        </div>
      </div>
    );
    return <CatalogoCliente kiosko={kioskoPorSlug} onSalir={() => { window.location.hash = ""; setKioskoPorSlug(null); }} />;
  }

  const handleLogin = async () => {
    if (loginForm.email === SUPERADMIN.email && loginForm.clave === SUPERADMIN.clave) {
      setPantalla("superadmin");
      setLoginError("");
      return;
    }
    const { data: ks } = await supabase.from("kioskos").select("*").eq("email", loginForm.email).eq("clave", loginForm.clave).single();
    if (ks) {
      if (!ks.activo) { setLoginError("Tu acceso está inactivo. Contacta al administrador."); return; }
      const { data: prods } = await supabase.from("productos").select("*").eq("kiosko_id", ks.id);
      setKioskoCurrent(ks);
      setProductosActuales(prods || []);
      setPantalla("adminkiosko");
      setLoginError("");
      return;
    }
    setLoginError("Correo o clave incorrectos");
  };

  if (pantalla === "superadmin") return <SuperAdmin onSalir={() => { setPantalla("login"); setLoginForm({ email: "", clave: "" }); }} />;
  
  if (pantalla === "adminkiosko" && kioskoCurrent) return (
    <AdminKiosko
      kiosko={{ ...kioskoCurrent, productos: productosActuales }}
      onProductosChange={setProductosActuales}
      onSalir={() => { setPantalla("login"); setKioskoCurrent(null); setLoginForm({ email: "", clave: "" }); }}
      onVerCatalogo={() => setPantalla("catalogo")}
    />
  );

  if (pantalla === "catalogo" && kioskoCurrent) return (
    <CatalogoCliente
      kiosko={{ ...kioskoCurrent, productos: productosActuales }}
      onSalir={() => setPantalla("adminkiosko")}
    />
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp2 { width: 100%; background: #fff; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 13px 16px; font-size: 14px; color: #1c1917; font-family: inherit; outline: none; transition: border 0.2s; }
        .inp2:focus { border-color: #f97316; }
        .fade { animation: fade 0.4s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
      <div className="fade" style={{ background: "#fff", borderRadius: 22, padding: "40px 32px", width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(249,115,22,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🏪</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#1c1917", letterSpacing: "-0.02em" }}>Ki<span style={{ color: "#f97316" }}>Kiosko</span></h1>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Tu catálogo digital con pedidos por WhatsApp</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input className="inp2" placeholder="Correo" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <input className="inp2" type="password" placeholder="Contraseña" value={loginForm.clave} onChange={e => setLoginForm({ ...loginForm, clave: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {loginError && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 12, textAlign: "center" }}>⚠️ {loginError}</p>}
        <button onClick={handleLogin} style={{ width: "100%", background: "#f97316", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 900, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
          Ingresar →
        </button>
        <div style={{ marginTop: 20, padding: "14px", background: "#fff7ed", borderRadius: 10, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#f97316", marginBottom: 6 }}>🏪 ¿Tienes un kiosko?</p>
          <p style={{ lineHeight: 1.6 }}>Ingresa con el correo y contraseña que te enviamos por WhatsApp.</p>
          <p style={{ marginTop: 8, lineHeight: 1.6 }}>¿Problemas para ingresar? Escríbenos al WhatsApp de soporte.</p>
        </div>
      </div>
    </div>
  );
}
