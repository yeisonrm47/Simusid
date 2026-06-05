# SIMUSID v2.0 — Web + Supabase

Sistema de Identificación Dactiloscópica con autenticación real, base de datos
Postgres y almacenamiento de imágenes en la nube. Stack: **React + Vite**
(frontend, gratis en Vercel) y **Supabase** (Auth + Postgres + Storage, plan
gratuito).

---

## Qué cambió respecto a la versión demo

| Antes (demo) | Ahora (producción) |
|---|---|
| Credenciales hardcodeadas en el código | Supabase Auth (contraseñas hasheadas, JWT) |
| Cédula = contraseña del estudiante | Cédula = usuario + **clave temporal** que se cambia al primer ingreso |
| Claves de docentes visibles en texto plano | Nadie ve contraseñas; reseteo genera clave temporal nueva |
| Todo en localStorage (límite ~5 MB) | Postgres con Row Level Security por rol |
| Imágenes base64 dentro del JSON | Supabase Storage (se comprimen a ~1600px al subir) |
| Datos se pierden al cambiar de navegador | Sesión persistente y datos centralizados |

Cuentas creadas desde la app: el **admin** crea docentes (email + clave) y el
**docente** crea estudiantes (cédula → el sistema genera y muestra la clave
temporal; al importar una lista CSV se descarga un `.txt` con todas las
credenciales para repartir).

---

## PARTE 1 — Configurar Supabase (15 min)

1. Cree una cuenta en [supabase.com](https://supabase.com) → **New project**
   (anote la contraseña de la base de datos). Región: `South America (São Paulo)`.

2. **SQL Editor → New query** → pegue TODO el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Esto crea las tablas
   (`profiles`, `imagenes`, `cotejos`, `eventos`), las políticas RLS y el bucket
   `huellas`.

3. **Crear su usuario admin:**
   - `Authentication → Users → Add user → Create new user`: su email + una
     contraseña fuerte. Marque *Auto Confirm User*.
   - Vuelva al SQL Editor y ejecute (con SU email):
     ```sql
     insert into public.profiles (id, role, nombre)
     select id, 'admin', 'Administrador' from auth.users where email = 'su@email.com';
     ```

4. **Desplegar la Edge Function** (crea/borra/resetea cuentas de forma segura):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref SU_PROJECT_REF   # el ref está en la URL del dashboard
   supabase functions deploy admin-users
   ```
   > La función usa automáticamente la `SERVICE_ROLE_KEY` del proyecto; no hay
   > que configurar nada más.

5. Copie de **Project Settings → API**: la `Project URL` y la `anon public key`.

---

## PARTE 2 — Probar en local (5 min)

```bash
npm install
cp .env.example .env       # pegue ahí su URL y anon key
npm run dev                # abre http://localhost:5173
```

Entre como **Administrador** con su email. Cree un docente (Ver → Docentes),
cierre sesión, entre como docente, suba imágenes, cree un cotejo, finalícelo,
publíquelo, registre un estudiante (anote la clave temporal) y pruebe el flujo
completo.

---

## PARTE 3 — Subir a internet con Vercel (10 min)

1. Suba el proyecto a GitHub:
   ```bash
   git init && git add . && git commit -m "SIMUSID v2.0"
   git remote add origin https://github.com/SU_USUARIO/simusid.git
   git push -u origin main
   ```
   > `.gitignore` ya excluye `.env` — sus llaves nunca se suben.

2. En [vercel.com](https://vercel.com) → **Add New → Project** → importe el
   repo. Vercel detecta Vite solo. En **Environment Variables** agregue:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. **Deploy**. Su app queda en `https://simusid.vercel.app` (puede conectar un
   dominio propio gratis). Cada `git push` redespliega automáticamente.

4. (Recomendado) En Supabase → `Authentication → URL Configuration` ponga su
   URL de Vercel como *Site URL*.

---

## Cómo funciona por dentro

- `src/lib/api.js` mantiene un **espejo en memoria** con la misma forma del
  store original; la app sigue usando `loadStore()/saveStore()` síncronos y el
  espejo se sincroniza con Supabase con *diff + debounce* (~1 s). Indicador:
  los cambios se suben solos; también al cerrar la pestaña (`flushSync`).
- Los **cotejos** se guardan completos en una columna `jsonb` (`data`), con
  columnas espejo (`status`, `published`, `finalizado`...) solo para consultas
  y políticas RLS.
- **RLS:** un estudiante solo ve/edita sus propios cotejos + los publicados;
  docente y admin ven todo. Las imágenes las suben solo docentes/admin.
- Los **estudiantes** inician sesión con su cédula (internamente es el email
  sintético `cedula@est.simusid.app`) y al primer ingreso la app les obliga a
  definir contraseña propia.

## Límites del plan gratuito (sobra para un curso)

- Supabase: 500 MB de BD + 1 GB de Storage (≈ 2.000+ huellas comprimidas) +
  50.000 usuarios activos/mes. Edge Functions: 500K invocaciones/mes.
- Vercel: 100 GB de ancho de banda/mes.

## Notas / pendientes opcionales

- El estudiante puede leer (vía red, no vía UI) el `data` del cotejo modelo
  publicado, que incluye las marcas del docente. Si eso le preocupa para
  evaluaciones, se puede crear una *vista* SQL que limpie `data->leftShapes/
  rightShapes` para estudiantes — pídamelo y lo agrego.
- "Importar backup" del panel admin quedó deshabilitado (los respaldos reales
  se hacen en Supabase → Database → Backups). "Exportar backup" sigue activo.
- Las imágenes guía opcionales van en `public/images/guia_a.jpeg` y `guia_b.jpeg`.
