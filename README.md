# Tasas — BCV y USDT P2P

PWA personal para consultar el dólar y el euro del BCV, el precio del USDT en
Binance P2P, y convertir entre divisas y bolívares. Todo el texto va en
español (Venezuela) y la zona horaria de negocio es `America/Caracas`.

Especificación completa: [SPEC.md](./SPEC.md).

## Cómo correrla

```bash
npm install
npm run dev          # http://localhost:3000 (o 3001 si el 3000 está ocupado)
```

Otros comandos:

| Comando | Para qué |
| --- | --- |
| `npm test` | Tests unitarios (parseo de montos, formato es-VE, brecha, selección P2P, HTML del BCV) |
| `npm run tipos` | Chequeo de tipos |
| `npm run build` | Build de producción (usa webpack porque Serwist aún no soporta Turbopack) |
| `npm run capturar` | Lee el BCV y guarda la tasa, sin levantar el servidor |
| `npm run probar:bcv` | Muestra lo que devuelve el scraping. `-- --guardar` refresca el fixture de tests |
| `npm run probar:p2p` | Muestra el anuncio de Binance que se está eligiendo |

## Dónde viven los datos

Ahora mismo el historial es un archivo JSON en `datos/tasas.json`, detrás de la
interfaz `RepositorioTasas` (`lib/almacen/tipos.ts`). Cambiar a Supabase es
escribir una segunda implementación y elegirla en `lib/almacen/index.ts`; el
resto de la app no se entera.

**Esto no sobrevive al deploy**: el sistema de archivos de Vercel es efímero.
Hay que conectar Supabase antes de subirlo.

## Fuentes

- **BCV** (`lib/bcv/scraper.ts`): scraping de `bcv.org.ve`. La tasa se guarda por
  su **fecha valor**, no por el día en que se capturó — el BCV publica por la
  tarde la del siguiente día hábil. Los selectores (`#dolar strong`,
  `#euro strong`, `span.date-display-single[content]`) están verificados contra
  el HTML real, guardado como fixture en `lib/bcv/__fixtures__/bcv.html`.
- **Binance P2P** (`lib/binance/p2p.ts`): endpoint no oficial, `tradeType: SELL`.
  Ojo: `transAmount` va en **bolívares**, no en USDT (comprobado: mandar `100`
  devuelve cero resultados). Por eso se consulta en dos pasos. El precio no se
  guarda en ningún lado; lo cachea el CDN una hora.

## Variables de entorno

Copia `.env.example` a `.env.local`. En desarrollo basta con `CRON_SECRET`
(o dejarlo vacío, que abre el endpoint en localhost).

## Lo que falta

- Supabase: tablas, RLS, login y el cron con `pg_cron`.
- Deploy en Vercel.
- El service worker sólo se activa en el build de producción.
