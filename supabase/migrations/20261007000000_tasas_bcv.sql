-- Historial de tasas oficiales del BCV.
--
-- La app lo consulta (sólo lectura, con la clave anónima) cuando hay red y la
-- fecha pedida no está en el búfer local de 60 días del teléfono. La escritura
-- queda para el cron del servidor (service role) y para la carga manual de un
-- usuario con sesión.

-- Una fila por "fecha valor": el BCV publica en la tarde la tasa del día hábil
-- siguiente, y se guarda por esa fecha, no por el día en que se capturó.
create table if not exists public.tasas_bcv (
  fecha           date primary key,
  usd             numeric(20,8) not null check (usd > 0),
  eur             numeric(20,8) check (eur is null or eur > 0),
  fuente          text not null default 'bcv'
                  check (fuente in ('bcv', 'api_respaldo', 'manual')),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.tasas_bcv is
  'Tasas oficiales del BCV por fecha valor. Lectura pública; escritura con service role o sesión.';

-- `actualizado_en` lo pone la base, no el cliente: el teléfono lo usa para
-- decidir qué versión gana al fundir con su búfer local.
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists tasas_bcv_actualizado_en on public.tasas_bcv;
create trigger tasas_bcv_actualizado_en
  before update on public.tasas_bcv
  for each row execute function public.tocar_actualizado_en();

-- Cada fila con la publicación anterior, para la variación %.
-- La ventana corre sobre toda la tabla: filtrar la vista por fecha no altera
-- el `lag()` de las filas que quedan.
create or replace view public.tasas_bcv_con_variacion
with (security_invoker = true) as
select
  t.fecha,
  t.usd,
  t.eur,
  t.fuente,
  t.creado_en,
  t.actualizado_en,
  lag(t.usd) over (order by t.fecha) as usd_anterior,
  -- Un euro ausente no borra la referencia anterior (igual que en el teléfono).
  (
    select p.eur
    from public.tasas_bcv p
    where p.fecha < t.fecha and p.eur is not null
    order by p.fecha desc
    limit 1
  ) as eur_anterior
from public.tasas_bcv t;

-- La tasa vigente en una fecha: la última publicada con fecha valor <= la
-- pedida (fines de semana y feriados no tienen publicación propia).
create or replace function public.tasa_bcv_en(p_fecha date)
returns table (
  fecha date,
  usd numeric,
  eur numeric,
  usd_anterior numeric,
  eur_anterior numeric,
  fuente text,
  fecha_solicitada date,
  es_exacta boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.fecha, v.usd, v.eur, v.usd_anterior, v.eur_anterior, v.fuente,
         p_fecha, v.fecha = p_fecha
  from public.tasas_bcv_con_variacion v
  where v.fecha <= p_fecha
  order by v.fecha desc
  limit 1;
$$;

-- RLS: los datos son públicos para leer; escribir requiere sesión.
-- (En Supabase Auth conviene desactivar los registros nuevos.)
alter table public.tasas_bcv enable row level security;

drop policy if exists "tasas_bcv: lectura pública" on public.tasas_bcv;
create policy "tasas_bcv: lectura pública"
  on public.tasas_bcv for select
  to anon, authenticated
  using (true);

drop policy if exists "tasas_bcv: alta con sesión" on public.tasas_bcv;
create policy "tasas_bcv: alta con sesión"
  on public.tasas_bcv for insert
  to authenticated
  with check (true);

drop policy if exists "tasas_bcv: corrección con sesión" on public.tasas_bcv;
create policy "tasas_bcv: corrección con sesión"
  on public.tasas_bcv for update
  to authenticated
  using (true)
  with check (true);

grant select on public.tasas_bcv to anon, authenticated;
grant insert, update on public.tasas_bcv to authenticated;
grant select on public.tasas_bcv_con_variacion to anon, authenticated;
grant execute on function public.tasa_bcv_en(date) to anon, authenticated;
