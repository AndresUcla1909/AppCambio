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
| `npm test` | 167 tests (incluye el lector de precios con los modelos reales y el PDF de compras) |
| `npm run tipos` | Chequeo de tipos |
| `npm run build` | Build de producción (webpack, porque Serwist aún no soporta Turbopack) |
| `npm run probar:bcv` | Muestra lo que devuelve el scraping. `-- --guardar` refresca el fixture |
| `npm run probar:p2p` | Muestra el anuncio de Binance que se está eligiendo |

## Dónde viven los datos

**Primero en el teléfono, y opcionalmente en Supabase.**

- **Búfer local de 60 días** (`lib/almacen/buffer.ts`, `navegador.ts`): las
  tasas BCV y un USDT por día viven en `localStorage`. Cada escritura descarta
  lo que pasó de los 60 días (se conserva la última anterior como ancla, para
  que el primer día de la ventana tenga tasa vigente). Las pantallas lo leen
  como estado con `useSyncExternalStore` (`lib/almacen/hooks.ts`).
- **Supabase, sólo lectura** (`lib/supabase/tasas.ts`, migración en
  `supabase/migrations/`): si están `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, al abrir la app se traen los últimos 60 días
  al búfer, y las fechas que no estén en el teléfono se consultan ahí. Sin
  esas variables, la app funciona sólo con el búfer.
- **Orden de búsqueda** (`lib/tasas/resolver.ts`, con tests): búfer → Supabase
  (si hay red y lo local no basta) → lo mejor que haya en el teléfono. Si la
  tasa usada tiene más de 4 días (`DIAS_MAX_SIN_ACTUALIZAR`), se avisa
  "Tasa desactualizada (del DD/MM)".

Consecuencias que conviene tener presentes:

1. **El historial completo vive en Supabase** (desde octubre de 2021, ver
   `supabase/seed-bcv-2021.sql`). El teléfono sólo guarda 60 días; sin
   Supabase, lo anterior se pierde.
2. **El búfer sólo crece cuando abres la app** (o desde Supabase). iOS no
   permite que una PWA se ejecute en segundo plano. Los días que falten se
   cargan a mano desde Historial → **+**.
3. **Las pantallas son estáticas**, así que el service worker las guarda y la
   app abre sin conexión. Las respuestas de `/api/*` y de Supabase nunca salen
   de su caché: una tasa vieja no debe pasar por actual.

La **tasa por defecto** (la que queda seleccionada al abrir la app) se elige
en el menú lateral de la calculadora (`components/MenuLateral.tsx`); tocar
una tarjeta cambia la tasa del momento, no la de por defecto.

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

## Modo cámara

El botón **Cámara** de la calculadora abre la cámara trasera: se encuadra un
precio en el recuadro y aparece convertido en vivo con la tasa elegida (USDT,
Dólar o Euro BCV). Se puede indicar si el precio está en divisa o en
bolívares, pausar la imagen y llevar el monto a la calculadora.

- **Todo ocurre en el teléfono.** El texto lo leen los modelos PP-OCRv6 tiny
  de PaddleOCR (detección + reconocimiento, licencia Apache 2.0) con ONNX
  Runtime Web, dentro de un worker (`lib/ocr/trabajador.ts`) para que la
  imagen no se trabe. La foto no sale del aparato.
- **Piezas** (todas en `lib/ocr/`, sin dependencias del navegador salvo el
  worker y `lector.ts`): `deteccion.ts` encuentra los renglones,
  `reconocimiento.ts` los lee, `geometria.ts` mide cada mancha de tinta,
  `motor.ts` lo orquesta y `precio.ts` decide cuál es el precio.
- **Cómo elige el precio** (con tests): el número escrito más grande del
  recuadro, ignorando medidas, porcentajes y códigos de barras ("1kg",
  "500 g", "20%"). A igual tamaño gana el que lleva moneda o céntimos. Los
  céntimos pequeños ("5⁷⁹") se detectan por el tamaño de la tinta y se
  vuelven a leer ampliados, porque el OCR tiende a pegarlos ("579"). En
  pantalla sólo cambia cuando la misma lectura se repite, para que no
  parpadee.
- **Precisión medida**: 87 % de aciertos sobre 93 etiquetas (45 fotos reales
  de Wikimedia Commons y 48 sintéticas al estilo venezolano, con desenfoque,
  reflejos y perspectiva), contra 26 % del lector anterior (Tesseract). Falla
  sobre todo con precios escritos a mano.
- **Los modelos van en el repo** (`modelos/ocr/`, ~6 MB) y llevan su versión
  en el nombre. `scripts/copiar-ocr.mjs` los copia a `public/ocr/` junto con
  el motor WASM de `node_modules` en cada `npm install` y antes de cada
  build; esa carpeta no va al repo.
- **La primera vez descarga unos 10 MB.** El service worker los guarda en la
  caché `ocr` y desde entonces funciona sin conexión. No van en el precache
  para no hacer pesada la instalación. Si la cámara ya se usó, al abrir la
  app el lector se carga en segundo plano para que esté listo al tocar
  "Cámara".
- **Necesita HTTPS** (o `localhost`): los navegadores no dan la cámara en una
  conexión sin cifrar.

## Compras

La pestaña **Compras** es un carrito para ir anotando precios en la tienda:
escaneándolos con la cámara (el botón pasa a ser "Agregar al carrito" y la
cámara queda abierta para el siguiente) o escribiéndolos a mano.

- **Todo en $ y en Bs a la tasa BCV vigente.** Cada artículo guarda el precio
  en la moneda en que estaba marcado; la otra se calcula al momento. Los
  subtotales se redondean a céntimos y los totales los suman, para que cuadre
  con lo que se ve renglón por renglón.
- **Cantidades con decimales** (0,5 kg de queso) y nombre opcional (sin
  nombre sale "Artículo N").
- **Descuentos por porcentaje**, en cada artículo y a todo el carrito. Se
  combinan: el general se aplica sobre lo que ya quedó con los descuentos de
  cada artículo, como un descuento adicional en la caja. Se muestra cuánto se
  ahorra.
- **Exportar a PDF** con el título que se le ponga a la lista: tabla con
  precios y subtotales en las dos monedas, descuentos, total y la tasa usada.
  Lo genera jsPDF en el teléfono (también sin conexión); en el iPhone se
  ofrece la hoja de compartir para guardarlo en Archivos o mandarlo.
- **Se guarda en este teléfono** (`localStorage`) en cada cambio, así que no
  se pierde si iOS cierra la app a mitad de la compra.

La lógica (conversión, descuentos, totales) está en `lib/compras/logica.ts` y
el PDF en `lib/compras/pdf.ts`, ambos con tests.

## Para instalarla en el iPhone

Hace falta desplegarla: iOS solo registra service workers sobre HTTPS, y el
teléfono no alcanza el `localhost` de la PC. Con el repo conectado a Vercel
basta; no hace falta ninguna base de datos.

Después, en Safari: **Compartir → Agregar a inicio**.

## Captura automática (cron)

Supabase tiene el historial oficial del BCV desde la reconversión de octubre
de 2021 (`supabase/seed-bcv-2021.sql`). Para que siga creciendo solo, aunque
nadie abra la app:

```
Supabase Cron (cada 2 h) ──► POST /api/cron/bcv  (Authorization: Bearer CRON_SECRET)
                                  └─► lee bcv.org.ve y guarda en tasas_bcv con la secret key
```

- `app/api/cron/bcv/route.ts` + `lib/supabase/escritura.ts` (con tests). Es
  idempotente: si la tasa ya está guardada no escribe. No guarda una tasa con
  un salto de más del 25 % frente a la anterior ni con una fecha absurda:
  responde 422 para que alguien lo revise.
- `supabase/cron-bcv.sql` programa la llamada con pg_cron + pg_net y guarda
  la URL y el secreto en el Vault.

## Variables de entorno

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador y servidor | Proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador | Clave publishable: sólo lee (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **sólo servidor** | Secret key: el cron escribe con ella |
| `CRON_SECRET` | **sólo servidor** | Contraseña de `/api/cron/bcv`; la misma en el Vault |

Sin las de Supabase, la app funciona sólo con el búfer local. Las
`NEXT_PUBLIC_*` se incrustan al construir: tras cambiarlas en Vercel hay que
volver a desplegar.
