/* eslint-disable */
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { QRCodeSVG as QRCode } from "qrcode.react";
import imageCompression from "browser-image-compression";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";

const SUPERADMIN = { email: "admin@kikiosko.pe", clave: "admin123" };
const PLANES = [
  { id: "Básico", precio: 29 },
  { id: "Pro", precio: 59 },
  { id: "Premium", precio: 99 },
];

const comprimirImagen = async (file, tipo = "producto") => {
  const opciones = tipo === "producto"
    ? { maxSizeMB: 0.06, maxWidthOrHeight: 600, useWebWorker: true }
    : { maxSizeMB: 0.08, maxWidthOrHeight: 800, useWebWorker: true };
  try {
    const comprimido = await imageCompression(file, opciones);
    return comprimido;
  } catch (err) {
    console.warn("Compresión falló, usando original:", err);
    return file;
  }
};

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
// ─── HELPER HORARIO ───
function estaAbierto(infoTienda) {
  if (!infoTienda?.hora_apertura || !infoTienda?.hora_cierre) return null; // null = no sabe
  const ahora = new Date();
  const [hAp, mAp] = infoTienda.hora_apertura.split(":").map(Number);
  const [hCi, mCi] = infoTienda.hora_cierre.split(":").map(Number);
  const minActual = ahora.getHours() * 60 + ahora.getMinutes();
  const minAp = hAp * 60 + mAp;
  const minCi = hCi * 60 + mCi;
  // Maneja cierre después de medianoche
  if (minCi < minAp) return minActual >= minAp || minActual < minCi;
  return minActual >= minAp && minActual < minCi;
}

// ─── SELECTOR DE RUBRO ───
function RubroSelector({ condominioId, rubroId, onChange }) {
  const [rubros, setRubros] = useState([]);
  useEffect(() => {
    if (!condominioId) return;
    supabase.from("rubros").select("*").eq("condominio_id", condominioId).order("orden")
      .then(({ data }) => setRubros(data || []));
  }, [condominioId]);
  return (
    <select value={rubroId || ""} onChange={e => onChange(e.target.value || null)}>
      <option value="">— Sin rubro —</option>
      {rubros.map(r => <option key={r.id} value={r.id}>{r.emoji} {r.nombre}</option>)}
    </select>
  );
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
  const [modalCatMadre, setModalCatMadre] = useState(null);
  const [catMadres, setCatMadres] = useState([]);
  const [nuevoKiosko, setNuevoKiosko] = useState({ nombre: "", dueno: "", email: "", clave: "", whatsapp: "", plan: "Pro", vence: "" });
  const [vistaCondominios, setVistaCondominios] = useState(false);
  const [condominios, setCondominios] = useState([]);
  const [modalNuevoCondominio, setModalNuevoCondominio] = useState(false);
  const [nuevoCondominio, setNuevoCondominio] = useState({ nombre: "", slug: "" });
  const [condominioDetalle, setCondominioDetalle] = useState(null);
  const [rubrosCondominio, setRubrosCondominio] = useState([]);
  const [nuevoRubro, setNuevoRubro] = useState({ nombre: "", emoji: "🏪", color: "#2563EB" });
  const fileRef = useRef();

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => { cargarKioskos(); cargarCondominios(); }, []);

  const cargarCondominios = async () => {
    const { data } = await supabase.from("condominios").select("*").order("created_at", { ascending: false });
    setCondominios(data || []);
  };

  const crearCondominio = async () => {
    if (!nuevoCondominio.nombre || !nuevoCondominio.slug) return;
    const slug = nuevoCondominio.slug.toLowerCase().replace(/\s+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const { data, error } = await supabase.from("condominios").insert([{ nombre: nuevoCondominio.nombre, slug, activo: true }]).select();
    if (error) { mostrarToast("❌ Error: " + error.message, "error"); return; }
    setCondominios(prev => [...prev, data[0]]);
    setModalNuevoCondominio(false);
    setNuevoCondominio({ nombre: "", slug: "" });
    mostrarToast("✅ Condominio creado");
  };

  const abrirCondominioDetalle = async (cond) => {
    setCondominioDetalle(cond);
    const { data } = await supabase.from("rubros").select("*").eq("condominio_id", cond.id).order("orden");
    setRubrosCondominio(data || []);
  };

  const crearRubro = async () => {
    if (!nuevoRubro.nombre || !condominioDetalle) return;
    const { data, error } = await supabase.from("rubros").insert([{
      condominio_id: condominioDetalle.id,
      nombre: nuevoRubro.nombre,
      emoji: nuevoRubro.emoji || "🏪",
      color: nuevoRubro.color || "#2563EB",
      orden: rubrosCondominio.length
    }]).select();
    if (error) { mostrarToast("❌ Error: " + error.message, "error"); return; }
    setRubrosCondominio(prev => [...prev, data[0]]);
    setNuevoRubro({ nombre: "", emoji: "🏪", color: "#2563EB" });
    mostrarToast("✅ Rubro agregado");
  };

  const eliminarRubro = async (id) => {
    await supabase.from("rubros").delete().eq("id", id);
    setRubrosCondominio(prev => prev.filter(r => r.id !== id));
    mostrarToast("🗑 Rubro eliminado");
  };

  const subirBannerCondominio = async (condId, file) => {
    if (!file) return;
    mostrarToast("⏳ Comprimiendo y subiendo...", "ok");
    const fileComprimido = await comprimirImagen(file, "banner");
    const fileName = `cond_${condId}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("fotos-productos").upload(fileName, fileComprimido, { upsert: true, contentType: "image/jpeg" });
    if (uploadError) { mostrarToast("❌ Error subiendo banner", "error"); return; }
    const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
    const bannerUrl = urlData.publicUrl;
    await supabase.from("condominios").update({ banner: bannerUrl }).eq("id", condId);
    setCondominios(prev => prev.map(c => c.id === condId ? { ...c, banner: bannerUrl } : c));
    if (condominioDetalle?.id === condId) setCondominioDetalle(prev => ({ ...prev, banner: bannerUrl }));
    mostrarToast("✅ Banner actualizado");
  };

  const cargarKioskos = async () => {
    setCargando(true);
    const { data, error } = await supabase.from("kioskos").select(`*, productos (*)`).order("created_at", { ascending: false });
    if (error) { mostrarToast("Error cargando kioskos", "error"); setCargando(false); return; }
    // ✅ Contar pedidos por kiosko
    const { data: pedidos } = await supabase.from("pedidos").select("kiosko_id");
    const conteo = {};
    (pedidos || []).forEach(p => { conteo[p.kiosko_id] = (conteo[p.kiosko_id] || 0) + 1; });
    const kioskosConPedidos = (data || []).map(k => ({ ...k, total_pedidos: conteo[k.id] || 0 }));
    setKioskos(kioskosConPedidos);
    setCargando(false);
  };

  const abrirModalCatMadre = async (kiosko) => {
    setModalCatMadre(kiosko);
    const { data } = await supabase.from("categorias_madre").select("*").eq("kiosko_id", kiosko.id).order("orden");
    setCatMadres(data || []);
  };

  const subirImagenMadre = async (madreId, file) => {
    if (!file) return;
    mostrarToast("⏳ Comprimiendo y subiendo...", "ok");
    const fileComprimido = await comprimirImagen(file, "banner");
    const fileName = `madre_${madreId}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("fotos-productos").upload(fileName, fileComprimido, { upsert: true, contentType: "image/jpeg" });
    if (uploadError) { mostrarToast("❌ Error subiendo imagen", "error"); return; }
    const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
    const imagenUrl = urlData.publicUrl;
    await supabase.from("categorias_madre").update({ imagen_url: imagenUrl }).eq("id", madreId);
    setCatMadres(prev => prev.map(m => m.id === madreId ? { ...m, imagen_url: imagenUrl } : m));
    mostrarToast("✅ Imagen actualizada");
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
      if (!filas || filas.length === 0) { mostrarToast("❌ El Excel está vacío", "error"); return; }
      const productos = filas.map(fila => {
        const get = (keys) => { for (const k of keys) { const found = Object.keys(fila).find(f => f.toLowerCase().trim() === k.toLowerCase()); if (found) return fila[found]; } return ""; };
        const precioBaseExcel = parseFloat(get(["precio", "costo"])) || 0;
        const variacionesTexto = get(["variaciones", "tallas", "sabores", "presentacion"]);
        let variacionesFinales = [];
        let precioParaCatalogo = precioBaseExcel;
        if (variacionesTexto && String(variacionesTexto).trim() !== "") {
          variacionesFinales = String(variacionesTexto).split(',').map(v => { const partes = v.split(':'); const nombre = partes[0].trim(); const precioV = partes[1] ? parseFloat(partes[1]) : precioBaseExcel; return { nombre, precio: precioV }; });
          precioParaCatalogo = Math.min(...variacionesFinales.map(v => v.precio));
        }
        const madreVal = String(get(["madre", "categoria madre", "categoriamadre"]) || "").trim();
        const descripcionVal = String(get(["descripcion", "descripción", "detalle", "detalle producto"]) || "").trim();
        const coloresTexto = String(get(["colores", "color", "colors"]) || "").trim();
        const coloresFinales = coloresTexto ? coloresTexto.split(',').map(c => c.trim()).filter(Boolean) : [];
        return {
          nombre: String(get(["nombre", "producto", "name"]) || "").trim(),
          precio: precioParaCatalogo,
          categoria: String(get(["categoria", "tipo"]) || "Otros").trim(),
          madre: madreVal || null,
          emoji: String(get(["emoji", "icono"]) || "🛒").trim(),
          descripcion: descripcionVal || null,
          stock: true,
          cantidad: parseInt(get(["cantidad", "stock_actual"])) || 0,
          kiosko_id: kioskoid,
          foto: null,
          variaciones: variacionesFinales,
          colores: coloresFinales.length > 0 ? coloresFinales : []
        };
      }).filter(p => p.nombre);
      if (productos.length === 0) { mostrarToast("❌ No se encontraron productos con nombre", "error"); return; }
      const { data, error } = await supabase.from("productos").upsert(productos, { onConflict: 'nombre,kiosko_id' }).select();
      if (error) { mostrarToast("❌ Error guardando: " + error.message, "error"); return; }
      const madresUnicas = [...new Set(productos.map(p => p.madre).filter(Boolean))];
      if (madresUnicas.length > 0) {
        const { data: madresExistentes } = await supabase.from("categorias_madre").select("nombre").eq("kiosko_id", kioskoid);
        const nombresExistentes = (madresExistentes || []).map(m => m.nombre);
        const madresNuevas = madresUnicas.filter(m => !nombresExistentes.includes(m));
        if (madresNuevas.length > 0) {
          await supabase.from("categorias_madre").insert(madresNuevas.map((nombre, i) => ({ kiosko_id: kioskoid, nombre, orden: nombresExistentes.length + i })));
        }
        mostrarToast(`✅ ${data.length} productos · ${madresUnicas.length} categorías madre detectadas`);
      } else {
        mostrarToast(`✅ ${data.length} productos cargados`);
      }
      setKioskos(prev => prev.map(k => {
        if (k.id === kioskoid) {
          const nombresNuevos = data.map(d => d.nombre);
          const productosSinCambios = k.productos.filter(p => !nombresNuevos.includes(p.nombre));
          return { ...k, productos: [...productosSinCambios, ...data] };
        }
        return k;
      }));
    } catch (err) { mostrarToast("❌ Error leyendo Excel: " + err.message, "error"); }
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
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Nunito', sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-weight: 700; transition: all 0.15s; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .card { background: #fff; border: 1px solid #E5E7EB; border-radius: 14px; }
        .toggle { position: relative; width: 42px; height: 23px; border-radius: 999px; cursor: pointer; border: none; outline: none; transition: background 0.2s; flex-shrink: 0; }
        .toggle-knob { position: absolute; top: 2.5px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .inp { width: 100%; background: #F8FAFC; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; font-family: inherit; outline: none; transition: border 0.2s; }
        .inp:focus { border-color: #2563EB; background: #fff; }
        select { font-family: inherit; background: #F8FAFC; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; width: 100%; outline: none; cursor: pointer; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; overflow-y: auto; }
        .modal { background: #fff; border-radius: 18px; padding: 28px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 999px; font-size: 13px; font-weight: 700; z-index: 200; white-space: nowrap; }
        .row:hover { background: #F8FAFC; cursor: pointer; }
        .fade { animation: fade 0.3s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 3px; }
        .upload-zone { border: 2px dashed #bfdbfe; border-radius: 10px; padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s; background: #eff6ff; }
        .upload-zone:hover { border-color: #2563EB; }
      `}</style>

      {toast && <div className="toast" style={{ background: toast.tipo === "ok" ? "#059669" : "#dc2626", color: "#fff" }}>{toast.msg}</div>}
      {cargando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#2563EB" }}>⏳ Cargando kioskos...</p>
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "13px 24px", display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" style={{ height: 32, objectFit: "contain" }} alt="KiKiosko" />
        <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "3px 10px", borderRadius: 999, fontWeight: 700 }}>👑 SÚPER ADMIN</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: vistaCondominios ? "#2563EB" : "#eff6ff", color: vistaCondominios ? "#fff" : "#2563EB", padding: "9px 14px", fontSize: 12, border: "1px solid #bfdbfe" }} onClick={() => setVistaCondominios(!vistaCondominios)}>🏘 Condominios</button>
          <button className="btn" style={{ background: "#2563EB", color: "#fff", padding: "9px 18px", fontSize: 12 }} onClick={() => setModalNuevo(true)}>+ Nuevo kiosko</button>
          <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "9px 14px", fontSize: 12, border: "1px solid #E5E7EB" }} onClick={onSalir}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total kioskos", val: kioskos.length, color: "#111827", icon: "🏪" },
            { label: "Activos", val: activos.length, color: "#059669", icon: "✅" },
            { label: "Inactivos", val: inactivos.length, color: "#dc2626", icon: "❌" },
            { label: "Ingreso mensual", val: `S/. ${ingresoMensual}`, color: "#2563EB", icon: "💰" },
            { label: "Total pedidos", val: kioskos.reduce((s, k) => s + (k.total_pedidos || 0), 0), color: "#7c3aed", icon: "📦" },
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

        {kioskos.filter(k => k.activo && diasRestantes(k.vence) <= 7 && diasRestantes(k.vence) >= 0).length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
            ⚠️ <strong>{kioskos.filter(k => k.activo && diasRestantes(k.vence) <= 7).length} kiosko(s)</strong> vencen en los próximos 7 días
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" style={{ width: 240 }} placeholder="🔍 Buscar kiosko o dueño..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          {[["todos", "Todos"], ["activos", `✅ Activos (${activos.length})`], ["inactivos", `❌ Inactivos (${inactivos.length})`]].map(([id, label]) => (
            <button key={id} className="btn" style={{ padding: "8px 14px", fontSize: 11, background: filtro === id ? "#eff6ff" : "#F8FAFC", color: filtro === id ? "#2563EB" : "#6B7280", border: `1px solid ${filtro === id ? "#bfdbfe" : "#E5E7EB"}` }} onClick={() => setFiltro(id)}>{label}</button>
          ))}
        </div>

        {/* ✅ VISTA CONDOMINIOS */}
        {vistaCondominios && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <p style={{ fontWeight: 900, fontSize: 16 }}>🏘 Condominios</p>
                <p style={{ fontSize: 12, color: "#9ca3af" }}>{condominios.length} condominios registrados</p>
              </div>
              <button className="btn" style={{ background: "#2563EB", color: "#fff", padding: "9px 16px", fontSize: 12 }} onClick={() => setModalNuevoCondominio(true)}>+ Nuevo condominio</button>
            </div>
            {condominios.length === 0 ? (
              <div className="card" style={{ padding: "32px", textAlign: "center", color: "#9ca3af" }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>🏘</p>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Sin condominios aún</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Crea el primero con el botón de arriba</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {condominios.map(cond => (
                  <div key={cond.id} className="card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => abrirCondominioDetalle(cond)}>
                    {cond.banner ? (
                      <img src={cond.banner} alt={cond.nombre} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: 100, background: "linear-gradient(135deg, #2563EB, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🏘</div>
                    )}
                    <div style={{ padding: "12px 14px" }}>
                      <p style={{ fontWeight: 900, fontSize: 14, color: "#111827" }}>{cond.nombre}</p>
                      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>/{cond.slug}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 700 }}>
                          {kioskos.filter(k => k.condominio_id === cond.id).length} negocios
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: cond.activo ? "#dcfce7" : "#fee2e2", color: cond.activo ? "#059669" : "#dc2626", fontWeight: 700 }}>
                          {cond.activo ? "✅ Activo" : "❌ Inactivo"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" }}>
                {["Kiosko", "Plan", "Productos", "Pedidos", "Vence", "Estado", "Acceso"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(k => (
                <tr key={k.id} className="row" style={{ borderBottom: "1px solid #F8FAFC" }} onClick={() => setDetalle(k)}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: k.activo ? "#eff6ff" : "#fee2e2", display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800 }}>{k.nombre}</p>
                        <p style={{ fontSize: 11, color: "#9ca3af" }}>{k.dueno} · {k.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, color: "#2563EB", fontWeight: 700 }}>{k.plan}</span>
                    <p style={{ fontSize: 11, color: "#9ca3af" }}>S/. {k.monto}/mes</p>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: k.productos.length > 0 ? "#059669" : "#dc2626" }}>{k.productos.length} productos</td>
                  <td style={{ padding: "12px 16px" }}>
  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
    <span style={{ fontSize: 13, fontWeight: 900, color: k.total_pedidos > 0 ? "#2563EB" : "#9ca3af" }}>
      {k.total_pedidos} pedidos
    </span>
    {k.total_pedidos > 0 && (
      <span style={{ fontSize: 9, color: "#059669", fontWeight: 700, background: "#dcfce7", padding: "1px 6px", borderRadius: 999 }}>
        🔥 Activo
      </span>
    )}
    {k.total_pedidos === 0 && k.activo && (
      <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, background: "#f1f5f9", padding: "1px 6px", borderRadius: 999 }}>
        Sin ventas
      </span>
    )}
  </div>
</td>       
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ fontSize: 12, color: diasRestantes(k.vence) <= 7 ? "#F59E0B" : "#6B7280", fontWeight: diasRestantes(k.vence) <= 7 ? 700 : 400 }}>{fmtFecha(k.vence)}</p>
                    {diasRestantes(k.vence) <= 7 && diasRestantes(k.vence) >= 0 && <p style={{ fontSize: 10, color: "#F59E0B" }}>Vence en {diasRestantes(k.vence)} días</p>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: k.activo ? "#dcfce7" : "#fee2e2", color: k.activo ? "#059669" : "#dc2626" }}>
                      {k.activo ? "✅ Activo" : "❌ Inactivo"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }} onClick={e => { e.stopPropagation(); toggleAcceso(k.id); }}>
                    <button className="toggle" style={{ background: k.activo ? "#2563EB" : "#d1d5db" }}>
                      <div className="toggle-knob" style={{ left: k.activo ? "21px" : "3px" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setDetalle(null)}>✕</button>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px", margin: "12px 0" }}>
              <p style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginBottom: 4 }}>🛒 Link público para compradores</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>kikiosko-vyvv.vercel.app/#/{detalle.slug}</p>
              <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Comparte este link con tus clientes</p>
            </div>

            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Banner del catálogo</p>
              {detalle.banner && <div style={{ marginBottom: 10, borderRadius: 8, overflow: "hidden", height: 120 }}><img src={detalle.banner} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
              <input type="file" accept="image/jpeg,image/png,image/webp" id="banner-upload" style={{ display: "none" }}
                onChange={async e => {
                  const file = e.target.files[0]; if (!file) return;
                  mostrarToast("⏳ Comprimiendo y subiendo...", "ok");
                  const fileComprimido = await comprimirImagen(file, "banner");
                  const fileName = `banner_${detalle.id}_${Date.now()}.jpg`;
                  const { error: uploadError } = await supabase.storage.from("fotos-productos").upload(fileName, fileComprimido, { upsert: true, contentType: "image/jpeg" });
                  if (uploadError) { mostrarToast("❌ Error subiendo banner", "error"); return; }
                  const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
                  const bannerUrl = urlData.publicUrl;
                  await supabase.from("kioskos").update({ banner: bannerUrl }).eq("id", detalle.id);
                  setKioskos(prev => prev.map(k => k.id === detalle.id ? { ...k, banner: bannerUrl } : k));
                  setDetalle(prev => ({ ...prev, banner: bannerUrl }));
                  mostrarToast("✅ Banner actualizado"); e.target.value = "";
                }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1, background: "#eff6ff", color: "#2563EB", padding: "10px", fontSize: 12, border: "1.5px dashed #bfdbfe", borderRadius: 8 }}
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
                    }}>🗑</button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
              {[["Nombre", "nombre", detalle.nombre], ["WhatsApp", "whatsapp", detalle.whatsapp], ["Correo", "email", detalle.email], ["Clave", "clave", detalle.clave], ["Dueño", "dueno", detalle.dueno], ["Acceso hasta", "vence", detalle.vence]].map(([label, key, val]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #E5E7EB" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", width: 90, flexShrink: 0 }}>{label}</span>
                  <input type={key === "vence" ? "date" : "text"} defaultValue={val}
                    onBlur={e => actualizarDato(detalle.id, key, e.target.value)}
                    style={{ flex: 1, background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#111827", fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = "#2563EB"} />
                </div>
              ))}
              {[["Monto", `S/. ${detalle.monto}/mes`], ["Pagos", `${detalle.pagos} pagos`], ["Productos", `${detalle.productos.length} productos`], ["Estado", detalle.activo ? "✅ Activo" : "❌ Inactivo"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #E5E7EB", fontSize: 13 }}>
                  <span style={{ color: "#9ca3af" }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* ✅ ASIGNAR CONDOMINIO Y RUBRO */}
            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>🏘 Condominio</p>
              <select value={detalle.condominio_id || ""} onChange={async e => {
                const val = e.target.value || null;
                await supabase.from("kioskos").update({ condominio_id: val, rubro_id: null }).eq("id", detalle.id);
                setKioskos(prev => prev.map(k => k.id === detalle.id ? { ...k, condominio_id: val, rubro_id: null } : k));
                setDetalle(prev => ({ ...prev, condominio_id: val, rubro_id: null }));
                mostrarToast("✅ Condominio asignado");
              }}>
                <option value="">— Sin condominio —</option>
                {condominios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {detalle.condominio_id && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>🏷 Rubro</p>
                  <RubroSelector condominioId={detalle.condominio_id} rubroId={detalle.rubro_id}
                    onChange={async (rubroId) => {
                      await supabase.from("kioskos").update({ rubro_id: rubroId }).eq("id", detalle.id);
                      setKioskos(prev => prev.map(k => k.id === detalle.id ? { ...k, rubro_id: rubroId } : k));
                      setDetalle(prev => ({ ...prev, rubro_id: rubroId }));
                      mostrarToast("✅ Rubro asignado");
                    }} />
                </div>
              )}
            </div>

            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Plan actual</p>
              <div style={{ display: "flex", gap: 8 }}>
                {PLANES.map(p => (
                  <button key={p.id} className="btn" style={{ flex: 1, padding: "9px", fontSize: 11, background: detalle.plan === p.id ? "#eff6ff" : "#F8FAFC", color: detalle.plan === p.id ? "#2563EB" : "#374151", border: `1px solid ${detalle.plan === p.id ? "#bfdbfe" : "#E5E7EB"}` }}
                    onClick={() => cambiarPlan(detalle.id, p.id)}>
                    {p.id}<br /><span style={{ fontSize: 10 }}>S/. {p.precio}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Cargar productos desde Excel</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => subirExcel(detalle.id, e)} />
              <div className="upload-zone" onClick={() => fileRef.current.click()}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>📊 Subir Excel de productos</p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>nombre · precio · categoría · madre · emoji · stock</p>
              </div>
            </div>

            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Imágenes de categorías madre</p>
              <button className="btn" style={{ width: "100%", background: "#f0fdf4", color: "#059669", padding: "10px", fontSize: 12, border: "1px solid #bbf7d0" }}
                onClick={() => { const k = { ...detalle }; setDetalle(null); abrirModalCatMadre(k); }}>
                🗂 Gestionar imágenes de categorías madre
              </button>
            </div>

            <button className="btn" style={{ width: "100%", background: "#F8FAFC", color: "#374151", padding: "10px", fontSize: 12, border: "1px solid #E5E7EB", marginTop: 12 }}
              onClick={() => { setVistaProductos(detalle); setDetalle(null); }}>
              📦 Ver y gestionar productos ({detalle.productos.length})
            </button>

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

      {modalCatMadre && (
        <div className="modal-bg" onClick={() => setModalCatMadre(null)}>
          <div className="modal fade" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <p style={{ fontWeight: 900, fontSize: 16 }}>🗂 Categorías madre</p>
                <p style={{ fontSize: 11, color: "#9ca3af" }}>{modalCatMadre.nombre}</p>
              </div>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalCatMadre(null)}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
              Sube una imagen para cada categoría — aparecerá en la pantalla de inicio del catálogo.
            </p>
            {catMadres.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af" }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>📭</p>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Sin categorías madre</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Sube un Excel con la columna "madre"</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {catMadres.map(madre => (
                  <div key={madre.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E5E7EB" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#eff6ff", border: "1.5px solid #bfdbfe", display: "grid", placeItems: "center" }}>
                      {madre.imagen_url ? <img src={madre.imagen_url} alt={madre.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 28 }}>🗂</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 800, fontSize: 14, color: "#111827", marginBottom: 6 }}>{madre.nombre}</p>
                      <input type="file" accept="image/jpeg,image/png,image/webp" id={`madre-img-${madre.id}`} style={{ display: "none" }}
                        onChange={e => { subirImagenMadre(madre.id, e.target.files[0]); e.target.value = ""; }} />
                      <button className="btn" style={{ background: "#eff6ff", color: "#2563EB", padding: "6px 12px", fontSize: 11, border: "1.5px dashed #bfdbfe", borderRadius: 8 }}
                        onClick={() => document.getElementById(`madre-img-${madre.id}`).click()}>
                        {madre.imagen_url ? "🔄 Cambiar imagen" : "📸 Subir imagen"}
                      </button>
                    </div>
                    {madre.imagen_url && (
                      <button className="btn" style={{ background: "#fee2e2", color: "#dc2626", padding: "8px", fontSize: 12, border: "1px solid #fecaca", flexShrink: 0 }}
                        onClick={async () => {
                          await supabase.from("categorias_madre").update({ imagen_url: null }).eq("id", madre.id);
                          setCatMadres(prev => prev.map(m => m.id === madre.id ? { ...m, imagen_url: null } : m));
                          mostrarToast("🗑 Imagen eliminada");
                        }}>🗑</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalNuevo && (
        <div className="modal-bg" onClick={() => setModalNuevo(false)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>🏪 Nuevo kiosko</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalNuevo(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[["Nombre del kiosko", "nombre", "Kiosko Rosita"], ["Nombre del dueño", "dueno", "Rosa Flores"], ["Correo", "email", "rosita@correo.pe"], ["WhatsApp", "whatsapp", "999888777"], ["Contraseña", "clave", "clave123"]].map(([label, key, ph]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>
                  <input className="inp" placeholder={ph} value={nuevoKiosko[key]} onChange={e => setNuevoKiosko(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Plan</label>
                <select value={nuevoKiosko.plan} onChange={e => setNuevoKiosko(p => ({ ...p, plan: e.target.value }))}>
                  {PLANES.map(p => <option key={p.id}>{p.id} — S/. {p.precio}/mes</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Acceso hasta</label>
                <input className="inp" type="date" value={nuevoKiosko.vence} onChange={e => setNuevoKiosko(p => ({ ...p, vence: e.target.value }))} />
              </div>
            </div>
            <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: 13, fontSize: 14, marginTop: 20 }}
              onClick={crearKiosko}
              disabled={!nuevoKiosko.nombre || !nuevoKiosko.email || !nuevoKiosko.clave || !nuevoKiosko.whatsapp || !nuevoKiosko.vence}>
              ✅ Crear kiosko y activar acceso
            </button>
          </div>
        </div>
      )}

      {vistaProductos && (
        <div className="modal-bg" onClick={() => setVistaProductos(null)}>
          <div className="modal fade" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>📦 Productos — {vistaProductos.nombre}</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setVistaProductos(null)}>✕</button>
            </div>
            {vistaProductos.productos.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Sin productos aún</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {vistaProductos.productos.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E5E7EB" }}>
                    <span style={{ fontSize: 22 }}>{p.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>{p.nombre}</p>
                      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{p.madre ? `${p.madre} › ` : ""}{p.categoria}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#2563EB" }}>S/. {parseFloat(p.precio).toFixed(2)}</span>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 999, background: p.stock ? "#dcfce7" : "#fee2e2", color: p.stock ? "#059669" : "#dc2626", fontWeight: 700 }}>{p.stock ? "✅" : "❌"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
{/* Modal nuevo condominio */}
      {modalNuevoCondominio && (
        <div className="modal-bg" onClick={() => setModalNuevoCondominio(false)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>🏘 Nuevo condominio</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalNuevoCondominio(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Nombre del condominio</label>
                <input className="inp" placeholder="Ej: Condominio Vista Sol" value={nuevoCondominio.nombre}
                  onChange={e => setNuevoCondominio(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Slug (para el link)</label>
                <input className="inp" placeholder="Ej: vistasol" value={nuevoCondominio.slug}
                  onChange={e => setNuevoCondominio(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "") }))} />
                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Link: kikiosko-vyvv.vercel.app/#/c/{nuevoCondominio.slug || "vistasol"}</p>
              </div>
            </div>
            <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: 13, fontSize: 14, marginTop: 20 }}
              onClick={crearCondominio} disabled={!nuevoCondominio.nombre || !nuevoCondominio.slug}>
              ✅ Crear condominio
            </button>
          </div>
        </div>
      )}

      {/* Modal detalle condominio */}
      {condominioDetalle && (
        <div className="modal-bg" onClick={() => setCondominioDetalle(null)}>
          <div className="modal fade" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
  <div style={{ flex: 1, marginRight: 10 }}>
    <p style={{ fontWeight: 900, fontSize: 16 }}>🏘 {condominioDetalle.nombre}</p>
    <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>kikiosko-vyvv.vercel.app/#/c/{condominioDetalle.slug}</p>
    {/* Editar nombre */}
    <div style={{ display: "flex", gap: 6 }}>
      <input
        className="inp"
        defaultValue={condominioDetalle.nombre}
        placeholder="Nuevo nombre..."
        id="input-nombre-cond"
        style={{ fontSize: 12, padding: "6px 10px" }}
      />
      <button className="btn"
        style={{ background: "#2563EB", color: "#fff", padding: "6px 12px", fontSize: 11, flexShrink: 0 }}
        onClick={async () => {
          const nuevoNombre = document.getElementById("input-nombre-cond").value.trim();
          if (!nuevoNombre) return;
          await supabase.from("condominios").update({ nombre: nuevoNombre }).eq("id", condominioDetalle.id);
          setCondominios(prev => prev.map(c => c.id === condominioDetalle.id ? { ...c, nombre: nuevoNombre } : c));
          setCondominioDetalle(prev => ({ ...prev, nombre: nuevoNombre }));
          mostrarToast("✅ Nombre actualizado");
        }}>
        💾 Guardar
      </button>
    </div>
  </div>
  <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB", flexShrink: 0 }} onClick={() => setCondominioDetalle(null)}>✕</button>
</div>

            {/* Banner condominio */}
            <div style={{ padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Banner / Foto fachada</p>
              {condominioDetalle.banner && (
                <div style={{ marginBottom: 10, borderRadius: 12, overflow: "hidden", height: 120 }}>
                  <img src={condominioDetalle.banner} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" id="cond-banner-upload" style={{ display: "none" }}
                onChange={async e => { const file = e.target.files[0]; if (!file) return; await subirBannerCondominio(condominioDetalle.id, file); e.target.value = ""; }} />
              <button className="btn" style={{ width: "100%", background: "#eff6ff", color: "#2563EB", padding: "10px", fontSize: 12, border: "1.5px dashed #bfdbfe", borderRadius: 8 }}
                onClick={() => document.getElementById("cond-banner-upload").click()}>
                🖼️ {condominioDetalle.banner ? "Cambiar foto fachada" : "Subir foto fachada"}
              </button>
            </div>

            {/* Rubros */}
            <div style={{ padding: "12px 0" }}>
              <p style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Rubros del condominio</p>
              {rubrosCondominio.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {rubrosCondominio.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                      <span style={{ fontSize: 20 }}>{r.emoji}</span>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{r.nombre}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{kioskos.filter(k => k.rubro_id === r.id).length} negocios</span>
                      <button className="btn" style={{ background: "#fee2e2", color: "#dc2626", padding: "5px 8px", fontSize: 11, border: "1px solid #fecaca" }}
                        onClick={() => eliminarRubro(r.id)}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Agregar rubro */}
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px", border: "1px solid #E5E7EB" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 10 }}>+ Agregar rubro</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input className="inp" placeholder="Emoji" value={nuevoRubro.emoji}
                    onChange={e => setNuevoRubro(p => ({ ...p, emoji: e.target.value }))}
                    style={{ width: 60, textAlign: "center", fontSize: 18 }} />
                  <input className="inp" placeholder="Nombre del rubro" value={nuevoRubro.nombre}
                    onChange={e => setNuevoRubro(p => ({ ...p, nombre: e.target.value }))} />
                </div>
                <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: "10px", fontSize: 12 }}
                  onClick={crearRubro} disabled={!nuevoRubro.nombre}>
                  ✅ Agregar rubro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN KIOSKO ───
function AdminKiosko({ kiosko, onSalir, onVerCatalogo, onProductosChange }) {
  const [productos, setProductos] = useState(kiosko.productos);
  const [modalProducto, setModalProducto] = useState(null);
  const [modalPago, setModalPago] = useState(false);
  const [datosPago, setDatosPago] = useState(kiosko.datos_pago || {});
  const [toast, setToast] = useState(null);
  const [catMadres, setCatMadres] = useState([]);
  const [busquedaAdmin, setBusquedaAdmin] = useState("");
  const [modalTienda, setModalTienda] = useState(false);
  const [infoTienda, setInfoTienda] = useState(kiosko.info_tienda || {});
  const [modalBiblioteca, setModalBiblioteca] = useState(false);
  const [bibliotecaFotos, setBibliotecaFotos] = useState([]);
  const [busquedaBiblioteca, setBusquedaBiblioteca] = useState("");
  const [pedidosData, setPedidosData] = useState([]);
  const [filtroPedidos, setFiltroPedidos] = useState("semana");

  const categoriasExistentes = [...new Set(productos.map(p => p.categoria))].filter(Boolean);
  const categoriasParaMostrar = categoriasExistentes.length > 0 ? categoriasExistentes : ["Bebidas", "SnackioskosConProductos", "Abarrotes", "Otros"];
  const madresExistentes = [...new Set(productos.map(p => p.madre).filter(Boolean))];

  const [nuevoProducto, setNuevoProducto] = useState({
    nombre: "", precio: "", categoria: categoriasParaMostrar[0], madre: "", emoji: "🛒", stock: true, cantidad: 0, foto: null
  });

  useEffect(() => {
    supabase.from("categorias_madre").select("*").eq("kiosko_id", kiosko.id).order("orden")
      .then(({ data }) => setCatMadres(data || []));
  }, [kiosko.id]);

  useEffect(() => {
  supabase.from("pedidos")
    .select("*")
    .eq("kiosko_id", kiosko.id)
    .order("created_at", { ascending: true })
    .then(({ data }) => setPedidosData(data || []));
}, [kiosko.id]);

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2500); };
  const actualizarProductos = (nuevos) => { setProductos(nuevos); onProductosChange(nuevos); };

  const eliminar = async (id) => {
    await supabase.from("productos").delete().eq("id", id);
    actualizarProductos(productos.filter(p => p.id !== id));
    mostrarToast("🗑 Producto eliminado");
  };

  const guardar = async () => {
    mostrarToast("⏳ Guardando...", "ok");
    let fotoUrl = nuevoProducto.foto && !nuevoProducto.fotoFile ? nuevoProducto.foto : null;
    if (nuevoProducto.fotoFile) {
      mostrarToast("⏳ Comprimiendo foto...", "ok");
      const fileComprimido = await comprimirImagen(nuevoProducto.fotoFile, "producto");
      const fileName = `${kiosko.id}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("fotos-productos").upload(fileName, fileComprimido, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) { mostrarToast("❌ Error subiendo foto", "error"); return; }
      const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
      fotoUrl = urlData.publicUrl;

      // ✅ Guardar en biblioteca compartida
      await supabase.from("imagenes_biblioteca").insert([{
        nombre: nuevoProducto.nombre || "Sin nombre",
        categoria: nuevoProducto.categoria || "Otros",
        emoji: nuevoProducto.emoji || "📦",
        url: fotoUrl,
        veces_usada: 1
      }]);
    }
    const productoParaDB = {
      nombre: nuevoProducto.nombre, precio: parseFloat(nuevoProducto.precio) || 0,
      emoji: nuevoProducto.emoji || "🛒", categoria: nuevoProducto.categoria,
      madre: nuevoProducto.madre || null,
      cantidad: parseInt(nuevoProducto.cantidad) || 0,
      stock: (parseInt(nuevoProducto.cantidad) || 0) > 0,
      kiosko_id: kiosko.id, foto: fotoUrl,
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
    if (nuevoProducto.madre && !catMadres.find(m => m.nombre === nuevoProducto.madre)) {
      const { data: nuevaMadre } = await supabase.from("categorias_madre")
        .insert([{ kiosko_id: kiosko.id, nombre: nuevoProducto.madre, orden: catMadres.length }]).select();
      if (nuevaMadre) setCatMadres(prev => [...prev, nuevaMadre[0]]);
    }
    actualizarProductos(nuevos);
    setModalProducto(null);
    setNuevoProducto({ nombre: "", precio: "", categoria: categoriasParaMostrar[0], madre: "", emoji: "🛒", stock: true, cantidad: 0, foto: null, fotoFile: null });
  };

  const guardarDatosPago = async () => {
    await supabase.from("kioskos").update({ datos_pago: datosPago }).eq("id", kiosko.id);
    mostrarToast("✅ Datos de pago guardados");
    setModalPago(false);
  };

  const guardarInfoTienda = async () => {
    await supabase.from("kioskos").update({ info_tienda: infoTienda }).eq("id", kiosko.id);
    mostrarToast("✅ Info de tienda guardada");
    setModalTienda(false);
  };

  const calcularDatosGrafico = () => {
  const ahora = new Date();
  let labels = [];
  let datos = [];

  if (filtroPedidos === "dia") {
    // Últimas 24 horas por hora
    for (let i = 23; i >= 0; i--) {
      const hora = new Date(ahora);
      hora.setHours(ahora.getHours() - i, 0, 0, 0);
      const horaFin = new Date(hora);
      horaFin.setHours(hora.getHours() + 1);
      const count = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= hora && d < horaFin;
      }).length;
      const total = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= hora && d < horaFin;
      }).reduce((s, p) => s + Number(p.total || 0), 0);
      labels.push(`${hora.getHours()}h`);
      datos.push({ label: `${hora.getHours()}:00`, pedidos: count, total: Number(total.toFixed(2)) });
    }
  } else if (filtroPedidos === "semana") {
    // Últimos 7 días
    const dias = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(ahora);
      dia.setDate(ahora.getDate() - i);
      dia.setHours(0, 0, 0, 0);
      const diaFin = new Date(dia);
      diaFin.setDate(dia.getDate() + 1);
      const count = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= dia && d < diaFin;
      }).length;
      const total = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= dia && d < diaFin;
      }).reduce((s, p) => s + Number(p.total || 0), 0);
      datos.push({ label: dias[dia.getDay()], pedidos: count, total: Number(total.toFixed(2)) });
    }
  } else if (filtroPedidos === "mes") {
    // Últimos 30 días
    for (let i = 29; i >= 0; i--) {
      const dia = new Date(ahora);
      dia.setDate(ahora.getDate() - i);
      dia.setHours(0, 0, 0, 0);
      const diaFin = new Date(dia);
      diaFin.setDate(dia.getDate() + 1);
      const count = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= dia && d < diaFin;
      }).length;
      const total = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= dia && d < diaFin;
      }).reduce((s, p) => s + Number(p.total || 0), 0);
      datos.push({ label: `${dia.getDate()}/${dia.getMonth()+1}`, pedidos: count, total: Number(total.toFixed(2)) });
    }
  } else if (filtroPedidos === "año") {
    // Últimos 12 meses
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    for (let i = 11; i >= 0; i--) {
      const mes = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const mesFin = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 1);
      const count = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= mes && d < mesFin;
      }).length;
      const total = pedidosData.filter(p => {
        const d = new Date(p.created_at);
        return d >= mes && d < mesFin;
      }).reduce((s, p) => s + Number(p.total || 0), 0);
      datos.push({ label: meses[mes.getMonth()], pedidos: count, total: Number(total.toFixed(2)) });
    }
  }
  return datos;
};

const datosGrafico = calcularDatosGrafico();
const totalPeriodo = datosGrafico.reduce((s, d) => s + d.pedidos, 0);
const ventasPeriodo = datosGrafico.reduce((s, d) => s + d.total, 0);
  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Nunito', sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn { border: none; border-radius: 8px; font-family: inherit; cursor: pointer; font-weight: 700; transition: all 0.15s; }
        .card { background: #fff; border: 1px solid #E5E7EB; border-radius: 14px; }
        .inp { width: 100%; background: #F8FAFC; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; font-family: inherit; outline: none; }
        .inp:focus { border-color: #2563EB; background: #fff; }
        select { font-family: inherit; background: #F8FAFC; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #111827; width: 100%; outline: none; cursor: pointer; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal { background: #fff; border-radius: 18px; padding: 28px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 999px; font-size: 13px; font-weight: 700; z-index: 200; white-space: nowrap; }
        .row:hover { background: #F8FAFC; }
        .fade { animation: fade 0.3s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {toast && <div className="toast" style={{ background: toast.tipo === "ok" ? "#059669" : "#dc2626", color: "#fff" }}>{toast.msg}</div>}

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "13px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🏪</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 900, fontSize: 15 }}>{kiosko.nombre}</p>
          <p style={{ fontSize: 11, color: "#9ca3af" }}>Panel de administración</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#eff6ff", color: "#2563EB", padding: "8px 14px", fontSize: 12, border: "1px solid #bfdbfe" }} onClick={() => setModalTienda(true)}>🏪 Mi Tienda</button>
          <button className="btn" style={{ background: "#eff6ff", color: "#1d4ed8", padding: "8px 14px", fontSize: 12, border: "1px solid #bfdbfe" }} onClick={() => setModalPago(true)}>💳 Datos de pago</button>
          {kiosko.plan !== "Básico" ? (
            <button className="btn" style={{ background: "#2563EB", color: "#fff", padding: "8px 14px", fontSize: 12 }}
              onClick={() => { setModalProducto({}); setNuevoProducto({ nombre: "", precio: "", categoria: categoriasParaMostrar[0], madre: madresExistentes[0] || "", emoji: "🛒", stock: true, cantidad: 0, foto: null, fotoFile: null }); }}>
              + Agregar producto
            </button>
          ) : (
            <button className="btn" style={{ background: "#e5e7eb", color: "#9ca3af", padding: "8px 14px", fontSize: 12, cursor: "not-allowed" }}
              onClick={() => mostrarToast("🔒 Mejora tu plan para agregar productos", "error")}>
              🔒 Agregar producto
            </button>
          )}
          <div style={{ width: 1, background: "#E5E7EB", margin: "0 4px" }} />
          <button className="btn" style={{ background: "#f0fdf4", color: "#059669", padding: "8px 14px", fontSize: 12, border: "1px solid #bbf7d0" }} onClick={onVerCatalogo}>👁 Ver catálogo</button>
          <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "8px 14px", fontSize: 12, border: "1px solid #E5E7EB" }} onClick={onSalir}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
  { label: "Total productos", val: productos.length, color: "#111827", icon: "📦" },
  { label: "En stock", val: productos.filter(p => p.stock).length, color: "#059669", icon: "✅" },
  { label: "Sin stock", val: productos.filter(p => !p.stock).length, color: "#dc2626", icon: "❌" },
  { label: "Pedidos totales", val: pedidosData.length, color: "#2563EB", icon: "🛒" },
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

        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginBottom: 2 }}>🛒 Link para tus compradores</p>
              <p style={{ fontSize: 13, fontWeight: 800 }}>
  {kiosko.condominio_slug 
    ? `kikiosko-vyvv.vercel.app/#/c/${kiosko.condominio_slug}/${kiosko.slug}`
    : `kikiosko-vyvv.vercel.app/#/${kiosko.slug}`
  }
</p>
            </div>
            <button className="btn" style={{ background: "#059669", color: "#fff", padding: "8px 14px", fontSize: 11 }}
              onClick={() => { navigator.clipboard?.writeText(`kikiosko-vyvv.vercel.app/#/${kiosko.slug}`); mostrarToast("📋 Link copiado"); }}>
              📋 Copiar
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16, gap: 8 }}>
            <QRCode 
  value={kiosko.condominio_slug 
    ? `https://kikiosko-vyvv.vercel.app/#/c/${kiosko.condominio_slug}/${kiosko.slug}`
    : `https://kikiosko-vyvv.vercel.app/#/${kiosko.slug}`
  } 
  size={160} bgColor="#ffffff" fgColor="#111827" level="H" 
/>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>📲 Tus clientes escanean este QR y llegan directo a tu tienda</p>
          </div>
        </div>

        {kiosko.plan !== "Básico" && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "10px 14px" }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <input style={{ border: "none", outline: "none", fontSize: 14, flex: 1, fontFamily: "inherit", color: "#111827" }}
                placeholder="Buscar producto por nombre..." value={busquedaAdmin} onChange={e => setBusquedaAdmin(e.target.value)} />
              {busquedaAdmin && (
                <button onClick={() => setBusquedaAdmin("")} style={{ border: "none", background: "#F8FAFC", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", color: "#6B7280" }}>✕</button>
              )}
            </div>
          </div>
        )}

        {/* ✅ GRÁFICO DE PEDIDOS */}
<div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <div>
      <p style={{ fontWeight: 900, fontSize: 15, color: "#111827", margin: 0 }}>📈 Mis pedidos</p>
      <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
        {totalPeriodo} pedidos · S/. {ventasPeriodo.toFixed(2)} en ventas
      </p>
    </div>
    <div style={{ display: "flex", gap: 4 }}>
      {[["dia","Día"],["semana","Semana"],["mes","Mes"],["año","Año"]].map(([val, label]) => (
        <button key={val} className="btn"
          onClick={() => setFiltroPedidos(val)}
          style={{ padding: "5px 10px", fontSize: 11, background: filtroPedidos === val ? "#2563EB" : "#F8FAFC", color: filtroPedidos === val ? "#fff" : "#6B7280", border: `1px solid ${filtroPedidos === val ? "#2563EB" : "#E5E7EB"}` }}>
          {label}
        </button>
      ))}
    </div>
  </div>

  {pedidosData.length === 0 ? (
    <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af" }}>
      <p style={{ fontSize: 32, marginBottom: 8 }}>📊</p>
      <p style={{ fontSize: 13, fontWeight: 700 }}>Sin pedidos aún</p>
      <p style={{ fontSize: 11, marginTop: 4 }}>Los pedidos aparecerán aquí cuando tus clientes compren</p>
    </div>
  ) : (
    (() => {
      const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = require("recharts");
      return (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={datosGrafico} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [
                name === "pedidos" ? `${value} pedidos` : `S/. ${value}`,
                name === "pedidos" ? "Pedidos" : "Ventas"
              ]}
            />
            <Line type="monotone" dataKey="pedidos" stroke="#2563EB" strokeWidth={2.5} dot={{ fill: "#2563EB", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    })()
  )}
</div>

        <div className="card" style={{ overflow: "hidden" }}>
          {productos.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Sin productos — agrega el primero con el botón de arriba</div>
          ) : productos
            .filter(p => busquedaAdmin === "" || p.nombre.toLowerCase().includes(busquedaAdmin.toLowerCase()))
            .map(p => (
              <div key={p.id} className="row" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderBottom: "1px solid #E5E7EB" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{p.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{p.nombre}</h4>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{p.madre ? `${p.madre} › ` : ""}{p.categoria}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {kiosko.plan !== "Básico" && (
                      <button className="btn"
                        onClick={async () => {
                          const nuevaOferta = !p.oferta;
                          await supabase.from("productos").update({ oferta: nuevaOferta }).eq("id", p.id);
                          actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, oferta: nuevaOferta } : pr));
                          mostrarToast(nuevaOferta ? "🔥 Marcado como oferta" : "✅ Oferta desactivada");
                        }}
                        style={{ background: p.oferta ? "#fef3c7" : "#F8FAFC", color: p.oferta ? "#d97706" : "#9ca3af", padding: "5px 10px", border: `1px solid ${p.oferta ? "#fde68a" : "#E5E7EB"}` }}>
                        🔥
                      </button>
                    )}
                    <button className="btn" onClick={() => { setModalProducto(p); setNuevoProducto({ ...p, madre: p.madre || "", fotos: p.fotos || [], colores: p.colores || [] }); }} style={{ background: "#eff6ff", color: "#2563EB", padding: "5px 10px" }}>✏️</button>
                    <button className="btn" onClick={() => eliminar(p.id)} style={{ background: "#fee2e2", color: "#dc2626", padding: "5px 10px" }}>🗑️</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>Stock:</span>
                    <button className="btn" style={{ width: 24, height: 24, background: "#eff6ff", color: "#2563EB", fontSize: 14, border: "1px solid #bfdbfe", borderRadius: 6, padding: 0, lineHeight: 1 }}
                      onClick={async () => { const n = Math.max(0, (parseInt(p.cantidad) || 0) - 1); await supabase.from("productos").update({ cantidad: n, stock: n > 0 }).eq("id", p.id); actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: n, stock: n > 0 } : pr)); }}>−</button>
                    <input type="number" min="0" value={p.cantidad ?? 0}
                      onChange={e => { const val = parseInt(e.target.value) || 0; actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: val, stock: val > 0 } : pr)); }}
                      onBlur={async e => { const val = parseInt(e.target.value) || 0; await supabase.from("productos").update({ cantidad: val, stock: val > 0 }).eq("id", p.id); }}
                      style={{ width: 44, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 4px", fontSize: 12, fontWeight: 900, color: "#2563EB", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
                    <button className="btn" style={{ width: 24, height: 24, background: "#2563EB", color: "#fff", fontSize: 14, borderRadius: 6, padding: 0, lineHeight: 1 }}
                      onClick={async () => { const n = (parseInt(p.cantidad) || 0) + 1; await supabase.from("productos").update({ cantidad: n, stock: true }).eq("id", p.id); actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, cantidad: n, stock: true } : pr)); }}>+</button>
                  </div>
                  {p.variaciones && p.variaciones.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                      {p.variaciones.map((v, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#eff6ff", padding: "7px 12px", borderRadius: 8, border: "1px solid #bfdbfe" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{v.nombre}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>S/.</span>
                            <input type="text" defaultValue={Number(v.precio).toFixed(2)} onFocus={e => e.target.select()}
                              onBlur={async e => {
                                const nuevoPrecio = parseFloat(e.target.value.replace(",", ".")) || 0;
                                const nuevasVariaciones = p.variaciones.map((vv, i) => i === idx ? { ...vv, precio: nuevoPrecio } : vv);
                                const precioMin = Math.min(...nuevasVariaciones.map(vv => vv.precio));
                                await supabase.from("productos").update({ variaciones: nuevasVariaciones, precio: precioMin }).eq("id", p.id);
                                actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, variaciones: nuevasVariaciones, precio: precioMin } : pr));
                                mostrarToast("✅ Precio actualizado");
                              }}
                              style={{ width: 65, background: "#fff", border: "1.5px solid #bfdbfe", borderRadius: 7, padding: "5px 8px", fontSize: 14, fontWeight: 900, color: "#2563EB", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>S/.</span>
                      <input type="text" value={isNaN(p.precio) ? "" : Number(p.precio).toFixed(2)}
                        onChange={e => { 
  const val = e.target.value.replace(",", "."); 
  actualizarProductos(productos.map(pr => pr.id === p.id ? { 
    ...pr, 
    precio: parseFloat(val) || 0,
    _precioAntes: pr._precioAntes ?? pr.precio  // ✅ guarda precio antes de editar
  } : pr)); 
}}
                        onFocus={e => { e.target.style.borderColor = "#2563EB"; e.target.select(); }}
                        onBlur={async e => {
  e.target.style.borderColor = "#bfdbfe";
  const val = parseFloat(e.target.value.replace(",", ".")) || 0;
  const precioActual = parseFloat(p._precioAntes ?? p.precio) || 0; // ✅ usa precio antes de editar
  
  let updateData = { precio: val, _precioAntes: undefined };
  if (val < precioActual && !p.precio_original) {
    updateData.precio_original = precioActual;
  } else if (p.precio_original && val >= p.precio_original) {
    updateData.precio_original = null;
  }
  
  await supabase.from("productos").update({ 
    precio: val, 
    precio_original: updateData.precio_original !== undefined ? updateData.precio_original : p.precio_original 
  }).eq("id", p.id);
  actualizarProductos(productos.map(pr => pr.id === p.id ? { ...pr, ...updateData } : pr));
  mostrarToast("✅ Precio actualizado");
}}
                        style={{ width: 70, background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 7, padding: "6px 8px", fontSize: 14, fontWeight: 900, color: "#2563EB", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {modalTienda && (
        <div className="modal-bg" onClick={() => setModalTienda(false)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>🏪 Mi Tienda</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalTienda(false)}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18, lineHeight: 1.6 }}>Esta información aparecerá en el header de tu catálogo.</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>📋 Descripción corta</p>
            <input className="inp" style={{ marginBottom: 16 }} placeholder="Ej: Tu súper del barrio" value={infoTienda.descripcion || ""} onChange={e => setInfoTienda(p => ({ ...p, descripcion: e.target.value }))} />
            <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>📍 Dirección</p>
            <input className="inp" style={{ marginBottom: 16 }} placeholder="Ej: Av. Los Pinos 123, Miraflores" value={infoTienda.direccion || ""} onChange={e => setInfoTienda(p => ({ ...p, direccion: e.target.value }))} />
            <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>🕐 Horario de atención</p>
            <input className="inp" style={{ marginBottom: 10 }} placeholder="Ej: Lun-Vie 9am-10pm · Sáb 9am-8pm" value={infoTienda.horario || ""} onChange={e => setInfoTienda(p => ({ ...p, horario: e.target.value }))} />
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, display: "block", marginBottom: 4 }}>🟢 Hora apertura</label>
                <input className="inp" type="time" value={infoTienda.hora_apertura || ""} onChange={e => setInfoTienda(p => ({ ...p, hora_apertura: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, display: "block", marginBottom: 4 }}>🔴 Hora cierre</label>
                <input className="inp" type="time" value={infoTienda.hora_cierre || ""} onChange={e => setInfoTienda(p => ({ ...p, hora_cierre: e.target.value }))} />
              </div>
            </div>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 8 }}>🛵 Delivery</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {[{ id: "si", label: "✅ Sí ofrezco delivery" }, { id: "no", label: "❌ No por ahora" }].map(op => (
                <button key={op.id} className="btn"
                  onClick={() => setInfoTienda(p => ({ ...p, delivery: op.id }))}
                  style={{ flex: 1, padding: "10px", fontSize: 12, borderRadius: 10, background: infoTienda.delivery === op.id ? "#eff6ff" : "#F8FAFC", color: infoTienda.delivery === op.id ? "#2563EB" : "#6B7280", border: `1.5px solid ${infoTienda.delivery === op.id ? "#bfdbfe" : "#E5E7EB"}` }}>
                  {op.label}
                </button>
              ))}
            </div>
            {infoTienda.delivery === "si" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, background: "#eff6ff", borderRadius: 12, padding: "14px", border: "1px solid #bfdbfe" }}>
                <input className="inp" placeholder="Zonas de delivery" value={infoTienda.delivery_zonas || ""} onChange={e => setInfoTienda(p => ({ ...p, delivery_zonas: e.target.value }))} />
                <input className="inp" placeholder="Costo de delivery" value={infoTienda.delivery_costo || ""} onChange={e => setInfoTienda(p => ({ ...p, delivery_costo: e.target.value }))} />
                <input className="inp" placeholder="Tiempo estimado (Ej: 30-45 min)" value={infoTienda.delivery_tiempo || ""} onChange={e => setInfoTienda(p => ({ ...p, delivery_tiempo: e.target.value }))} />
              </div>
            )}
            <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: 13, fontSize: 14 }} onClick={guardarInfoTienda}>💾 Guardar info de tienda</button>
          </div>
        </div>
      )}

      {modalPago && (
        <div className="modal-bg" onClick={() => setModalPago(false)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>💳 Datos de pago</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalPago(false)}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18, lineHeight: 1.6 }}>Estos datos aparecerán cuando tu cliente elija el método de pago.</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 8 }}>📱 Yape / Plin</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              <input className="inp" placeholder="Número de Yape/Plin" value={datosPago.yape_numero || ""} onChange={e => setDatosPago(p => ({ ...p, yape_numero: e.target.value }))} />
              <input className="inp" placeholder="Nombre del titular" value={datosPago.yape_nombre || ""} onChange={e => setDatosPago(p => ({ ...p, yape_nombre: e.target.value }))} />
            </div>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", marginBottom: 8 }}>🏦 Transferencia bancaria</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              <input className="inp" placeholder="Banco (BCP, Interbank, BBVA...)" value={datosPago.banco || ""} onChange={e => setDatosPago(p => ({ ...p, banco: e.target.value }))} />
              <input className="inp" placeholder="Número de cuenta" value={datosPago.cuenta || ""} onChange={e => setDatosPago(p => ({ ...p, cuenta: e.target.value }))} />
              <input className="inp" placeholder="CCI" value={datosPago.cci || ""} onChange={e => setDatosPago(p => ({ ...p, cci: e.target.value }))} />
              <input className="inp" placeholder="A nombre de" value={datosPago.cuenta_nombre || ""} onChange={e => setDatosPago(p => ({ ...p, cuenta_nombre: e.target.value }))} />
            </div>
            <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: 13, fontSize: 14 }} onClick={guardarDatosPago}>💾 Guardar datos de pago</button>
          </div>
        </div>
      )}

      {modalProducto !== null && (
        <div className="modal-bg" onClick={() => setModalProducto(null)}>
          <div className="modal fade" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>{modalProducto?.id ? "✏️ Editar producto" : "➕ Nuevo producto"}</span>
              <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalProducto(null)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Foto del producto</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: "#eff6ff", border: "1.5px solid #bfdbfe", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
                    {nuevoProducto.foto ? <img src={nuevoProducto.foto} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 28 }}>{nuevoProducto.emoji || "📷"}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" id="foto-upload" style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setNuevoProducto(p => ({ ...p, foto: ev.target.result, fotoFile: file }));
                        reader.readAsDataURL(file);
                      }} />
                    <button className="btn" style={{ width: "100%", background: "#eff6ff", color: "#2563EB", padding: "10px", fontSize: 12, border: "1.5px dashed #bfdbfe", borderRadius: 8, marginBottom: 6 }}
                      onClick={() => document.getElementById("foto-upload").click()}>📸 Subir foto</button>
                    <button className="btn" style={{ width: "100%", background: "#f0fdf4", color: "#059669", padding: "10px", fontSize: 12, border: "1.5px dashed #bbf7d0", borderRadius: 8, marginBottom: 6 }}
                      onClick={() => setModalBiblioteca(true)}>🖼️ Buscar en biblioteca</button>
                    <p style={{ fontSize: 10, color: "#9ca3af" }}>JPG, PNG o WEBP · Se comprime automáticamente ✅</p>
                    {nuevoProducto.foto && <button className="btn" style={{ fontSize: 10, color: "#dc2626", background: "transparent", padding: "4px 0", marginTop: 4 }} onClick={() => setNuevoProducto(p => ({ ...p, foto: null }))}>🗑 Quitar foto</button>}
                  </div>
                </div>
              </div>

              {kiosko.plan === "Premium" && (
                <div>
                  <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                    Fotos adicionales <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(hasta 5)</span>
                  </label>
                  {(nuevoProducto.fotos || []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {(nuevoProducto.fotos || []).map((url, idx) => (
                        <div key={idx} style={{ position: "relative", width: 62, height: 62 }}>
                          <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "1.5px solid #bfdbfe" }} />
                          <button onClick={async () => {
                            const nuevasFotos = (nuevoProducto.fotos || []).filter((_, i) => i !== idx);
                            setNuevoProducto(p => ({ ...p, fotos: nuevasFotos }));
                            if (modalProducto?.id) {
                              await supabase.from("productos").update({ fotos: nuevasFotos }).eq("id", modalProducto.id);
                              actualizarProductos(productos.map(pr => pr.id === modalProducto.id ? { ...pr, fotos: nuevasFotos } : pr));
                            }
                          }} style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(nuevoProducto.fotos || []).length < 5 && (
                    <>
                      <input type="file" accept="image/jpeg,image/png,image/webp" id="foto-extra-upload" style={{ display: "none" }}
                        onChange={async e => {
                          const file = e.target.files[0]; if (!file) return;
                          mostrarToast("⏳ Comprimiendo foto...", "ok");
                          const fileComprimido = await comprimirImagen(file, "producto");
                          const fileName = `${kiosko.id}_extra_${Date.now()}.jpg`;
                          const { error: uploadError } = await supabase.storage.from("fotos-productos").upload(fileName, fileComprimido, { upsert: true, contentType: "image/jpeg" });
                          if (uploadError) { mostrarToast("❌ Error subiendo foto", "error"); return; }
                          const { data: urlData } = supabase.storage.from("fotos-productos").getPublicUrl(fileName);
                          const nuevasFotos = [...(nuevoProducto.fotos || []), urlData.publicUrl];
                          setNuevoProducto(p => ({ ...p, fotos: nuevasFotos }));
                          if (modalProducto?.id) {
                            await supabase.from("productos").update({ fotos: nuevasFotos }).eq("id", modalProducto.id);
                            actualizarProductos(productos.map(pr => pr.id === modalProducto.id ? { ...pr, fotos: nuevasFotos } : pr));
                          }
                          mostrarToast(`✅ Foto ${nuevasFotos.length}/5 agregada`);
                          e.target.value = "";
                        }} />
                      <button className="btn" style={{ width: "100%", background: "#eff6ff", color: "#2563EB", padding: "10px", fontSize: 12, border: "1.5px dashed #bfdbfe", borderRadius: 8 }}
                        onClick={() => document.getElementById("foto-extra-upload").click()}>
                        📸 + Agregar foto ({(nuevoProducto.fotos || []).length}/5)
                      </button>
                    </>
                  )}
                </div>
              )}

              {kiosko.plan === "Premium" && (
                <div>
                  <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                    Colores disponibles <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(opcional)</span>
                  </label>
                  {(nuevoProducto.colores || []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      {(nuevoProducto.colores || []).map((color, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 999, padding: "4px 10px" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#2563EB" }}>{color}</span>
                          <button onClick={async () => {
                            const nuevosColores = (nuevoProducto.colores || []).filter((_, i) => i !== idx);
                            setNuevoProducto(p => ({ ...p, colores: nuevosColores }));
                            if (modalProducto?.id) {
                              await supabase.from("productos").update({ colores: nuevosColores }).eq("id", modalProducto.id);
                              actualizarProductos(productos.map(pr => pr.id === modalProducto.id ? { ...pr, colores: nuevosColores } : pr));
                            }
                          }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="inp" placeholder="Ej: Blanco, Negro, Azul..." id="color-input"
                      onKeyDown={async e => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          const val = e.target.value.trim().replace(/,$/, "");
                          if (!val) return;
                          const nuevosColores = [...(nuevoProducto.colores || []), val];
                          setNuevoProducto(p => ({ ...p, colores: nuevosColores }));
                          e.target.value = "";
                          if (modalProducto?.id) {
                            await supabase.from("productos").update({ colores: nuevosColores }).eq("id", modalProducto.id);
                            actualizarProductos(productos.map(pr => pr.id === modalProducto.id ? { ...pr, colores: nuevosColores } : pr));
                          }
                        }
                      }} />
                    <button className="btn" style={{ background: "#2563EB", color: "#fff", padding: "10px 14px", fontSize: 12, flexShrink: 0 }}
                      onClick={async () => {
                        const input = document.getElementById("color-input");
                        const val = input.value.trim();
                        if (!val) return;
                        const nuevosColores = [...(nuevoProducto.colores || []), val];
                        setNuevoProducto(p => ({ ...p, colores: nuevosColores }));
                        input.value = "";
                        if (modalProducto?.id) {
                          await supabase.from("productos").update({ colores: nuevosColores }).eq("id", modalProducto.id);
                          actualizarProductos(productos.map(pr => pr.id === modalProducto.id ? { ...pr, colores: nuevosColores } : pr));
                        }
                      }}>+ Agregar</button>
                  </div>
                  <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>Escribe un color y presiona Enter o el botón +</p>
                </div>
              )}

              {[["Nombre", "nombre", "Juice 250ml"], ["Emoji (si no hay foto)", "emoji", "🥤"], ["Precio (S/.)", "precio", "1.50"]].map(([label, key, ph]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>
                  <input className="inp" placeholder={ph} value={nuevoProducto[key]} onChange={e => setNuevoProducto(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Categoría madre <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(opcional)</span>
                </label>
                {madresExistentes.length > 0 ? (
                  <select value={nuevoProducto.madre || ""} onChange={e => setNuevoProducto(p => ({ ...p, madre: e.target.value }))}>
                    <option value="">— Sin categoría madre —</option>
                    {madresExistentes.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input className="inp" placeholder="Ej: Abarrotes, Bebidas, Limpieza..." value={nuevoProducto.madre || ""} onChange={e => setNuevoProducto(p => ({ ...p, madre: e.target.value }))} />
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Categoría</label>
                <select value={nuevoProducto.categoria} onChange={e => setNuevoProducto(p => ({ ...p, categoria: e.target.value }))}>
                  {categoriasParaMostrar.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Cantidad en stock</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="btn" style={{ width: 36, height: 36, background: "#eff6ff", color: "#2563EB", fontSize: 20, border: "1.5px solid #bfdbfe", borderRadius: 8, flexShrink: 0 }}
                    onClick={() => setNuevoProducto(p => ({ ...p, cantidad: Math.max(0, (parseInt(p.cantidad) || 0) - 1), stock: Math.max(0, (parseInt(p.cantidad) || 0) - 1) > 0 }))}>−</button>
                  <input type="number" min="0" value={nuevoProducto.cantidad ?? ""} placeholder="0"
                    onChange={e => { const val = parseInt(e.target.value) || 0; setNuevoProducto(p => ({ ...p, cantidad: val, stock: val > 0 })); }}
                    style={{ flex: 1, background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "9px 14px", fontSize: 16, fontWeight: 900, color: "#2563EB", fontFamily: "inherit", outline: "none", textAlign: "center" }} />
                  <button className="btn" style={{ width: 36, height: 36, background: "#2563EB", color: "#fff", fontSize: 20, borderRadius: 8, flexShrink: 0 }}
                    onClick={() => setNuevoProducto(p => ({ ...p, cantidad: (parseInt(p.cantidad) || 0) + 1, stock: true }))}>+</button>
                </div>
                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>
                  {(parseInt(nuevoProducto.cantidad) || 0) === 0 ? "⚠️ Sin stock — no aparecerá disponible" : `✅ ${nuevoProducto.cantidad} unidades disponibles`}
                </p>
              </div>
            </div>
            <button className="btn" style={{ width: "100%", background: "#2563EB", color: "#fff", padding: 13, fontSize: 14, marginTop: 20 }}
              onClick={guardar} disabled={!nuevoProducto.nombre || !nuevoProducto.precio}>
              {modalProducto?.id ? "✅ Guardar cambios" : "✅ Agregar producto"}
            </button>
          </div>
        </div>
      )}

      {modalBiblioteca && (
  <div className="modal-bg" onClick={() => setModalBiblioteca(false)}>
    <div className="modal fade" onClick={e => e.stopPropagation()}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>🖼️ Biblioteca de imágenes</span>
        <button className="btn" style={{ background: "#F8FAFC", color: "#6B7280", padding: "6px 12px", fontSize: 11, border: "1px solid #E5E7EB" }} onClick={() => setModalBiblioteca(false)}>✕</button>
      </div>

      {/* Buscador */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "8px 14px", marginBottom: 14 }}>
        <span>🔍</span>
        <input className="inp" style={{ border: "none", background: "transparent", padding: 0 }}
          placeholder="Buscar por nombre o categoría..."
          value={busquedaBiblioteca}
          onChange={async e => {
            setBusquedaBiblioteca(e.target.value);
            const termino = e.target.value.toLowerCase().trim();
            const query = supabase.from("imagenes_biblioteca").select("*").order("veces_usada", { ascending: false }).limit(30);
            const { data } = termino.length > 0
              ? await query.ilike("nombre", `%${termino}%`)
              : await query;
            setBibliotecaFotos(data || []);
          }}
        />
        {busquedaBiblioteca && <button onClick={() => { setBusquedaBiblioteca(""); }} style={{ border: "none", background: "#e5e7eb", borderRadius: 6, padding: "3px 7px", fontSize: 11, cursor: "pointer", color: "#6B7280" }}>✕</button>}
      </div>

      {/* Cargar fotos al abrir */}
      {bibliotecaFotos.length === 0 && busquedaBiblioteca === "" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <button className="btn" style={{ background: "#eff6ff", color: "#2563EB", padding: "10px 20px", fontSize: 12, border: "1px solid #bfdbfe" }}
            onClick={async () => {
              const { data } = await supabase.from("imagenes_biblioteca").select("*").order("veces_usada", { ascending: false }).limit(30);
              setBibliotecaFotos(data || []);
            }}>
            📂 Cargar fotos disponibles
          </button>
        </div>
      )}

      {/* Grid de fotos */}
      {bibliotecaFotos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxHeight: 360, overflowY: "auto" }}>
          {bibliotecaFotos.map(img => (
            <div key={img.id}
              onClick={async () => {
                // ✅ Usar foto de biblioteca
                setNuevoProducto(p => ({ ...p, foto: img.url, fotoFile: null }));
                // ✅ Incrementar veces_usada
                await supabase.from("imagenes_biblioteca").update({ veces_usada: (img.veces_usada || 1) + 1 }).eq("id", img.id);
                setModalBiblioteca(false);
                setBusquedaBiblioteca("");
                mostrarToast("✅ Foto seleccionada de la biblioteca");
              }}
              style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", border: "2px solid #f1f5f9", aspectRatio: "1/1", background: "#f8fafc", position: "relative" }}>
              <img src={img.url} alt={img.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", padding: "4px 6px" }}>
                <p style={{ fontSize: 9, color: "#fff", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{img.nombre}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {bibliotecaFotos.length === 0 && busquedaBiblioteca.length > 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af" }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>😕</p>
          <p style={{ fontSize: 13, fontWeight: 700 }}>Sin resultados para "{busquedaBiblioteca}"</p>
        </div>
      )}

    </div>
  </div>
)}
    </div>
  );
}

// ─── CATÁLOGO CLIENTE (CORREGIDO CON CLEAN URLS) ───
function CatalogoCliente({
  kiosko,
  onSalir,
  slugCond,
  slugKiosko,
  slugMadre // Este slug viene de tu componente Route (ej: :slugMadre)
}) {
  const navigate = useNavigate(); // 🔥 ¡Aquí estaba el error principal! Faltaba declarar navigate

  const [carrito, setCarrito] = useState({});
  const [categoria, setCategoria] = useState("Todos");
  const [nombreCliente, setNombreCliente] = useState("");
  const [verCarrito, setVerCarrito] = useState(false);
  const [tipoEntrega, setTipoEntrega] = useState("delivery");
  const [medioPago, setMedioPago] = useState("efectivo");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [catMadres, setCatMadres] = useState([]);
  const [madreActiva, setMadreActiva] = useState(null);
  const [sugerencias, setSugerencias] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cargandoMadres, setCargandoMadres] = useState(true);

  // 🎯 Sincroniza la Categoría Madre cuando cambia la URL gracias al botón atrás
  useEffect(() => {
    if (slugMadre) {
      setMadreActiva(decodeURIComponent(slugMadre));
    } else {
      setMadreActiva(null);
    }
    // 💡 Reseteamos la subcategoría interna a "Todos" cada vez que se cambia de sección madre
    setCategoria("Todos"); 
  }, [slugMadre]);

  // Carga inicial de categorías madre desde Supabase
  useEffect(() => {
    supabase.from("categorias_madre").select("*").eq("kiosko_id", kiosko.id).order("orden")
      .then(({ data }) => {
        const madres = data || [];
        setCatMadres(madres);
        if (madres.length === 0) setMadreActiva("sin_madre");
        setCargandoMadres(false);
      });
  }, [kiosko.id]);

  // Debounce para el buscador de productos
  useEffect(() => {
    const termino = busqueda.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (termino.length === 0) { setSugerencias([]); return; }
    const timeout = setTimeout(() => {
      const resultados = kiosko.productos.filter(p => {
        const nombre = p.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return p.stock && nombre.includes(termino);
      });
      setSugerencias(resultados);
    }, 300);
    return () => clearTimeout(timeout);
  }, [busqueda, kiosko.productos]);

// ==========================================
  // ✅ CONTROL DEL BOTÓN ATRÁS (REPARADO PARA LINK DIRECTO)
  // ==========================================
  useEffect(() => {
    // Si es link directo, marcamos el inicio en el historial para tener soporte atrás
    if (!slugCond && !slugKiosko && !madreActiva) {
      window.history.replaceState({ inicio: true }, "");
    }

    const necesitaHistorial = 
      mostrarResultados || 
      productoSeleccionado || 
      (!slugCond && !slugKiosko && madreActiva && madreActiva !== "sin_madre");

    if (necesitaHistorial) {
      const muevoEstado = {
        producto: !!productoSeleccionado,
        busqueda: mostrarResultados,
        madre: madreActiva
      };
      window.history.pushState(muevoEstado, "");
    }
  }, [mostrarResultados, productoSeleccionado, madreActiva, slugCond, slugKiosko]);

  useEffect(() => {
    const onBack = (e) => {
      if (productoSeleccionado) {
        setProductoSeleccionado(null);
        return;
      }
      if (mostrarResultados) {
        setMostrarResultados(false);
        setBusqueda("");
        setSugerencias([]);
        return;
      }
      if (!slugCond && !slugKiosko && madreActiva && madreActiva !== "sin_madre") {
        setMadreActiva(null);
        setCategoria("Todos");
        
        // El seguro: le devolvemos una entrada al historial para que el siguiente "atrás" recién lo saque
        window.history.pushState({ inicio: true }, "");
        return;
      }
    };

    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [mostrarResultados, productoSeleccionado, madreActiva, slugCond, slugKiosko]);

  // ==========================================
  // 🚀 NUEVAS FUNCIONES DE NAVEGACIÓN
  // ==========================================
  const entrarMadre = (n) => {
    setBusqueda("");
    setMostrarResultados(false);
    if (slugCond && slugKiosko) {
      navigate(`/c/${slugCond}/${slugKiosko}/${encodeURIComponent(n)}`);
    } else {
      setMadreActiva(n);
      setCategoria("Todos");
    }
  };

  const volverInicio = () => {
    setBusqueda("");
    setMostrarResultados(false);
    if (slugCond && slugKiosko) {
      navigate(`/c/${slugCond}/${slugKiosko}`);
    } else {
      setMadreActiva(null);
      setCategoria("Todos");
    }
  };
  

  const agregar = (p, variacion) => {
    const key = variacion ? `${p.id}-${variacion.nombre}` : `${p.id}-unica`;
    setCarrito(prev => {
      const existente = prev[key];
      if (existente) return { ...prev, [key]: { ...existente, cantidad: existente.cantidad + 1 } };
      return { ...prev, [key]: { id: p.id, nombre: variacion ? `${p.nombre} (${variacion.nombre})` : p.nombre, precio: variacion ? Number(variacion.precio) : Number(p.precio), cantidad: 1, variacionObj: variacion } };
    });
  };

  const quitar = (key) => {
    setCarrito(prev => {
      const nuevo = { ...prev };
      if (nuevo[key].cantidad > 1) nuevo[key] = { ...nuevo[key], cantidad: nuevo[key].cantidad - 1 };
      else delete nuevo[key];
      return nuevo;
    });
  };

  const listaCarrito = Object.entries(carrito);
  const totalPrecio = listaCarrito.reduce((s, [_, item]) => s + (item.precio * item.cantidad), 0);
  const totalItems = listaCarrito.reduce((s, [_, item]) => s + item.cantidad, 0);

  const enviarPedido = async () => {
    if (listaCarrito.length === 0) return;
    if (!nombreCliente.trim()) return alert("Por favor escribe tu nombre");
    if (tipoEntrega === "delivery" && !direccion.trim()) return alert("Ingresa tu dirección de delivery");
    const lineas = listaCarrito.map(([_, item]) => `• ${item.nombre} x${item.cantidad} — S/. ${(item.precio * item.cantidad).toFixed(2)}`).join("\n");
    const entregaTexto = tipoEntrega === "delivery" ? `Delivery — ${direccion}` : "Recojo en tienda";
    let pagoTexto = "";
    if (medioPago === "efectivo") { pagoTexto = "Efectivo"; }
    else if (medioPago === "yape") { const d = kiosko.datos_pago || {}; pagoTexto = `Yape/Plin${d.yape_numero ? ` al ${d.yape_numero}` : ""}${d.yape_nombre ? ` (${d.yape_nombre})` : ""}`; }
    else if (medioPago === "transferencia") { const d = kiosko.datos_pago || {}; pagoTexto = `Transferencia${d.banco ? ` — ${d.banco}` : ""}${d.cuenta ? ` | Cta: ${d.cuenta}` : ""}${d.cci ? ` | CCI: ${d.cci}` : ""}${d.cuenta_nombre ? ` | A nombre de: ${d.cuenta_nombre}` : ""}`; }
    const msg = encodeURIComponent(`*Nuevo Pedido*\n\n${lineas}\n\n*Total: S/. ${totalPrecio.toFixed(2)}*\n*Cliente:* ${nombreCliente}\n*Entrega:* ${entregaTexto}\n*Pago:* ${pagoTexto}${nota ? `\n*Nota:* ${nota}` : ""}`);
    await supabase.from("pedidos").insert([{ kiosko_id: kiosko.id, nombre_cliente: nombreCliente, detalle: lineas, total: totalPrecio }]);
    window.open(`https://wa.me/51${kiosko.whatsapp}?text=${msg}`, "_blank");
    // ✅ Limpiar todo y volver a inicio
    setCarrito({});
    setVerCarrito(false);
    setNombreCliente("");
    setDireccion("");
    setNota("");
    setMedioPago("efectivo");
    setTipoEntrega("delivery");
    // ✅ Volver a pantalla principal (categorías madre)
    setMadreActiva(null);
    setBusqueda("");
    setCategoria("Todos");
    // ✅ Si vino del condominio → volver al condominio
    if (onSalir) {
      setTimeout(() => onSalir(), 300);
    }
  };

  const productosFiltradosPorMadre = (madreActiva && madreActiva !== "sin_madre")
    ? kiosko.productos.filter(p => p.madre === madreActiva)
    : kiosko.productos;

  const categoriasDeMadre = ["Todos", ...new Set(productosFiltradosPorMadre.map(p => p.categoria).filter(Boolean))];
  const productosFiltrados = productosFiltradosPorMadre
    .filter(p => {
      if (categoria === "__ofertas__") return p.oferta;
      return categoria === "Todos" || p.categoria === categoria;
    })
    .filter(p => busqueda === "" || p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const ProductoCard = ({ p }) => {
    const [varSel, setVarSel] = useState(p.variaciones?.length > 0 ? p.variaciones[0] : null);
    const [modalFoto, setModalFoto] = useState(false);
    const [fotoActiva, setFotoActiva] = useState(0);
    const [colorSel, setColorSel] = useState(null);
    const [cantidadModal, setCantidadModal] = useState(1);
    const precioDisplay = varSel ? Number(varSel.precio) : Number(p.precio);
    const todasFotos = [p.foto, ...(p.fotos || [])].filter(Boolean);
    const colores = p.colores || [];
    const esPremium = kiosko.plan === "Premium";

    const carritoKey = () => {
      const base = varSel ? `${p.id}-${varSel.nombre}` : `${p.id}-unica`;
      return colorSel ? `${base}-${colorSel}` : base;
    };

    const agregarDesdeModal = () => {
      const key = carritoKey();
      const nombreCompleto = [p.nombre, varSel ? `Talla: ${varSel.nombre}` : null, colorSel ? `Color: ${colorSel}` : null].filter(Boolean).join(" · ");
      setCarrito(prev => {
        const existente = prev[key];
        return { ...prev, [key]: { id: p.id, nombre: nombreCompleto, precio: varSel ? Number(varSel.precio) : Number(p.precio), cantidad: (existente?.cantidad || 0) + cantidadModal, variacionObj: varSel } };
      });
      setModalFoto(false);
      setCantidadModal(1);
    };

    const consultarWhatsApp = () => {
      const detalle = [
        `Producto: ${p.nombre}`,
        varSel ? `Talla: ${varSel.nombre}` : null,
        colorSel ? `Color: ${colorSel}` : null,
        `Precio: S/. ${precioDisplay.toFixed(2)}`
      ].filter(Boolean).join("\n");
      const msg = encodeURIComponent(`Hola! Me interesa este producto 👇\n\n${detalle}\n\n¿Tienen disponible?`);
      window.open(`https://wa.me/51${kiosko.whatsapp}?text=${msg}`, "_blank");
    };

    const puedeAgregar = () => {
      if (p.variaciones?.length > 0 && !varSel) return false;
      if (colores.length > 0 && !colorSel) return false;
      return true;
    };

    return (
      <>
        {modalFoto && esPremium && todasFotos.length > 0 && (
          <div onClick={() => setModalFoto(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: "#111827" }}>{p.nombre}</p>
                <button onClick={() => setModalFoto(false)}
                  style={{ background: "#F8FAFC", border: "none", borderRadius: "50%", width: 30, height: 30, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                <div style={{ position: "relative", background: "#F8FAFC" }}>
                  <img src={todasFotos[fotoActiva]} alt={p.nombre} style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", display: "block" }} />
                  {todasFotos.length > 1 && (
                    <>
                      <button onClick={() => setFotoActiva(i => (i - 1 + todasFotos.length) % todasFotos.length)}
                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>‹</button>
                      <button onClick={() => setFotoActiva(i => (i + 1) % todasFotos.length)}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>›</button>
                      <div style={{ position: "absolute", bottom: 10, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }}>
                        {fotoActiva + 1}/{todasFotos.length}
                      </div>
                    </>
                  )}
                </div>

                {todasFotos.length > 1 && (
                  <div style={{ display: "flex", gap: 8, padding: "10px 14px", overflowX: "auto", borderBottom: "1px solid #E5E7EB" }}>
                    {todasFotos.map((url, idx) => (
                      <img key={idx} src={url} alt={`foto ${idx + 1}`} onClick={() => setFotoActiva(idx)}
                        style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, flexShrink: 0, cursor: "pointer",
                          border: fotoActiva === idx ? "2.5px solid #2563EB" : "2px solid #E5E7EB",
                          opacity: fotoActiva === idx ? 1 : 0.65, transition: "all 0.15s" }} />
                    ))}
                  </div>
                )}

                {p.descripcion && (
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB" }}>
                    <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Descripción</p>
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{p.descripcion}</p>
                  </div>
                )}

                {p.variaciones?.length > 0 && (
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB" }}>
                    <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Talla</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {p.variaciones.map((v, i) => (
                        <button key={i} onClick={() => setVarSel(v)}
                          style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 13,
                            background: varSel?.nombre === v.nombre ? "#2563EB" : "#F8FAFC",
                            color: varSel?.nombre === v.nombre ? "#fff" : "#374151",
                            boxShadow: varSel?.nombre === v.nombre ? "0 2px 8px rgba(37,99,235,0.3)" : "none" }}>
                          {v.nombre}
                          {v.precio !== Number(p.precio) && <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 4 }}>S/{v.precio}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {colores.length > 0 && (
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB" }}>
                    <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Color</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {colores.map((color, i) => (
                        <button key={i} onClick={() => setColorSel(color)}
                          style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 13,
                            background: colorSel === color ? "#2563EB" : "#F8FAFC",
                            color: colorSel === color ? "#fff" : "#374151",
                            boxShadow: colorSel === color ? "0 2px 8px rgba(37,99,235,0.3)" : "none" }}>
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ padding: "10px 16px", borderBottom: "1px solid #E5E7EB" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 900, color: "#2563EB", fontSize: 18 }}>
                      S/. {(precioDisplay * cantidadModal).toFixed(2)}
                      {cantidadModal > 1 && <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginLeft: 4 }}>({cantidadModal} x S/.{precioDisplay.toFixed(2)})</span>}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#eff6ff", borderRadius: 8, padding: "4px 8px", border: "1px solid #bfdbfe" }}>
                      <button onClick={() => setCantidadModal(q => Math.max(1, q - 1))}
                        style={{ width: 24, height: 24, border: "none", background: "#2563EB", color: "#fff", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <span style={{ fontWeight: 900, fontSize: 13, color: "#2563EB", minWidth: 20, textAlign: "center" }}>{cantidadModal}</span>
                      <button onClick={() => setCantidadModal(q => q + 1)}
                        style={{ width: 24, height: 24, border: "none", background: "#2563EB", color: "#fff", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    </div>
                  </div>
                  {!puedeAgregar() && (
                    <p style={{ fontSize: 11, color: "#2563EB", marginTop: 8, fontWeight: 600 }}>
                      ⚠️ {p.variaciones?.length > 0 && !varSel ? "Elige una talla" : ""}
                      {colores.length > 0 && !colorSel ? (p.variaciones?.length > 0 && !varSel ? " y un color" : "Elige un color") : ""}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ padding: "10px 14px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8, flexShrink: 0, background: "#fff" }}>
                <button onClick={consultarWhatsApp}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "#f0fdf4", color: "#059669", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "10px", fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  💬 Consultar
                </button>
                <button onClick={agregarDesdeModal} disabled={!puedeAgregar()}
                  style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: puedeAgregar() ? "#2563EB" : "#e5e7eb", color: puedeAgregar() ? "#fff" : "#9ca3af", border: "none", borderRadius: 10, padding: "10px", fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 13, cursor: puedeAgregar() ? "pointer" : "not-allowed", boxShadow: puedeAgregar() ? "0 4px 12px rgba(37,99,235,0.3)" : "none" }}>
                  🛒 Agregar al carrito
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="prod-card" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ position: "relative" }}>
            {p.oferta && <span style={{ position: "absolute", top: 8, left: 8, background: "#10B981", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, zIndex: 1 }}>🔥 Oferta</span>}
            {esPremium && todasFotos.length > 0 && (
              <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, zIndex: 1 }}>🔍 {todasFotos.length}</span>
            )}
            <div onClick={() => { if (esPremium && todasFotos.length > 0) { setFotoActiva(0); setColorSel(null); setCantidadModal(1); setModalFoto(true); } }}
              style={{ width: "100%", aspectRatio: "1/1", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "hidden", cursor: esPremium && todasFotos.length > 0 ? "pointer" : "default" }}>
              {p.foto ? <img src={p.foto} style={{ width: "100%", objectFit: "contain", display: "block" }} /> : <span style={{ fontSize: "40px", opacity: 0.6, marginTop: 20 }}>{p.emoji || "📦"}</span>}
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <p style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>{p.nombre}</p>
            {p.variaciones?.length > 0 && (
              <div style={{ display: "flex", gap: 5, margin: "8px 0", flexWrap: "wrap" }}>
                {p.variaciones.map((v, i) => (
                  <button key={i} onClick={() => setVarSel(v)}
                    style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: varSel?.nombre === v.nombre ? "#2563EB" : "#f3f4f6", color: varSel?.nombre === v.nombre ? "#fff" : "#374151" }}>
                    {v.nombre}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <div style={{ marginBottom: 2 }}>
  {p.precio_original && p.precio_original > precioDisplay && (
    <span style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through", display: "block", lineHeight: 1 }}>
      S/. {Number(p.precio_original).toFixed(2)}
    </span>
  )}
  <span style={{ fontWeight: 900, color: "#1d4ed8", fontSize: 15 }}>
    S/. {precioDisplay.toFixed(2)}
    {p.precio_original && p.precio_original > precioDisplay && (
      <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#dcfce7", padding: "1px 6px", borderRadius: 999, marginLeft: 6 }}>
        -{Math.round((1 - precioDisplay / p.precio_original) * 100)}%
      </span>
    )}
  </span>
</div>
              {(() => {
                const key = varSel ? `${p.id}-${varSel.nombre}` : `${p.id}-unica`;
                const cantidad = carrito[key]?.cantidad || 0;
                return cantidad === 0 ? (
                  <button onClick={() => agregar(p, varSel)} style={{ width: "100%", marginTop: 8, background: "#fff", color: "#2563EB", border: "1.5px solid #2563EB", padding: "7px", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>🛒 Agregar</button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, background: "#fff", border: "1.5px solid #2563EB", borderRadius: 8, padding: "3px" }}>
  <button onClick={() => quitar(key)} style={{ width: 24, height: 24, border: "none", background: "#eff6ff", color: "#2563EB", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 13 }}>−</button>
  <span style={{ fontWeight: 900, fontSize: 13, color: "#2563EB" }}>{cantidad}</span>
  <button onClick={() => agregar(p, varSel)} style={{ width: 24, height: 24, border: "none", background: "#eff6ff", color: "#2563EB", borderRadius: 6, fontWeight: 900, cursor: "pointer", fontSize: 13 }}>+</button>
</div>
                );
              })()}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "Nunito, sans-serif", overflowX: "hidden", width: "100%", maxWidth: "100vw" }}>
      <style>{`
        @media (min-width: 600px) { .productos-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important; } }
        * { box-sizing: border-box; }
        html, body, #root { overflow-x: hidden !important; max-width: 100vw; }
      `}</style>

      {/* HEADER AZUL */}
      <div style={{ background: "#fff", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", borderRadius: "0 0 20px 20px" }}>
  {/* FILA 1 — Logo + botones + Carrito */}
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 6px" }}>
  {/* Izquierda — botones volver */}
  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
    {onSalir && (
      <button onClick={onSalir} style={{ background: "#f1f5f9", border: "none", color: "#374151", width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
    )}
    {madreActiva && madreActiva !== "sin_madre" && (
      <button onClick={volverInicio} style={{ background: "#f1f5f9", border: "none", color: "#374151", width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
    )}
    <img src="/logo.png" style={{ height: 26, objectFit: "contain" }} alt="KiKiosko" />
  </div>

  {/* Derecha — Carrito */}
  <button onClick={() => totalItems > 0 && setVerCarrito(true)}
    style={{ position: "relative", background: "#eff6ff", border: "none", color: "#2563EB", width: 38, height: 38, borderRadius: 10, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    🛒
    {totalItems > 0 && (
      <span style={{ position: "absolute", top: -4, right: -4, background: "#F59E0B", color: "#fff", fontSize: 10, fontWeight: 900, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{totalItems}</span>
    )}
  </button>
</div>

{/* FILA 2 — Nombre tienda completo */}
<div style={{ padding: "0 14px 8px", textAlign: "center" }}>
  <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1.3 }}>{kiosko.nombre}</p>
  {kiosko.info_tienda?.descripcion && (
    <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontWeight: 600, marginTop: 2 }}>{kiosko.info_tienda.descripcion}</p>
  )}
</div>

  {/* FILA 2 — Buscador con dropdown */}
<div style={{ padding: "0 14px 12px", position: "relative" }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8, background: busqueda ? "#eff6ff" : "#f8fafc", border: busqueda ? "2px solid #2563EB" : "1.5px solid #e5e7eb", borderRadius: busqueda && sugerencias.length > 0 && !mostrarResultados ? "12px 12px 0 0" : 999, padding: "8px 14px", transition: "all 0.2s" }}>
    <span style={{ fontSize: 14, flexShrink: 0 }}>🔍</span>
    <input
      style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", flex: 1, minWidth: 0, color: "#111827", fontFamily: "Nunito, sans-serif", fontWeight: busqueda ? 700 : 400 }}
      placeholder="Buscar productos..."
      value={busqueda}
      onChange={e => {
        setBusqueda(e.target.value);
        setMostrarResultados(false);
        if (e.target.value.trim() && madreActiva === null) {
          setMadreActiva("sin_madre");
        }
      }}
      onKeyDown={e => { if (e.key === "Enter") setMostrarResultados(true); }}
    />
    {busqueda && (
      <button onClick={() => { setBusqueda(""); setSugerencias([]); setMostrarResultados(false); setProductoSeleccionado(null); }}
        style={{ border: "none", background: "#e5e7eb", borderRadius: 6, padding: "3px 7px", fontSize: 11, cursor: "pointer", color: "#6B7280", flexShrink: 0 }}>✕</button>
    )}
  </div>

  {/* DROPDOWN SUGERENCIAS */}
  {busqueda.trim() && !mostrarResultados && sugerencias.length > 0 && (
    <div style={{ position: "absolute", left: 14, right: 14, background: "#fff", borderRadius: "0 0 14px 14px", border: "2px solid #2563EB", borderTop: "none", overflow: "hidden", boxShadow: "0 12px 24px rgba(0,0,0,0.12)", zIndex: 50 }}>
      {sugerencias.slice(0, 5).map((prod, idx) => (
        <div key={prod.id}
          onClick={() => { setProductoSeleccionado(prod); setMostrarResultados(true); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", background: "#fff" }}
          onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
          onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
          <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, background: "#f8fafc", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {prod.foto ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18 }}>{prod.emoji || "📦"}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prod.nombre}</p>
            <p style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, margin: 0 }}>{prod.categoria}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#2563EB", flexShrink: 0 }}>S/. {Number(prod.precio).toFixed(2)}</span>
        </div>
      ))}
      <div onClick={() => { setMostrarResultados(true); setProductoSeleccionado(null); }}
        style={{ padding: "10px 13px", textAlign: "center", background: "#f8fafc", cursor: "pointer", borderTop: "1px solid #f1f5f9" }}>
        <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 800 }}>
          🔍 Ver todos los resultados ({sugerencias.length}) →
        </span>
      </div>
    </div>
  )}

  {/* Sin resultados */}
  {busqueda.trim().length >= 2 && !mostrarResultados && sugerencias.length === 0 && (
    <div style={{ position: "absolute", left: 14, right: 14, background: "#fff", borderRadius: "0 0 12px 12px", border: "2px solid #2563EB", borderTop: "none", padding: "14px 13px", zIndex: 50, textAlign: "center" }}>
      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>😕 Sin resultados para "{busqueda}"</span>
    </div>
  )}
</div>
</div>

{/* ✅ PRODUCTO SELECCIONADO — muestra como card normal */}
{mostrarResultados && productoSeleccionado && (
  <div style={{ padding: "10px 10px 100px" }}>
    <button onClick={() => { 
  setProductoSeleccionado(null); 
  setMostrarResultados(false); 
  setBusqueda(""); 
  setSugerencias([]);
  setMadreActiva(null);
}}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
      ← Volver al buscador
    </button>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      <ProductoCard key={productoSeleccionado.id} p={productoSeleccionado} />
    </div>
  </div>
)}

{/* ✅ LISTA COMPLETA DE RESULTADOS */}
{mostrarResultados && !productoSeleccionado && busqueda.trim() && (
  <div style={{ padding: "14px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>📦 Resultados</span>
        <span style={{ background: "#eff6ff", color: "#2563EB", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>{sugerencias.length}</span>
      </div>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>"{busqueda}"</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sugerencias.map(prod => (
        <div key={prod.id}
          onClick={() => setProductoSeleccionado(prod)}
          style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", border: "1px solid #f1f5f9", cursor: "pointer" }}>
          <div style={{ width: 72, height: 72, flexShrink: 0, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {prod.foto ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32 }}>{prod.emoji || "📦"}</span>}
          </div>
          <div style={{ flex: 1, padding: "10px 12px" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 3px" }}>{prod.nombre}</p>
            <p style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, margin: "0 0 4px" }}>{prod.categoria}</p>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#2563EB" }}>S/. {Number(prod.precio).toFixed(2)}</span>
          </div>
          <div style={{ padding: "0 12px", fontSize: 18, color: "#9ca3af" }}>›</div>
        </div>
      ))}
    </div>
  </div>
)}

      {!cargandoMadres && madreActiva === null ? (
        <div>

    {/* BANNER PROMOCIONAL */}
    {kiosko.banner && kiosko.plan !== "Básico" && (
  <div style={{ padding: "8px 6px 0" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
          <img src={kiosko.banner} alt="banner" style={{ width: "100%", aspectRatio: "16/7", objectFit: "cover", display: "block" }} />
        </div>
      </div>
    )}

{/* ✅ SECCIÓN OFERTAS DEL KIOSKO */}
{kiosko.productos.filter(p => p.oferta && p.stock).length > 0 && (
  <div style={{ background: "#fff", padding: "0 14px 16px", marginTop: 12 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ background: "#fef2f2", borderRadius: 8, padding: "3px 7px", fontSize: 14 }}>🔥</div>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>Ofertas de hoy</span>
        <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>
          {kiosko.productos.filter(p => p.oferta && p.stock).length} productos
        </span>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
      {kiosko.productos.filter(p => p.oferta && p.stock).map((prod, idx) => (
        <div key={prod.id}
          onClick={() => entrarMadre(prod.madre || "sin_madre")}
          style={{ flexShrink: 0, width: 110, background: "#fff", borderRadius: 14, overflow: "hidden", border: "1.5px solid #fee2e2", boxShadow: "0 2px 8px rgba(220,38,38,0.08)", cursor: "pointer" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "1/0.9", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {prod.foto
              ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 36 }}>{prod.emoji || "🏷️"}</span>
            }
            <div style={{ position: "absolute", top: 6, left: 6, background: "#dc2626", color: "#fff", fontSize: 8, fontWeight: 900, padding: "2px 5px", borderRadius: 999 }}>
              {prod.precio_original && prod.precio_original > prod.precio
                ? `-${Math.round((1 - prod.precio / prod.precio_original) * 100)}%`
                : "🔥 OFERTA"
              }
            </div>
          </div>
          <div style={{ padding: "6px 7px 8px" }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#111827", margin: "0 0 3px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.nombre}</p>
            {prod.precio_original && prod.precio_original > prod.precio && (
              <span style={{ fontSize: 9, color: "#9ca3af", textDecoration: "line-through", display: "block" }}>
                S/. {Number(prod.precio_original).toFixed(2)}
              </span>
            )}
            <p style={{ fontSize: 12, fontWeight: 900, color: "#dc2626", margin: "0" }}>
              S/. {Number(prod.precio).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

    {/* FILA DE BENEFICIOS */}
    <div style={{ margin: "8px 14px", background: "#fff", borderRadius: 14, border: "1px solid #f1f5f9", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", overflow: "hidden" }}>
      
      {/* Delivery */}
      <div style={{ flex: 1, padding: "10px 8px", textAlign: "center", borderRight: "1px solid #f1f5f9" }}>
        <div style={{ width: 32, height: 32, background: "#dbeafe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px", fontSize: 16 }}>🛵</div>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#111827", margin: 0 }}>Delivery</p>
        <p style={{ fontSize: 9, color: kiosko.info_tienda?.delivery === "si" ? "#059669" : "#9ca3af", fontWeight: 700, margin: "2px 0 0" }}>
          {kiosko.info_tienda?.delivery === "si" ? kiosko.info_tienda?.delivery_tiempo || "Disponible" : "No disponible"}
        </p>
      </div>

      {/* Pagos */}
      <div style={{ flex: 1, padding: "10px 8px", textAlign: "center", borderRight: "1px solid #f1f5f9" }}>
        <div style={{ width: 32, height: 32, background: "#dcfce7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px", fontSize: 16 }}>📱</div>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#111827", margin: 0 }}>Pagos</p>
        <p style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, margin: "2px 0 0" }}>
          {kiosko.datos_pago?.yape_numero ? "Yape / Plin" : "Efectivo"}
          {kiosko.datos_pago?.banco ? " · Banco" : ""}
        </p>
      </div>

      {/* Productos */}
      <div style={{ flex: 1, padding: "10px 8px", textAlign: "center" }}>
        <div style={{ width: 32, height: 32, background: "#fef9c3", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px", fontSize: 16 }}>✅</div>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#111827", margin: 0 }}>Productos</p>
        <p style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, margin: "2px 0 0" }}>
          {kiosko.productos.filter(p => p.stock).length} disponibles
        </p>
      </div>

    </div>

    {/* TÍTULO CATEGORÍAS */}
    <div style={{ padding: "4px 14px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <span style={{ fontSize: 14 }}>✨</span>
      <p style={{ fontSize: 14, fontWeight: 900, color: "#111827", margin: 0 }}>Explora nuestras categorías</p>
      <span style={{ fontSize: 14 }}>✨</span>
    </div>

    {/* GRID CATEGORÍAS MADRE */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, padding: "0 14px 14px" }}>
      {catMadres.map(madre => (
        <button key={madre.id} onClick={() => entrarMadre(madre.nombre)}
          style={{ background: "#fff", borderRadius: 18, overflow: "hidden", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: 0, textAlign: "left" }}>
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {madre.imagen_url
              ? <img src={madre.imagen_url} alt={madre.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 48 }}>🗂</span>
            }
          </div>
          <div style={{ padding: "10px 14px 12px" }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#111827", margin: 0 }}>{madre.nombre}</p>
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{kiosko.productos.filter(p => p.madre === madre.nombre).length} productos</p>
          </div>
        </button>
      ))}
    </div>

  </div>
      ) : null}

{!mostrarResultados && madreActiva !== null && (
  <>
          {kiosko.banner && kiosko.plan !== "Básico" && (
  <div style={{ padding: "8px 6px 0" }}>
    <div style={{ borderRadius: 20, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", position: "relative" }}>
      <img src={kiosko.banner} alt="banner" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
      {/* OVERLAY con horario y dirección */}
      {(kiosko.info_tienda?.horario || kiosko.info_tienda?.direccion || kiosko.info_tienda?.delivery === "si") && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.65) 100%)", padding: "20px 14px 12px", display: "flex", gap: 12, flexWrap: "wrap" }}>
          {kiosko.info_tienda?.horario && (
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>🕐 {kiosko.info_tienda.horario}</span>
          )}
          {kiosko.info_tienda?.direccion && (
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>📍 {kiosko.info_tienda.direccion}</span>
          )}
          {kiosko.info_tienda?.delivery === "si" && (
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>🛵 {kiosko.info_tienda?.delivery_tiempo || "Delivery disponible"}</span>
          )}
        </div>
      )}
    </div>
  </div>
)}

          <div style={{ display: "flex", gap: 8, padding: "10px 12px", overflowX: "auto", overflowY: "hidden", background: "#f9fafb", width: "100%", maxWidth: "100vw", boxSizing: "border-box" }}>
  
  <button onClick={() => setCategoria("__ofertas__")}
    style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13,
      background: categoria === "__ofertas__" ? "#dc2626" : "#fff",
      color: categoria === "__ofertas__" ? "#fff" : "#dc2626",
      border: categoria === "__ofertas__" ? "none" : "1.5px solid #fecaca",
      boxShadow: categoria === "__ofertas__" ? "0 2px 8px rgba(220,38,38,0.3)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
    🏷️ Ofertas
  </button>

  {categoriasDeMadre.map(cat => (
    <button key={cat} onClick={() => setCategoria(cat)}
      style={{ flexShrink: 0, padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13,
        background: categoria === cat ? "#1D4ED8" : "#fff",
        color: categoria === cat ? "#fff" : "#374151",
        boxShadow: categoria === cat ? "0 2px 8px rgba(37,99,235,0.3)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
      {cat}
    </button>
  ))}
</div>

          <div className="productos-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, padding: "10px 10px 100px", width: "100%", maxWidth: "100vw", boxSizing: "border-box" }}>
            {productosFiltrados.length === 0
              ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>Sin productos encontrados</div>
              : productosFiltrados.map(p => <ProductoCard key={p.id} p={p} />)
            }
          </div>
        </>
      )}

      {totalItems > 0 && (
        <button onClick={() => setVerCarrito(true)}
          style={{ position: "fixed", bottom: 16, left: 16, right: 16, background: "#1D4ED8", color: "#fff", padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, boxShadow: "0 4px 12px rgba(37,99,235,0.35)", zIndex: 50 }}>
          <span>🛒 Pedido ({totalItems})</span>
          <span>S/. {totalPrecio.toFixed(2)}</span>
        </button>
      )}

      {verCarrito && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
          <div style={{ background: "#fff", width: "100%", borderTopLeftRadius: 25, borderTopRightRadius: 25, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid #E5E7EB" }}>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: 20 }}>🛒 Tu pedido</h3>
              <button onClick={() => setVerCarrito(false)} style={{ border: "none", background: "#F8FAFC", width: 35, height: 35, borderRadius: "50%", fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
                {listaCarrito.map(([key, item]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #E5E7EB" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{item.nombre}</p>
                      <p style={{ margin: 0, color: "#1D4ED8", fontSize: 13, fontWeight: 700 }}>S/. {(item.precio * item.cantidad).toFixed(2)}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => quitar(key)} style={{ border: "1.5px solid #E5E7EB", background: "#F8FAFC", width: 30, height: 30, borderRadius: 8, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>−</button>
                      <span style={{ fontWeight: 900, minWidth: 20, textAlign: "center" }}>{item.cantidad}</span>
                      <button onClick={() => agregar({ id: item.id, nombre: item.nombre.split(' (')[0] }, item.variacionObj)} style={{ border: "none", background: "#1D4ED8", color: "#fff", width: 30, height: 30, borderRadius: 8, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>Subtotal</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>S/. {totalPrecio.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🚚</span>
                  <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Tipo de entrega</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 20 }}>Obligatorio</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[{ id: "delivery", label: "🚚 Delivery" }, { id: "tienda", label: "🏪 Recojo en tienda" }].map(opt => (
                    <button key={opt.id} onClick={() => setTipoEntrega(opt.id)}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${tipoEntrega === opt.id ? "#1D4ED8" : "#E5E7EB"}`, background: tipoEntrega === opt.id ? "#eff6ff" : "#F8FAFC", fontWeight: 600, fontSize: 13, cursor: "pointer", color: tipoEntrega === opt.id ? "#1D4ED8" : "#6B7280" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {tipoEntrega === "delivery" && (
                  <div style={{ display: "flex", alignItems: "center", marginTop: 10, border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "10px 14px", gap: 8, background: "#F8FAFC" }}>
                    <span>📍</span>
                    <input style={{ border: "none", outline: "none", fontSize: 14, background: "transparent", flex: 1 }}
                      placeholder="Ingresa tu dirección" value={direccion} onChange={e => setDireccion(e.target.value)} />
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>💳</span>
                  <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Medio de pago</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 20 }}>Obligatorio</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  {[{ id: "efectivo", label: "Efectivo", icon: "💵" }, { id: "yape", label: "Yape / Plin", icon: "📱" }, { id: "transferencia", label: "Transferencia", icon: "🏦" }].map(op => (
                    <button key={op.id} onClick={() => setMedioPago(op.id)}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 4px", borderRadius: 12, border: `1.5px solid ${medioPago === op.id ? "#1D4ED8" : "#E5E7EB"}`, background: medioPago === op.id ? "#eff6ff" : "#F8FAFC", cursor: "pointer" }}>
                      <span style={{ fontSize: 22, marginBottom: 4 }}>{op.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>{op.label}</span>
                    </button>
                  ))}
                </div>
                {medioPago === "yape" && kiosko.datos_pago?.yape_numero && (
                  <div style={{ background: "#fdf4ff", border: "1.5px solid #e9d5ff", borderRadius: 12, padding: "12px 14px" }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 6 }}>📱 Datos para Yape / Plin</p>
                    <p style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>📞 {kiosko.datos_pago.yape_numero}</p>
                    {kiosko.datos_pago.yape_nombre && <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>👤 {kiosko.datos_pago.yape_nombre}</p>}
                  </div>
                )}
                {medioPago === "transferencia" && (kiosko.datos_pago?.banco || kiosko.datos_pago?.cuenta) && (
                  <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "12px 14px" }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", marginBottom: 8 }}>🏦 Datos para transferencia</p>
                    {kiosko.datos_pago.banco && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 12, color: "#6B7280" }}>Banco</span><span style={{ fontSize: 13, fontWeight: 800 }}>{kiosko.datos_pago.banco}</span></div>}
                    {kiosko.datos_pago.cuenta && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 12, color: "#6B7280" }}>Cuenta</span><span style={{ fontSize: 13, fontWeight: 800 }}>{kiosko.datos_pago.cuenta}</span></div>}
                    {kiosko.datos_pago.cci && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 12, color: "#6B7280" }}>CCI</span><span style={{ fontSize: 13, fontWeight: 800 }}>{kiosko.datos_pago.cci}</span></div>}
                    {kiosko.datos_pago.cuenta_nombre && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "#6B7280" }}>A nombre de</span><span style={{ fontSize: 13, fontWeight: 800 }}>{kiosko.datos_pago.cuenta_nombre}</span></div>}
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
                <textarea style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", fontSize: 13, background: "#F8FAFC", resize: "none", outline: "none", fontFamily: "inherit" }}
                  placeholder={"¿Alguna indicación? (opcional)\nEj: sin cebolla, entregar en puerta"}
                  rows={3} value={nota} onChange={e => setNota(e.target.value)} />
              </div>

              <div style={{ padding: "14px 20px" }}>
                <input style={{ width: "100%", padding: 14, borderRadius: 12, border: "1.5px solid #e5e7eb", boxSizing: "border-box", outline: "none", fontSize: 14, background: "#f9fafb" }}
                  placeholder="Escribe tu nombre aquí..." value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 20px", borderTop: "1px solid #E5E7EB", background: "#fff" }}>
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Total a pagar</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>S/. {totalPrecio.toFixed(2)}</div>
              </div>
              <button onClick={enviarPedido}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                📲 Enviar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONDOMINIO PÚBLICO ───
function CondominioPublico({ condominio, rubros, kioskos, productosDestacados, productosOferta, rubroActivo, setRubroActivo, kioskoDirecto, onKioskoDirectoVisto }) {
  // 🚀 Declaramos el hook de navegación nativo de React Router
  const navigate = useNavigate(); 
  
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [verTodosRubros, setVerTodosRubros] = useState(false);

  // ✅ Si viene con kiosko directo desde la URL, cambiamos la ruta limpiamente
  useEffect(() => {
    if (kioskoDirecto) {
      navigate(`/c/${condominio.slug}/${kioskoDirecto.slug}`);
      onKioskoDirectoVisto();
    }
  }, [kioskoDirecto, condominio, navigate, onKioskoDirectoVisto]);

  // ✅ Búsqueda — solo calcula resultados, NO muestra pantalla
  useEffect(() => {
    const termino = busqueda.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (termino.length === 0) { setResultadosBusqueda([]); return; }
    const timeout = setTimeout(() => {
      const resultados = kioskos.flatMap(k =>
        (k.productos || [])
          .filter(p => {
            const nombre = p.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return p.stock && nombre.includes(termino);
          })
          .map(p => ({ ...p, kiosko_obj: k }))
      );
      setResultadosBusqueda(resultados);
    }, 300);
    return () => clearTimeout(timeout);
  }, [busqueda, kioskos]);

  useEffect(() => {
  const onBack = () => {
    if (rubroActivo) {
      setRubroActivo(null);
      window.history.pushState({ rubro: true }, "");
    }
  };
  window.addEventListener("popstate", onBack);
  return () => window.removeEventListener("popstate", onBack);
}, [rubroActivo]);

  const kioskosDelRubro = rubroActivo
    ? kioskos.filter(k => k.rubro_id === rubroActivo.id)
    : kioskos;

  const kioskosFiltered = kioskosDelRubro;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "Nunito, sans-serif" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      {/* HEADER */}
      <div style={{ background: "#fff", padding: "10px 16px 12px", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", borderRadius: "0 0 20px 20px" }}>
        
        {/* FILA 1 — Logo + botón volver + rubro activo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 10 }}>
          {rubroActivo && (
            <button onClick={() => { setRubroActivo(null); setBusqueda(""); setMostrarResultados(false); }}
              style={{ position: "absolute", left: 0, background: "#f1f5f9", border: "none", color: "#374151", width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          )}
          <img src="/logo.png" style={{ height: 28, objectFit: "contain" }} alt="KiKiosko" />
          {rubroActivo && (
            <span style={{ position: "absolute", right: 0, fontSize: 11, color: "#6B7280", fontWeight: 700 }}>{rubroActivo.emoji} {rubroActivo.nombre}</span>
          )}
        </div>

        {/* FILA 2 — Buscador con dropdown */}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: busqueda ? "#eff6ff" : "#f8fafc", border: busqueda ? "2px solid #2563EB" : "1.5px solid #e5e7eb", borderRadius: busqueda && resultadosBusqueda.length > 0 && !mostrarResultados ? "12px 12px 0 0" : 999, padding: "9px 14px", transition: "all 0.2s" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🔍</span>
            <input
              style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", flex: 1, color: "#111827", fontFamily: "Nunito, sans-serif", fontWeight: busqueda ? 700 : 400 }}
              placeholder="Buscar productos en el condominio..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); if (e.target.value) setRubroActivo(null); setMostrarResultados(false); }}
              onKeyDown={e => { if (e.key === "Enter") setMostrarResultados(true); }}
            />
            {busqueda && (
              <button onClick={() => { setBusqueda(""); setResultadosBusqueda([]); setMostrarResultados(false); }}
                style={{ border: "none", background: "#e5e7eb", borderRadius: 6, padding: "3px 7px", fontSize: 11, cursor: "pointer", color: "#6B7280", flexShrink: 0 }}>✕</button>
            )}
          </div>

          {/* DROPDOWN SUGERENCIAS */}
          {busqueda.trim() && !mostrarResultados && resultadosBusqueda.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", borderRadius: "0 0 14px 14px", border: "2px solid #2563EB", borderTop: "none", overflow: "hidden", boxShadow: "0 12px 24px rgba(0,0,0,0.12)", zIndex: 50 }}>
              {resultadosBusqueda.slice(0, 5).map((prod, idx) => (
                <div key={`${prod.id}-${idx}`}
                  onClick={() => { 
                    // 🚀 Cambiado a ruta nativa
                    navigate(`/c/${condominio.slug}/${prod.kiosko_obj.slug}`);
                    setBusqueda(""); 
                    setResultadosBusqueda([]); 
                    setMostrarResultados(false); 
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", background: "#fff" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                  onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                  <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, background: "#f8fafc", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {prod.foto ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18 }}>{prod.emoji || "📦"}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prod.nombre}</p>
                    <p style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, margin: 0 }}>{prod.kiosko_obj.nombre}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#2563EB", flexShrink: 0 }}>S/. {Number(prod.precio).toFixed(2)}</span>
                </div>
              ))}
              <div onClick={() => setMostrarResultados(true)}
                style={{ padding: "10px 13px", textAlign: "center", background: "#f8fafc", cursor: "pointer", borderTop: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 800 }}>
                  🔍 Ver todos los resultados ({resultadosBusqueda.length}) →
                </span>
              </div>
            </div>
          )}

          {/* Sin resultados */}
          {busqueda.trim().length >= 2 && !mostrarResultados && resultadosBusqueda.length === 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", borderRadius: "0 0 12px 12px", border: "2px solid #2563EB", borderTop: "none", padding: "14px 13px", zIndex: 50, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>😕 Sin resultados para "{busqueda}"</span>
            </div>
          )}
        </div>
      </div>

      {busqueda.trim() && mostrarResultados ? (
        /* ✅ RESULTADOS DE BÚSQUEDA */
        <div style={{ padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>📦 Productos</span>
              <span style={{ background: "#eff6ff", color: "#2563EB", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>
                {resultadosBusqueda.length} resultados
              </span>
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>"{busqueda}"</span>
          </div>

          {resultadosBusqueda.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "50px 20px", textAlign: "center" }}>
              <span style={{ fontSize: 48, marginBottom: 14 }}>🔍</span>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#111827", marginBottom: 6 }}>Sin resultados</p>
              <p style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, lineHeight: 1.6, marginBottom: 20 }}>
                No encontramos "{busqueda}" en ningún negocio del condominio
              </p>
              <button onClick={() => { setBusqueda(""); setResultadosBusqueda([]); }}
                style={{ background: "#2563EB", color: "#fff", border: "none", borderRadius: 999, padding: "10px 20px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "Nunito, sans-serif" }}>
                Ver todos los negocios
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resultadosBusqueda.map((prod, idx) => (
                <div key={`${prod.id}-${idx}`}
                  // 🚀 Cambiado a ruta nativa
                  onClick={() => navigate(`/c/${condominio.slug}/${prod.kiosko_obj.slug}`)}
                  style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", border: "1px solid #f1f5f9", cursor: "pointer" }}>
                  {/* Foto producto */}
                  <div style={{ width: 72, height: 72, flexShrink: 0, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {prod.foto
                      ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 32 }}>{prod.emoji || "📦"}</span>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, padding: "10px 12px" }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 3px" }}>{prod.nombre}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <div style={{ width: 4, height: 4, background: "#2563EB", borderRadius: "50%", flexShrink: 0 }}></div>
                      <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{prod.kiosko_obj.nombre}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: "#2563EB" }}>S/. {Number(prod.precio).toFixed(2)}</span>
                  </div>
                  <div style={{ padding: "0 12px", fontSize: 18, color: "#9ca3af" }}>›</div>
                </div>
              ))}
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>— {resultadosBusqueda.length} productos encontrados —</span>
              </div>
            </div>
          )}
        </div>
      ) : !rubroActivo ? (
        <div>
          {/* BANNER FACHADA */}
          <div style={{ position: "relative", height: 200, overflow: "hidden", borderRadius: "0 0 24px 24px", margin: "0 0 4px 0", background: "linear-gradient(160deg, #1e3a5f 0%, #2563eb 60%, #0369a1 100%)" }}>
            {condominio.banner
              ? <img src={condominio.banner} alt={condominio.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80, opacity: 0.2 }}>🏢</div>
            }
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "16px" }}>
              {(() => {
                const total = kioskos.length;
                const abiertos = kioskos.filter(k => estaAbierto(k.info_tienda) !== false).length;
                return (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(16,185,129,0.85)", borderRadius: 999, padding: "3px 10px", width: "fit-content", marginBottom: 6 }}>
                    <div style={{ width: 5, height: 5, background: "#fff", borderRadius: "50%" }}></div>
                    <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>
                      {total} negocios · {abiertos} abiertos ahora
                    </span>
                  </div>
                );
              })()}
              <p style={{ fontSize: 22, fontWeight: 900, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.4)", lineHeight: 1.1 }}>{condominio.nombre}</p>
            </div>
          </div>

          {/* RUBROS GRID */}
          <div style={{ padding: "16px 14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>¿Qué necesitas hoy?</p>
              {rubros.length > 6 && !verTodosRubros && (
                <button onClick={() => setVerTodosRubros(true)}
                  style={{ fontSize: 11, color: "#2563EB", fontWeight: 800, background: "none", border: "none", cursor: "pointer" }}>
                  Ver todos ({rubros.length}) →
                </button>
              )}
              {verTodosRubros && (
                <button onClick={() => setVerTodosRubros(false)}
                  style={{ fontSize: 11, color: "#6B7280", fontWeight: 800, background: "none", border: "none", cursor: "pointer" }}>
                  ← Ver menos
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {(verTodosRubros ? rubros : rubros.slice(0, 6)).map(r => {
                const totalNegocios = kioskos.filter(k => k.rubro_id === r.id).length;
                return (
                  <button key={r.id} onClick={() => {
  setRubroActivo(r);
  window.history.pushState({ rubro: true }, "");
}}
                    style={{ background: "#fff", borderRadius: 14, padding: "12px 8px", textAlign: "center", border: "1.5px solid #f1f5f9", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: r.color || "#2563EB", borderRadius: 0 }}></div>
                    <span style={{ fontSize: 26, display: "block", marginBottom: 5 }}>
                      {r.emoji && r.emoji !== "🏪" ? r.emoji : (() => {
                        const n = r.nombre.toLowerCase();
                        if (n.includes("bodega")) return "🛒";
                        if (n.includes("farmacia")) return "💊";
                        if (n.includes("licor")) return "🍾";
                        if (n.includes("libreria") || n.includes("librería")) return "📚";
                        if (n.includes("peluquer")) return "✂️";
                        if (n.includes("ferreteri") || n.includes("ferretería")) return "🔧";
                        if (n.includes("polleria") || n.includes("pollería")) return "🍗";
                        if (n.includes("panaderia") || n.includes("panadería")) return "🥖";
                        if (n.includes("carnicer")) return "🥩";
                        if (n.includes("restaurant") || n.includes("comida")) return "🍽️";
                        if (n.includes("fruteria") || n.includes("frutas")) return "🍎";
                        if (n.includes("lavanderia") || n.includes("lavandería")) return "👕";
                        if (n.includes("zapateria") || n.includes("zapatería")) return "👟";
                        return "🏪";
                      })()}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#111827", display: "block", lineHeight: 1.2 }}>{r.nombre}</span>
                    <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>{totalNegocios} tiendas</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ✅ SECCIÓN OFERTAS */}
          {productosOferta && productosOferta.length > 0 && (
            <div style={{ background: "#fff", padding: "14px 14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ background: "#fef2f2", borderRadius: 8, padding: "3px 7px", fontSize: 14 }}>🏷️</div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>Ofertas</span>
                  <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>{productosOferta.length} productos</span>
                </div>
              </div>

              {/* Scroll horizontal de ofertas */}
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {productosOferta.map((prod, idx) => {
                  const kiosko = kioskos.find(k => k.id === prod.kiosko_id);
                  return (
                    <div key={`${prod.id}-${idx}`}
                      // 🚀 Cambiado a ruta nativa
                      onClick={() => kiosko && navigate(`/c/${condominio.slug}/${kiosko.slug}`)}
                      style={{ flexShrink: 0, width: 140, background: "#fff", borderRadius: 14, overflow: "hidden", border: "1.5px solid #fee2e2", boxShadow: "0 2px 8px rgba(220,38,38,0.08)", cursor: "pointer" }}>

                      {/* Foto producto */}
                      <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {prod.foto
                          ? <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 36 }}>{prod.emoji || "🏷️"}</span>
                        }
                        {/* Badge oferta */}
                        <div style={{ position: "absolute", top: 6, left: 6, background: "#dc2626", color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 999 }}>
                          🏷️ OFERTA
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ padding: "8px 9px 10px" }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: "#111827", margin: "0 0 3px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.nombre}</p>
                        {prod.precio_original && prod.precio_original > prod.precio && (
  <span style={{ fontSize: 10, color: "#9ca3af", textDecoration: "line-through", display: "block", lineHeight: 1.2 }}>
    S/. {Number(prod.precio_original).toFixed(2)}
  </span>
)}
<p style={{ fontSize: 13, fontWeight: 900, color: "#dc2626", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
  S/. {Number(prod.precio).toFixed(2)}
  {prod.precio_original && prod.precio_original > prod.precio && (
    <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: "#dc2626", padding: "1px 5px", borderRadius: 999 }}>
      -{Math.round((1 - prod.precio / prod.precio_original) * 100)}%
    </span>
  )}
</p>
                        {kiosko && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#dc2626", flexShrink: 0 }}></div>
                            <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kiosko.nombre}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ height: 8, background: "#f1f5f9" }} />

          {/* PRODUCTOS DESTACADOS */}
          {productosDestacados.length > 0 && (
            <div style={{ padding: "0 14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <div style={{ background: "#fff7ed", borderRadius: 8, padding: "3px 7px", fontSize: 14 }}>🔥</div>
                <span style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>Lo más pedido</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {productosDestacados.map((prod, idx) => {
                  const kiosko = kioskos.find(k => k.id === prod.kiosko_id);
                  return (
                    <div key={prod.id} 
                      // 🚀 Cambiado a ruta nativa
                      onClick={() => kiosko && navigate(`/c/${condominio.slug}/${kiosko.slug}`)}
                      style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #f1f5f9", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                      <div style={{ position: "relative", aspectRatio: "1/1", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img src={prod.foto} alt={prod.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div style={{ position: "absolute", top: 5, left: 5, width: 18, height: 18, borderRadius: 6, background: idx === 0 ? "#f59e0b" : idx === 1 ? "#6b7280" : "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#fff" }}>{idx + 1}</div>
                      </div>
                      <div style={{ padding: "7px 8px 9px" }}>
                        <p style={{ fontSize: 10, fontWeight: 800, color: "#111827", marginBottom: 2, lineHeight: 1.2 }}>{prod.nombre}</p>
                        <p style={{ fontSize: 12, fontWeight: 900, color: "#2563EB", marginBottom: 3 }}>S/. {Number(prod.precio).toFixed(2)}</p>
                        {kiosko && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#2563EB", flexShrink: 0 }}></div>
                            <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>{kiosko.nombre}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* LISTA DE NEGOCIOS DEL RUBRO */
        <div style={{ padding: "8px 6px 0" }}>
          {rubroActivo && (
            <p style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", marginBottom: 14 }}>
              {kioskosFiltered.length} negocio{kioskosFiltered.length !== 1 ? "s" : ""} en {rubroActivo.emoji} {rubroActivo.nombre}
            </p>
          )}
          {kioskosFiltered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
              <p style={{ fontSize: 32 }}>🏪</p>
              <p style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Sin negocios disponibles</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {kioskosFiltered.map(k => {
                const rubro = rubros.find(r => r.id === k.rubro_id);
                return (
                  <div key={k.id}
                    style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "1px solid #f1f5f9", cursor: "pointer", display: "flex" }}
                    // 🚀 Cambiado a ruta nativa
                    onClick={() => navigate(`/c/${condominio.slug}/${k.slug}`)}>

                    {/* IMAGEN LATERAL */}
                    <div style={{ width: 110, flexShrink: 0, position: "relative", background: rubro ? `linear-gradient(135deg, ${rubro.color}33, ${rubro.color}66)` : "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
                      {k.banner
                        ? <img src={k.banner} alt={k.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ opacity: 0.5 }}>{rubro?.emoji || "🏪"}</span>
                      }
                      {/* Badge abierto/cerrado DINÁMICO */}
                      {(() => {
                        const abierto = estaAbierto(k.info_tienda);
                        return (
                          <div style={{ position: "absolute", bottom: 6, left: 6, display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", borderRadius: 999, padding: "2px 7px" }}>
                            <div style={{ width: 4, height: 4, background: abierto === false ? "#f87171" : "#4ade80", borderRadius: "50%" }}></div>
                            <span style={{ color: "#fff", fontSize: 8, fontWeight: 800 }}>
                              {abierto === false ? "Cerrado" : "Abierto"}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* INFO DERECHA */}
                    <div style={{ flex: 1, padding: "11px 12px 11px 13px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>

                      {/* Nombre + flecha */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <p style={{ fontSize: 14, fontWeight: 900, color: "#111827", margin: 0, lineHeight: 1.2 }}>{k.nombre}</p>
                        <div style={{ width: 24, height: 24, background: "#f1f5f9", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>›</div>
                      </div>

                      {/* Descripción */}
                      {k.info_tienda?.descripcion && (
                        <p style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{k.info_tienda.descripcion}</p>
                      )}

                      {/* Rubro badge */}
                      {rubro && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: `${rubro.color}15`, border: `1px solid ${rubro.color}30`, borderRadius: 999, padding: "2px 8px", fontSize: 9, fontWeight: 800, color: rubro.color, width: "fit-content" }}>
                          {rubro.emoji} {rubro.nombre}
                        </span>
                      )}

                      {/* Horario */}
                      {k.info_tienda?.horario && (
                        <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                          🕐 {k.info_tienda.horario}
                        </span>
                      )}

                      {/* Delivery + productos */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {k.info_tienda?.delivery === "si" && (
                          <span style={{ fontSize: 9, color: "#059669", fontWeight: 800, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 999, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                            🛵 {k.info_tienda?.delivery_tiempo || "Delivery"}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>📦 {(k.productos || []).length} productos</span>
                        {k.plan === "Premium" && (
                          <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 800 }}>⭐ Premium</span>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LOGIN SCREEN ───
function LoginScreen() {
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState({ email: "", clave: "" });
  const [loginError, setLoginError] = useState("");
  const [pantalla, setPantalla] = useState("login");
  const [kioskoCurrent, setKioskoCurrent] = useState(null);
  const [productosActuales, setProductosActuales] = useState([]);

  const handleLogin = async () => {
    if (loginForm.email === SUPERADMIN.email && loginForm.clave === SUPERADMIN.clave) {
      setPantalla("superadmin");
      setLoginError("");
      return;
    }
    const { data: kioskoLogin } = await supabase.from("kioskos").select("*").eq("email", loginForm.email).eq("clave", loginForm.clave).single();
    if (kioskoLogin) {
      if (!kioskoLogin.activo) { setLoginError("Tu acceso está inactivo. Contacta al administrador."); return; }
      const { data: prods } = await supabase.from("productos").select("*").eq("kiosko_id", kioskoLogin.id);
      if (kioskoLogin.condominio_id) {
        const { data: cond } = await supabase.from("condominios").select("slug").eq("id", kioskoLogin.condominio_id).single();
        setKioskoCurrent({ ...kioskoLogin, condominio_slug: cond?.slug || null });
      } else {
        setKioskoCurrent(kioskoLogin);
      }
      setProductosActuales(prods || []);
      setPantalla("adminkiosko");
      setLoginError("");
      return;
    }
    setLoginError("Correo o clave incorrectos");
  };

  if (pantalla === "superadmin") {
    return <SuperAdmin onSalir={() => { setPantalla("login"); setLoginForm({ email: "", clave: "" }); }} />;
  }

  if (pantalla === "adminkiosko" && kioskoCurrent) {
    return (
      <AdminKiosko
        kiosko={{ ...kioskoCurrent, productos: productosActuales }}
        onProductosChange={setProductosActuales}
        onSalir={() => { setPantalla("login"); setKioskoCurrent(null); setLoginForm({ email: "", clave: "" }); }}
        onVerCatalogo={() => setPantalla("catalogo")}
      />
    );
  }

  if (pantalla === "catalogo" && kioskoCurrent) {
    return (
      <CatalogoCliente
        kiosko={{ ...kioskoCurrent, productos: productosActuales }}
        onSalir={() => setPantalla("adminkiosko")}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp2 { width: 100%; background: #fff; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 13px 16px; font-size: 14px; color: #111827; font-family: inherit; outline: none; transition: border 0.2s; }
        .inp2:focus { border-color: #1D4ED8; }
        .fade { animation: fade 0.4s ease both; }
        @keyframes fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
      <div className="fade" style={{ background: "#fff", borderRadius: 22, padding: "40px 32px", width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(37,99,235,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo.png" style={{ height: 48, objectFit: "contain", marginBottom: 8 }} alt="KiKiosko" />
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Tu catálogo digital con pedidos por WhatsApp</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input className="inp2" placeholder="Correo" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <input className="inp2" type="password" placeholder="Contraseña" value={loginForm.clave} onChange={e => setLoginForm({ ...loginForm, clave: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {loginError && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 12, textAlign: "center" }}>⚠️ {loginError}</p>}
        <button onClick={handleLogin} style={{ width: "100%", background: "#1D4ED8", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 900, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
          Ingresar →
        </button>
        <div style={{ marginTop: 20, padding: "14px", background: "#eff6ff", borderRadius: 10, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#1D4ED8", marginBottom: 6 }}>🏪 ¿Tienes un kiosko?</p>
          <p style={{ lineHeight: 1.6 }}>Ingresa con el correo y contraseña que te enviamos por WhatsApp.</p>
          <p style={{ marginTop: 8, lineHeight: 1.6 }}>¿Problemas para ingresar? Escríbenos al WhatsApp de soporte.</p>
        </div>
      </div>
    </div>
  );
}

// ─── WRAPPER DE CONDOMINIO ───
function CondominioWrapper() {
  const { slugCond, slugKiosko, slugMadre } = useParams();
  const navigate = useNavigate(); // 🌟 Lo agregamos para controlar el botón "Salir"
  const [condominioPublico, setCondominioPublico] = useState(null);
  const [rubrosPublicos, setRubrosPublicos] = useState([]);
  const [rubroActivo, setRubroActivo] = useState(null);
  const [kioskosPorRubro, setKioskosPorRubro] = useState([]);
  const [productosDestacados, setProductosDestacados] = useState([]);
  const [productosOferta, setProductosOferta] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarCondominio();
  }, [slugCond]);

  const cargarCondominio = async () => {
    setCargando(true);
    const slugLimpio = slugCond ? slugCond.toLowerCase().trim() : "";
    const { data: cond } = await supabase.from("condominios").select("*").eq("slug", slugLimpio).single();
    if (cond) {
      const { data: rubros } = await supabase.from("rubros").select("*").eq("condominio_id", cond.id).order("orden");
      const { data: kioskos } = await supabase.from("kioskos").select("*").eq("condominio_id", cond.id).eq("activo", true);
      const kioskosConProductos = await Promise.all(
        (kioskos || []).map(async (k) => {
          const { data: prods } = await supabase.from("productos").select("*").eq("kiosko_id", k.id);
          return { ...k, productos: prods || [], condominio_slug: cond.slug };
        })
      );
      setCondominioPublico(cond);
      setRubrosPublicos(rubros || []);
      setKioskosPorRubro(kioskosConProductos || []);
      setProductosDestacados(
        kioskosConProductos.flatMap(k => (k.productos || []).filter(p => p.foto && p.stock)).slice(0, 3)
      );
      setProductosOferta(
        kioskosConProductos.flatMap(k =>
          (k.productos || []).filter(p => p.oferta && p.stock).map(p => ({ ...p, kiosko_nombre: k.nombre }))
        )
      );
    }
    setCargando(false);
  };

  if (cargando) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#eff6ff", fontFamily: "'Nunito', sans-serif", gap: 16 }}>
      <img src="/logo.png" alt="Logo" style={{ width: 120, height: "auto", objectFit: "contain" }} />
      <p style={{ fontSize: 16, fontWeight: 700, color: "#1D4ED8", margin: 0 }}>Cargando...</p>
    </div>
  );

  if (!condominioPublico) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", background: "#eff6ff" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>🔒</p>
        <p style={{ fontSize: 18, fontWeight: 900, color: "#dc2626" }}>Condominio no disponible</p>
      </div>
    </div>
  );

  // 🌟 SI EN LA URL VIENE UN SLUG DE KIOSKO, CARGAMOS SU CATÁLOGO DIRECTO:
  if (slugKiosko) {
    const kioskoActual = kioskosPorRubro.find(k => k.slug === slugKiosko.toLowerCase().trim());
    if (kioskoActual) {
      return (
  <CatalogoCliente
    kiosko={{ ...kioskoActual, productos: kioskoActual.productos || [] }}
    slugCond={slugCond}
    slugKiosko={slugKiosko}
    slugMadre={slugMadre}
    onSalir={() => navigate(`/c/${condominioPublico.slug}`)}
  />
);
    }
  }

  return (
    <CondominioPublico
      condominio={condominioPublico}
      rubros={rubrosPublicos}
      kioskos={kioskosPorRubro}
      productosDestacados={productosDestacados}
      productosOferta={productosOferta}
      rubroActivo={rubroActivo}
      setRubroActivo={setRubroActivo}
    />
  );
}

// ─── WRAPPER DE KIOSKO INDIVIDUAL ───
function KioskoWrapper() {
  const { slug } = useParams();
  const [kiosko, setKiosko] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarKiosko();
  }, [slug]);

  const cargarKiosko = async () => {
    setCargando(true);
    const slugLimpio = slug ? slug.toLowerCase().trim() : "";
    const { data } = await supabase.from("kioskos").select("*").eq("slug", slugLimpio).single();
    if (data) {
      const { data: prods } = await supabase.from("productos").select("*").eq("kiosko_id", data.id);
      setKiosko({ ...data, productos: prods || [] });
    }
    setCargando(false);
  };

  if (cargando) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#eff6ff", fontFamily: "'Nunito', sans-serif", gap: 16 }}>
      <img src="/logo.png" alt="Logo" style={{ width: 120, height: "auto", objectFit: "contain" }} />
      <p style={{ fontSize: 16, fontWeight: 700, color: "#1D4ED8", margin: 0 }}>Cargando...</p>
    </div>
  );

  if (!kiosko || !kiosko.activo) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", background: "#eff6ff" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>🔒</p>
        <p style={{ fontSize: 18, fontWeight: 900, color: "#dc2626" }}>Kiosko no disponible</p>
      </div>
    </div>
  );

  return (
  <CatalogoCliente
    kiosko={kiosko}
    slugCond={null}
    slugKiosko={slug}
    slugMadre={null}
    onSalir={null}
  />
);
}

// ─── APP PRINCIPAL ───
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/c/:slugCond" element={<CondominioWrapper />} />
        <Route path="/c/:slugCond/:slugKiosko" element={<CondominioWrapper />} />
        <Route path="/c/:slugCond/:slugKiosko/:slugMadre" element={<CondominioWrapper />} />
        <Route path="/:slug" element={<KioskoWrapper />} />
      </Routes>
    </HashRouter>
  );
}