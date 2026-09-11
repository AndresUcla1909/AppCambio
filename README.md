# Tasas — BCV y USDT P2P

PWA personal para consultar el dólar y el euro del BCV, el precio del USDT en
Binance P2P, y convertir entre divisas y bolívares. Todo el texto va en español
(Venezuela) y la zona horaria de negocio es `America/Caracas`.

Especificación original: [SPEC.md](./SPEC.md).

## Cómo correrla

```bash
npm install
npm run dev          # http://localhost:3000 (o el siguiente libre)
```

| Comando | Para qué |
| --- | --- |
| `npm test` | 53 tests unitarios |
| `npm run tipos` | Chequeo de tipos |
| `npm run build` | Build de producción (webpack, porque Serwist aún no soporta Turbopack) |
| `npm run probar:bcv` | Muestra lo que devuelve el scraping. `-- --guardar` refresca el fixture |
| `npm run probar:p2p` | Muestra el anuncio de Binance que se está eligiendo |

## Dónde viven los datos

**En el navegador del teléfono, no en un servidor.** El historial se guarda en
`localStorage` (`lib/almacen/navegador.ts`), y toda la lógica —variación entre
publicaciones, tasa vigente en una fecha, upsert idempotente— está en
`lib/almacen/logica.ts` como funciones puras, que es lo que cubren los tests.

Esto tiene tres consecuencias que conviene tener presentes:

1. **El historial es de ese aparato.** Por eso Ajustes trae exportar e importar
   un respaldo en JSON. Conviene usarlo de vez en cuando.
2. **Solo crece cuando abres la app.** iOS no permite que una PWA se ejecute en
   segundo plano, así que la captura ocurre al abrirla o al pulsar "Refrescar".
   Los días que no la abras quedan sin registrar y hay que cargarlos a mano
   desde Historial → **+**.
3. **Las tres pantallas son estáticas**, así que el service worker las precachea
   y la app abre completa sin conexión.

Al instalar por primera vez se siembran dos tasas reales del BCV capturadas el
11/09/2026, para que el gráfico no arranque vacío.

## Fuentes

- **BCV** (`lib/bcv/scraper.ts`): scraping de `bcv.org.ve` a través de
  `GET /api/bcv`, que **solo devuelve** la tasa; guardarla es cosa del
  navegador. El rodeo por el servidor es obligatorio porque el sitio del BCV no
  envía cabeceras CORS.

  Las tasas se guardan por su **fecha valor**, no por el día de captura: el BCV
  publica por la tarde la del siguiente día hábil. Los selectores
  (`#dolar strong`, `#euro strong`, `span.date-display-single[content]`) están
  verificados contra el HTML real, guardado como fixture de los tests.

- **Binance P2P** (`lib/binance/p2p.ts`): endpoint no oficial, `tradeType: SELL`.
  Ojo: `transAmount` va en **bolívares**, no en USDT (comprobado: mandar `100`
  devuelve cero resultados). De ahí la consulta en dos pasos. El precio no se
  guarda en ningún lado; lo cachea el CDN una hora.

## Para instalarla en el iPhone

Hace falta desplegarla: iOS solo registra service workers sobre HTTPS, y el
teléfono no alcanza el `localhost` de la PC. Con el repo conectado a Vercel
basta; no hace falta ninguna base de datos.

Después, en Safari: **Compartir → Agregar a inicio**.

## Variables de entorno

Ninguna es obligatoria. `.env.example` queda como referencia por si más
adelante se conecta una base de datos.
