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
| `npm test` | 114 tests (incluye el lector de precios con los modelos reales y el PDF de compras) |
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

## Variables de entorno

Ninguna es obligatoria. `.env.example` queda como referencia por si más
adelante se conecta una base de datos.
