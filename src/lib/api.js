// ════════════════════════════════════════════════════════════════
// SIMUSID — Capa de datos sobre Supabase
//
// Diseño: la app fue escrita con un store síncrono (loadStore/saveStore).
// Para no reescribir 4600 líneas, mantenemos un ESPEJO en memoria con la
// misma forma { images, cotejos, estudiantes, docentes, events } que:
//   · se llena desde Supabase al iniciar sesión (fetchAll)
//   · se sincroniza hacia Supabase con un diff debounced (syncNow)
// Las operaciones de usuarios (crear estudiante/docente, resetear clave)
// van por la Edge Function `admin-users` porque requieren service_role.
// ════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

const SYN_DOMAIN = "usr.simusid.app";   // emails sintéticos (invisibles para el usuario)

// Convierte un nombre de usuario en su email interno. Si la persona escribe
// un email real (contiene @), se respeta tal cual.
function toEmail(userField) {
  const u = (userField || "").trim().toLowerCase();
  return u.includes("@") ? u : `${u}@${SYN_DOMAIN}`;
}
const SYNC_DEBOUNCE_MS = 900;

let mirror = { images: {}, cotejos: {}, estudiantes: {}, docentes: {}, events: [] };
let snapshot = { cotejos: {}, images: {} };  // último estado confirmado en BD (para diff)
let me = null;                               // perfil del usuario autenticado
let syncTimer = null;
let syncStatusCb = null;                     // callback opcional de UI: "saving" | "saved" | "error"

export const getMirror = () => mirror;
export const getMe = () => me;
export const onSyncStatus = (cb) => { syncStatusCb = cb; };
const notify = (s) => { try { syncStatusCb?.(s); } catch {} };

const isGuiaId = (id) => id === "__guia_imgA__" || id === "__guia_imgB__" || id === "__guia_permanente__";

// ── AUTH ──────────────────────────────────────────────────────────
export async function signIn(role, userField, password) {
  const email = toEmail(userField);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Credenciales incorrectas");
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  if (!prof) { await supabase.auth.signOut(); throw new Error("Perfil no encontrado. Contacte al administrador."); }
  if (prof.role !== role) { await supabase.auth.signOut(); throw new Error(`Esta cuenta es de tipo "${prof.role}".`); }
  me = prof;
  await fetchAll();
  return prof;
}

export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return null;
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).single();
  if (!prof) return null;
  me = prof;
  await fetchAll();
  return prof;
}

export async function signOut() {
  await flushSync();
  me = null;
  mirror = { images: {}, cotejos: {}, estudiantes: {}, docentes: {}, events: [] };
  snapshot = { cotejos: {}, images: {} };
  await supabase.auth.signOut();
}

export async function changeMyPassword(newPass) {
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) throw new Error(error.message);
  await supabase.from("profiles").update({ must_change_password: false }).eq("id", me.id);
  me = { ...me, must_change_password: false };
}

// ── CARGA INICIAL ─────────────────────────────────────────────────
export async function fetchAll() {
  const [imgs, cots, profs, evs] = await Promise.all([
    supabase.from("imagenes").select("*"),
    supabase.from("cotejos").select("*"),
    supabase.from("profiles").select("*"),
    supabase.from("eventos").select("*").order("ts", { ascending: false }).limit(500),
  ]);
  const images = {}, cotejos = {}, estudiantes = {}, docentes = {};
  (imgs.data || []).forEach(r => {
    images[r.id] = { id: r.id, name: r.name, src: r.url, path: r.path, date: (r.created_at || "").slice(0, 10), owner: "docente" };
  });
  (cots.data || []).forEach(r => {
    cotejos[r.id] = { ...(r.data || {}), id: r.id };
  });
  (profs.data || []).forEach(p => {
    if (p.role === "estudiante") estudiantes[p.id] = { id: p.id, nombre: p.nombre, apellido: p.apellido, cedula: p.cedula, date: (p.created_at || "").slice(0, 10) };
    if (p.role === "docente") docentes[p.id] = { id: p.id, user: p.username || "", nombre: p.nombre, pass: "********", date: (p.created_at || "").slice(0, 10) };
  });
  const events = (evs.data || []).map(e => ({ id: e.id, ts: e.ts, date: new Date(e.ts).toLocaleString("es-CO"), category: e.category, action: e.action, detail: e.detail, actor: e.actor }));
  mirror = { images, cotejos, estudiantes, docentes, events, historySeeded: true };
  snapshot = {
    cotejos: Object.fromEntries(Object.entries(cotejos).map(([k, v]) => [k, JSON.stringify(v)])),
    images: Object.fromEntries(Object.keys(images).map(k => [k, true])),
  };
}

// ── ESCRITURA: espejo + diff sync ─────────────────────────────────
export function saveMirror(next) {
  // limpiar entidades guía (viven en el código, no en BD)
  const clean = { ...next };
  if (clean.images) { const i = { ...clean.images }; delete i.__guia_imgA__; delete i.__guia_imgB__; clean.images = i; }
  if (clean.cotejos) { const c = { ...clean.cotejos }; delete c.__guia_permanente__; clean.cotejos = c; }
  mirror = { ...mirror, ...clean };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, SYNC_DEBOUNCE_MS);
}

export async function flushSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  await syncNow();
}

async function syncNow() {
  if (!me) return;
  notify("saving");
  try {
    const upserts = [], deletions = [];
    const cur = mirror.cotejos || {};
    for (const [id, c] of Object.entries(cur)) {
      if (isGuiaId(id)) continue;
      const s = JSON.stringify(c);
      if (snapshot.cotejos[id] !== s) { upserts.push(rowFromCotejo(c)); snapshot.cotejos[id] = s; }
    }
    for (const id of Object.keys(snapshot.cotejos)) {
      if (!(id in cur)) { deletions.push(id); delete snapshot.cotejos[id]; }
    }
    if (upserts.length) {
      const { error } = await supabase.from("cotejos").upsert(upserts);
      if (error) throw error;
    }
    if (deletions.length) {
      await supabase.from("cotejos").delete().in("id", deletions);
    }
    // imágenes eliminadas desde la UI (la subida va por uploadImage)
    const curImgs = mirror.images || {};
    for (const id of Object.keys(snapshot.images)) {
      if (!(id in curImgs)) {
        delete snapshot.images[id];
        const { data: row } = await supabase.from("imagenes").select("path").eq("id", id).single();
        await supabase.from("imagenes").delete().eq("id", id);
        if (row?.path) await supabase.storage.from("huellas").remove([row.path]);
      }
    }
    notify("saved");
  } catch (e) {
    console.error("[SIMUSID] Error sincronizando:", e);
    notify("error");
  }
}

function rowFromCotejo(c) {
  return {
    id: c.id,
    name: c.name || "",
    status: c.status || "modelo",
    published: !!c.published,
    finalizado: !!c.finalizado,
    parent_id: c.parentId || null,
    owner_role: c.owner || "docente",
    student_cedula: c.studentId || null,
    deadline: c.deadline || null,
    deadline_strict: !!c.deadlineStrict,
    grade: c.grade ?? null,
    data: c,
  };
}

// ── IMÁGENES: comprimir + subir a Storage ─────────────────────────
function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
      const cvs = document.createElement("canvas");
      cvs.width = w; cvs.height = h;
      cvs.getContext("2d").drawImage(img, 0, 0, w, h);
      cvs.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo comprimir")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen inválida")); };
    img.src = url;
  });
}

export async function uploadImage(file) {
  if (!me) throw new Error("Sesión expirada");
  const id = Math.random().toString(36).slice(2, 11);
  const blob = await compressImage(file);
  const path = `${me.id}/${id}.jpg`;
  const { error } = await supabase.storage.from("huellas").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  const { data: pub } = supabase.storage.from("huellas").getPublicUrl(path);
  const { error: e2 } = await supabase.from("imagenes").insert({ id, name: file.name, url: pub.publicUrl, path });
  if (e2) { await supabase.storage.from("huellas").remove([path]); throw new Error(e2.message); }
  mirror = { ...mirror, images: { ...mirror.images, [id]: { id, name: file.name, src: pub.publicUrl, path, date: new Date().toLocaleString("es-CO"), owner: "docente" } } };
  snapshot.images[id] = true;
  return id;
}

// ── EVENTOS ───────────────────────────────────────────────────────
export function logEvent(category, action, detail, actor) {
  const ev = { id: Math.random().toString(36).slice(2, 11), ts: new Date().toISOString(), date: new Date().toLocaleString("es-CO"), category, action, detail: detail || "", actor: actor || me?.nombre || "sistema" };
  mirror = { ...mirror, events: [ev, ...(mirror.events || [])].slice(0, 500) };
  supabase.from("eventos").insert({ id: ev.id, category, action, detail: ev.detail, actor: ev.actor }).then(() => {});
}

// ── GESTIÓN DE USUARIOS (Edge Function) ───────────────────────────
async function callAdminFn(payload) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });
  if (error) throw new Error(error.message || "Error en el servidor");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createStudent(nombre, apellido, cedula) {
  const r = await callAdminFn({ action: "create_student", nombre, apellido, cedula });
  await refetchProfiles();
  return r.tempPass;
}
export async function resetStudentPassword(cedula) {
  const r = await callAdminFn({ action: "reset_student", cedula });
  return r.tempPass;
}
export async function deleteStudent(cedula) {
  await callAdminFn({ action: "delete_student", cedula });
  await refetchProfiles();
}
export async function createDocente(username, password, nombre) {
  await callAdminFn({ action: "create_docente", username, password, nombre });
  await refetchProfiles();
}
export async function deleteDocente(id) {
  await callAdminFn({ action: "delete_docente", id });
  await refetchProfiles();
}

async function refetchProfiles() {
  const { data } = await supabase.from("profiles").select("*");
  const estudiantes = {}, docentes = {};
  (data || []).forEach(p => {
    if (p.role === "estudiante") estudiantes[p.id] = { id: p.id, nombre: p.nombre, apellido: p.apellido, cedula: p.cedula, date: (p.created_at || "").slice(0, 10) };
    if (p.role === "docente") docentes[p.id] = { id: p.id, user: p.username || "", nombre: p.nombre, pass: "********", date: (p.created_at || "").slice(0, 10) };
  });
  mirror = { ...mirror, estudiantes, docentes };
}

// ── UTILIDADES (backup / borrado selectivo) ───────────────────────
export function exportBackup() {
  return JSON.stringify({ __simusid_backup__: true, version: "2.0-supabase", exportedAt: new Date().toISOString(), data: mirror }, null, 2);
}

export async function clearCategory(cat) {
  if (cat === "cotejos" || cat === "todo") {
    await supabase.from("cotejos").delete().neq("id", "");
    mirror = { ...mirror, cotejos: {} }; snapshot.cotejos = {};
  }
  if (cat === "imagenes" || cat === "todo") {
    const paths = Object.values(mirror.images || {}).map(i => i.path).filter(Boolean);
    if (paths.length) await supabase.storage.from("huellas").remove(paths);
    await supabase.from("imagenes").delete().neq("id", "");
    mirror = { ...mirror, images: {} }; snapshot.images = {};
  }
  if (cat === "estudiantes") {
    for (const est of Object.values(mirror.estudiantes || {})) {
      try { await callAdminFn({ action: "delete_student", cedula: est.cedula }); } catch {}
    }
    await refetchProfiles();
  }
}
