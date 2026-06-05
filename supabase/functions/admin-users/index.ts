// ════════════════════════════════════════════════════════════════
// SIMUSID — Edge Function: admin-users
// Crea/elimina/resetea cuentas (requiere service_role, por eso vive
// en el servidor y NO en el frontend).
//
// Desplegar:  supabase functions deploy admin-users
// ════════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SYN_DOMAIN = "usr.simusid.app"; // dominio sintético (los usuarios nunca ven emails)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function genTempPass(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Verificar quién llama ──
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "No autorizado" }, 401);
    const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!caller || !["admin", "docente"].includes(caller.role)) {
      return json({ error: "Solo admin o docente pueden gestionar usuarios" }, 403);
    }

    const body = await req.json();
    const action: string = body.action;

    // ── Crear estudiante (docente o admin) ──
    if (action === "create_student") {
      const { nombre, apellido, cedula } = body;
      if (!/^\d{6,12}$/.test(cedula ?? "")) return json({ error: "Cédula inválida" }, 400);
      const tempPass = genTempPass();
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${cedula}@${SYN_DOMAIN}`,
        password: tempPass,
        email_confirm: true,
      });
      if (error) return json({ error: error.message }, 400);
      const { error: e2 } = await admin.from("profiles").insert({
        id: created.user.id, role: "estudiante",
        nombre: nombre ?? "", apellido: apellido ?? "", cedula,
        username: cedula,
        must_change_password: true,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(created.user.id); // rollback
        return json({ error: e2.message }, 400);
      }
      return json({ ok: true, tempPass });
    }

    // ── Resetear contraseña de estudiante ──
    if (action === "reset_student") {
      const { cedula } = body;
      const { data: prof } = await admin.from("profiles").select("id").eq("cedula", cedula).single();
      if (!prof) return json({ error: "Estudiante no encontrado" }, 404);
      const tempPass = genTempPass();
      const { error } = await admin.auth.admin.updateUserById(prof.id, { password: tempPass });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", prof.id);
      return json({ ok: true, tempPass });
    }

    // ── Eliminar estudiante (borra auth → cascade borra perfil) ──
    if (action === "delete_student") {
      const { cedula } = body;
      const { data: prof } = await admin.from("profiles").select("id, role").eq("cedula", cedula).single();
      if (!prof || prof.role !== "estudiante") return json({ error: "Estudiante no encontrado" }, 404);
      const { error } = await admin.auth.admin.deleteUser(prof.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ── Crear docente (SOLO admin) ──
    if (action === "create_docente") {
      if (caller.role !== "admin") return json({ error: "Solo el admin crea docentes" }, 403);
      const { username, password, nombre } = body;
      const uname = (username ?? "").trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,20}$/.test(uname)) return json({ error: "Usuario inválido (3-20 caracteres, sin espacios)" }, 400);
      if ((password ?? "").length < 6) return json({ error: "Contraseña mínimo 6 caracteres" }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${uname}@${SYN_DOMAIN}`, password, email_confirm: true,
      });
      if (error) return json({ error: error.message }, 400);
      const { error: e2 } = await admin.from("profiles").insert({
        id: created.user.id, role: "docente", nombre: nombre ?? "", username: uname,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: e2.message }, 400);
      }
      return json({ ok: true, id: created.user.id });
    }

    // ── Eliminar docente (SOLO admin) ──
    if (action === "delete_docente") {
      if (caller.role !== "admin") return json({ error: "Solo el admin elimina docentes" }, 403);
      const { id } = body;
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
