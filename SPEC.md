# SPEC — App personal de tasas (BCV + USDT P2P)

> Documento para Claude Code. Léelo completo antes de escribir código.
> Trabaja por fases, en orden. Al terminar cada fase, verifica los criterios de aceptación y espera confirmación antes de seguir.
> Todo el texto de la interfaz va en español (Venezuela).

---

## 1. Objetivo

PWA personal, instalable en iPhone, que:

1. Muestra la tasa oficial **Dólar BCV** y **Euro BCV** del día, con su variación % respecto a la publicación anterior.
2. Muestra un aproximado de la tasa **USDT en Binance P2P** (precio de venta de 100 USDT), refrescado como máximo cada hora y **sin guardarlo en base de datos**.
3. Tiene una **calculadora bidireccional** Dólares ⇄ Bolívares usando la tasa seleccionada (BCV, Euro o USDT).
4. **Guarda automáticamente la tasa BCV de cada día** en Supabase para llevar un historial.
5. Tiene un **calendario**: al elegir una fecha, la calculadora usa la tasa BCV/Euro vigente ese día.
6. Tiene una vista de **historial** (tabla + gráfico) y permite cargar/corregir tasas manualmente.

Referencia visual: app tipo "Calculadora" en modo oscuro con tres tarjetas de tasa (USDT arriba, Dólar BCV y Euro BCV abajo), la tarjeta seleccionada resaltada en azul, dos campos (Dólares / Bolívares) con botón de copiar cada uno, fecha de última actualización y botón de refrescar.

---

## 2. Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (usar su `Calendar`, basado en react-day-picker, con locale `es`)
- **Supabase**: Postgres, Auth, RLS, `pg_cron` y `pg_net` (Supabase Cron), Vault para secretos
- **Vercel** para el deploy
- **Serwist** (`@serwist/next`) para el service worker de la PWA (no usar `next-pwa`, está sin mantenimiento)
- **cheerio** para parsear el HTML del BCV
- **recharts** para el gráfico del historial
- Zona horaria de negocio: **America/Caracas (UTC-4, sin horario de verano)**. Toda noción de "hoy" se calcula en esa zona, nunca con la hora del servidor.

---

## 3. Modelo de datos (Supabase)

```sql
-- Tasas oficiales BCV. Una fila por "fecha valor".
create table public.tasas_bcv (
  fecha           date primary key,          -- fecha valor publicada por el BCV
  usd             numeric(20,8) not null,
  eur             numeric(20,8),
  fuente          text not null default 'bcv' check (fuente in ('bcv','api_respaldo','manual')),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Vista con variación respecto a la publicación anterior
create view public.tasas_bcv_con_variacion
with (security_invoker = true) as
select
  fecha, usd, eur, fuente,
  lag(usd) over (order by fecha) as usd_anterior,
  lag(eur) over (order by fecha) as eur_anterior
from public.tasas_bcv;

-- Tasa vigente para una fecha: la última publicada con fecha valor <= fecha pedida
-- (fines de semana y feriados no tienen publicación propia)
create or replace function public.tasa_bcv_en(p_fecha date)
returns table (
  fecha date, usd numeric, eur numeric,
  usd_anterior numeric, eur_anterior numeric,
  fecha_solicitada date, es_exacta boolean
)
language sql stable as $$
  select v.fecha, v.usd, v.eur, v.usd_anterior, v.eur_anterior,
         p_fecha, v.fecha = p_fecha
  from public.tasas_bcv_con_variacion v
  where v.fecha <= p_fecha
  order by v.fecha desc
  limit 1;
$$;
```

### RLS

- Activar RLS en `tasas_bcv`.
- `select`: permitido a `anon` y `authenticated` (son datos públicos).
- `insert` / `update`: solo `authenticated` (para la carga manual). El cron escribe con la service role key desde el servidor.
- En Supabase Auth: **desactivar registros nuevos**. Solo existirá mi usuario (email + contraseña o magic link).

### Tabla opcional (Fase 7)

```sql
create table public.calculos_guardados (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
  fecha_tasa  date not null,
  tipo_tasa   text not null check (tipo_tasa in ('bcv_usd','bcv_eur','usdt')),
  tasa        numeric(20,8) not null,
  monto_usd   numeric(20,2) not null,
  monto_bs    numeric(20,2) not null,
  nota        text,
  creado_en   timestamptz not null default now()
);
-- RLS: cada usuario solo ve/crea/borra sus filas (user_id = auth.uid())
```

---

## 4. Fuentes de datos

### 4.1 Tasa BCV (se guarda)

- Fuente principal: scraping de `https://www.bcv.org.ve/`.
  - El dólar suele estar en un contenedor con `id="dolar"` y el euro en `id="euro"`, dentro de un `<strong>`. Formato con coma decimal y 8 decimales (ej. `832,49000000`).
  - La **fecha valor** suele estar en un elemento `span.date-display-single` con atributo `content` en ISO.
  - **Verificar los selectores reales antes de implementar** con un script de prueba; no asumirlos.
- El sitio del BCV ha tenido problemas de certificado SSL (cadena incompleta). Si `fetch` falla por certificado, usar en runtime **Node** un `undici.Agent` con `connect: { rejectUnauthorized: false }` **solo para ese dominio**, nunca global.
- Importante: el BCV publica en la tarde la tasa con fecha valor del **siguiente día hábil**. Guardar siempre por fecha valor, no por la fecha en que se hizo el scraping.
- Respaldo opcional: si el scraping falla, consultar una API pública venezolana de tasas (evaluar opciones activas y documentar cuál se usa) y guardar con `fuente = 'api_respaldo'`.
- Escritura: `upsert` por `fecha` (idempotente; correrlo varias veces al día no duplica).

Endpoint: `POST /api/cron/bcv`
- Runtime Node.
- Protegido con header `Authorization: Bearer ${CRON_SECRET}`; si no coincide, 401.
- Hace scraping → valida (número > 0, fecha válida) → upsert con service role → responde JSON con lo guardado.

Programación con **Supabase Cron** (no depender del cron de Vercel, que en el plan Hobby es muy limitado):

```sql
-- Guardar el secreto en Vault con nombre 'cron_secret' antes de esto
select cron.schedule(
  'scrape-bcv',
  '0 */2 * * *',   -- cada 2 horas (UTC); es idempotente
  $$
  select net.http_post(
    url     := 'https://TU-APP.vercel.app/api/cron/bcv',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

### 4.2 USDT Binance P2P (NO se guarda)

- Endpoint no oficial de Binance: `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`
- Body base:
  ```json
  {
    "asset": "USDT",
    "fiat": "VES",
    "tradeType": "SELL",
    "page": 1,
    "rows": 10,
    "payTypes": [],
    "publisherType": null,
    "transAmount": ""
  }
  ```
  Headers: `Content-Type: application/json` y un `User-Agent` de navegador.
- `tradeType: "SELL"` = el usuario vende USDT (pestaña "Vender" de la web). **Verificar con una llamada real** que el lado sea el correcto comparando con lo que muestra la web de Binance.
- `transAmount` se expresa en **bolívares (fiat), no en USDT**. Lógica para "vender 100 USDT":
  1. Primera llamada sin `transAmount` para obtener un precio de referencia.
  2. Calcular `montoBs = 100 × precioReferencia`.
  3. Segunda llamada con `transAmount = montoBs`, o bien filtrar localmente los anuncios donde `minSingleTransAmount <= montoBs <= maxSingleTransAmount` y `tradableQuantity >= 100`.
  4. Tomar el **segundo anuncio** de la lista resultante (índice 1). Si solo hay uno, usar ese y marcarlo en la respuesta.
- Constantes configurables en un archivo `config.ts`: `MONTO_USDT = 100`, `POSICION_ANUNCIO = 2`, `METODOS_PAGO = []` (ej. para filtrar solo Pago Móvil más adelante).

Endpoint: `GET /api/p2p`
- Respuesta: `{ precio, anunciante, limites: {min, max}, metodosPago, obtenidoEn }`.
- Caché **sin base de datos**: responder con `Cache-Control: public, s-maxage=3600, stale-while-revalidate=300` para que el CDN de Vercel lo guarde máximo 1 hora.
- Configurar la región de la función fuera de EE. UU. (ej. `export const preferredRegion = 'gru1'`, São Paulo), porque Binance puede bloquear peticiones desde IPs de EE. UU. Si Binance responde error o bloqueo, devolver `503` con mensaje claro y la UI muestra "USDT no disponible".
- Como no se guarda, **no hay variación % del USDT**. En su lugar mostrar la **brecha** frente al BCV: `(usdt / usd_bcv − 1) × 100`.

---

## 5. Pantallas y comportamiento

Navegación inferior (estilo de la referencia): **Inicio**, **Historial**, **Ajustes**.

### 5.1 Inicio (calculadora)

- Encabezado "Calculadora" con botón **compartir** (Web Share API; si no está disponible, copiar al portapapeles). Comparte un texto con las tasas y el cálculo actual.
- **Selector de fecha** (shadcn `Calendar` en un popover, locale `es`, semana inicia lunes). Por defecto: hoy en America/Caracas.
- Tarjetas:
  - **USDT** (arriba): precio P2P + brecha vs BCV. Solo disponible cuando la fecha seleccionada es hoy; en fechas pasadas se ve deshabilitada con el texto "Solo tasa actual".
  - **Dólar BCV** y **Euro BCV**: tasa vigente en la fecha seleccionada (vía `tasa_bcv_en`) + variación % con flecha verde (sube) o roja (baja).
  - Tocar una tarjeta la **selecciona** (resaltada en azul) y la calculadora pasa a usar esa tasa.
- Si la fecha elegida no tiene publicación propia (fin de semana/feriado), mostrar aviso discreto: "Sin publicación ese día — usando la tasa del dd/mm/aaaa".
- Si no hay ninguna tasa ≤ fecha, mostrar "No hay tasa registrada para esta fecha" y un botón para cargarla manualmente.
- **Campos Dólares y Bolívares**, bidireccionales: al escribir en uno se calcula el otro. Botón copiar al lado de cada uno (copia el número formateado).
- Entrada numérica: teclado decimal en móvil (`inputMode="decimal"`); aceptar tanto `1.234,56` como `1234.56`. Escribir una función `parsearMonto()` con tests.
- Formato de salida: `Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- Pie: "Act. BCV: dd/mm/aaaa" y "Act. USDT: dd/mm/aaaa, hh:mm a" + botón refrescar.

### 5.2 Historial

- Tabla (más reciente primero): fecha, USD, EUR, variación %, fuente.
- Gráfico de línea del USD BCV con filtros: 7 días, 30 días, 90 días, todo.
- Botón **Exportar CSV**.
- Botón **Agregar/editar tasa** (requiere sesión): formulario fecha + USD + EUR, guarda con `fuente = 'manual'`. Sirve para rellenar días que el cron no capturó.

### 5.3 Ajustes

- Iniciar/cerrar sesión.
- Tasa seleccionada por defecto al abrir (BCV / Euro / USDT).
- Botón "Ejecutar actualización BCV ahora" (llama al endpoint vía una server action que usa el secreto del servidor, nunca desde el cliente directamente).

---

## 6. PWA

- `app/manifest.ts`: `name`, `short_name`, `display: "standalone"`, `theme_color` y `background_color` oscuros, `start_url: "/"`, íconos 192 y 512 (incluir versión `maskable`).
- `apple-touch-icon` 180×180 y metadatos para iOS (`appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`).
- Service worker con Serwist: cachear el shell de la app.
- **Modo offline**: guardar en `localStorage` las últimas tasas vistas (BCV, Euro, USDT con su hora). Sin conexión, la calculadora funciona con esas tasas y muestra "Sin conexión — tasas del dd/mm hh:mm".
- Diseño mobile-first, modo oscuro por defecto, respetar `safe-area-inset` (notch y barra inferior del iPhone).

---

## 7. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # o la publishable key
SUPABASE_SERVICE_ROLE_KEY=            # solo servidor, nunca en el cliente
CRON_SECRET=                          # mismo valor que el guardado en Vault
```

Crear `.env.example` con estas claves vacías.

---

## 8. Estructura sugerida

```
app/
  (tabs)/page.tsx              # Inicio / calculadora
  (tabs)/historial/page.tsx
  (tabs)/ajustes/page.tsx
  api/cron/bcv/route.ts
  api/p2p/route.ts
  manifest.ts
  sw.ts
lib/
  supabase/{client,server,admin}.ts
  bcv/scraper.ts
  binance/p2p.ts
  formato.ts                   # parsearMonto, formatearBs, fechas Caracas
  config.ts
components/
  TarjetaTasa.tsx
  Calculadora.tsx
  SelectorFecha.tsx
supabase/migrations/
scripts/
  probar-bcv.ts                # prueba manual del scraping
  probar-p2p.ts                # prueba manual de Binance
```

---

## 9. Fases de trabajo

**Fase 0 — Verificación de fuentes.** Crear `scripts/probar-bcv.ts` y `scripts/probar-p2p.ts`, ejecutarlos y mostrarme la salida real (selectores del BCV, estructura del JSON de Binance, confirmación del lado SELL y del `transAmount` en fiat). No avanzar si algo no coincide con esta spec; proponer ajustes.

**Fase 1 — Base.** Next.js + Tailwind + shadcn, cliente Supabase, migración SQL (tabla, vista, función, RLS), login.
✅ Puedo iniciar sesión; `select * from tasa_bcv_en(current_date)` funciona con datos de prueba.

**Fase 2 — BCV.** Scraper + `/api/cron/bcv` + upsert + instrucciones SQL del cron.
✅ Llamar al endpoint con el secreto guarda la tasa con su fecha valor; sin secreto responde 401; llamarlo dos veces no duplica.

**Fase 3 — Calculadora y calendario.**
✅ Cambiar la fecha cambia la tasa; fin de semana usa la del último día hábil con aviso; cálculo en ambos sentidos correcto; copiar funciona.

**Fase 4 — USDT P2P.**
✅ `/api/p2p` devuelve el segundo precio para 100 USDT; el header de caché está presente; si Binance falla, la UI no se rompe.

**Fase 5 — Historial.** Tabla, gráfico, exportar CSV, carga manual.

**Fase 6 — PWA.** Manifest, íconos, service worker, modo offline.
✅ Se instala desde Safari → "Agregar a inicio" y abre en pantalla completa; sin conexión la calculadora sigue funcionando.

**Fase 7 — Deploy y extras.** Deploy en Vercel, configurar variables, activar el cron en Supabase, probar de punta a punta. Opcional: guardar cálculos (`calculos_guardados`).

---

## 10. Reglas para Claude Code

- Explica el plan de cada fase antes de ejecutarla.
- No inventes selectores ni campos de API: verifícalos (Fase 0).
- Nunca expongas la service role key ni el `CRON_SECRET` al cliente.
- Las fechas de negocio siempre en America/Caracas.
- Tests unitarios para: `parsearMonto`, formateo es-VE, cálculo de brecha, selección del segundo anuncio P2P y el parseo del HTML del BCV (con un HTML de ejemplo guardado como fixture).
- Código y comentarios en español cuando sea natural; nombres de variables claros.
