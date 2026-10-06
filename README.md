# 🧩 Rompecabezas Colaborativo

Subí una imagen, se convierte automáticamente en un rompecabezas con piezas de
"tabs" curvos, y se arma en tiempo real con quien quieras dentro de una sala
compartida (código de 6 caracteres o enlace directo).

- **Next.js 16** (App Router, TypeScript, Tailwind)
- **Konva / react-konva** para el tablero (piezas arrastrables, zoom y paneo)
- **Firebase Realtime Database** para sincronizar posiciones de piezas y
  presencia de jugadores en vivo
- **Firebase Storage** para alojar la imagen subida

No hace falta correr ningún servidor propio — todo el tiempo real lo maneja
Firebase. La app no usa Firebase Auth: la identidad de cada jugador es un id
propio generado en el navegador (guardado en `localStorage`), suficiente para
presencia y para saber quién sostiene cada pieza.

## ✅ Ya está funcionando con `lenovo-experiences`

`.env.local` tiene las credenciales del proyecto Firebase
**`lenovo-experiences`** (cuenta `contactogeniality@gmail.com`), compartido
con otras apps de la empresa (`game`, `espacio-inteligente`, `ap_game`, etc.).
Probé el flujo real (crear sala, subir imagen) de punta a punta y **no hace
falta tocar nada más**:

- **Realtime Database** ya tiene `".read": true, ".write": true` en la raíz
  de las reglas — eso ya cubre `/rooms`, así que no agregué ni cambié nada
  ahí (evité tocar el archivo de reglas de un proyecto compartido).
- **Storage** ya tiene, al final de sus reglas, un `match /{allPaths=**} {
  allow read, write: if true; }` que cubre cualquier ruta no listada
  explícitamente — incluida `rooms/{roomId}/image.jpg`, que usa esta app.

Es decir: subestimé al principio y pensé que hacía falta Auth anónimo y
reglas nuevas, pero verificando las reglas reales del proyecto no hace falta
ninguna de las dos cosas. Si en algún momento quisieran reglas más estrictas
específicas para `/rooms` (por ejemplo, limitar el tamaño de imagen en
Storage en vez de depender del catch-all abierto), dejo el snippet opcional
más abajo.

Si preferís separar esto a un proyecto Firebase propio (recomendable si este
juego va a tener uso real, para no compartir cuota/facturación con
producción), avisame y creo uno nuevo con el Firebase CLI.

## Variables de entorno (si necesitás usar otro proyecto)

`.env.local` ya está completo. Si en algún momento apuntás a otro proyecto
Firebase, copiá `.env.local.example` y completá cada valor con los datos de
`firebaseConfig` de ese proyecto (Configuración del proyecto → Tus apps →
app Web):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Mientras estas variables no estén completas, la app muestra un aviso de
"Falta configurar Firebase" en vez de romperse. Asegurate también de que ese
otro proyecto tenga Realtime Database y Storage creados, con reglas que
permitan leer/escribir bajo `/rooms` (ver snippet opcional más abajo) — esta
app no usa Firebase Auth, así que las reglas no pueden exigir `auth != null`
a menos que agregues autenticación vos mismo.

### Reglas opcionales más estrictas para `/rooms`

No hacen falta en `lenovo-experiences` (ya queda cubierto por las reglas
abiertas existentes), pero si algún día querés limitar específicamente esta
app — por ejemplo tope de tamaño de imagen — podés sumar esto a las reglas
de Storage existentes, sin reemplazar las demás:

```
match /rooms/{roomId}/{fileName} {
  allow read: if true;
  allow write: if request.resource.size < 15 * 1024 * 1024
               && request.resource.contentType.matches('image/.*');
}
```

## Correr en local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Para probarlo con otra
persona en la misma red, usá la IP de tu máquina
(`http://TU-IP-LOCAL:3000`) o un túnel como `ngrok http 3000`.

## Cómo funciona

- La forma de cada pieza (los "tabs" curvos) se genera de forma determinística
  a partir de una semilla numérica guardada en la sala — todos los
  navegadores calculan exactamente las mismas piezas sin transmitir su
  geometría por la red.
- Solo la **posición** de cada pieza viaja por Firebase Realtime Database, en
  vivo, mientras se arrastra (con throttling para no saturar la conexión).
- Cuando alguien suelta una pieza cerca de su lugar correcto, se "engancha"
  automáticamente y queda bloqueada para que nadie la mueva por error.
- Mientras alguien arrastra una pieza, esa pieza queda bloqueada para el
  resto (con un halo del color de quien la sostiene) hasta que la suelta.
- La lista de jugadores conectados y el progreso (piezas colocadas/total) se
  actualizan en vivo para todos.

### Modo Competencia (⚔️)

Al crear una sala se puede elegir modo **Competencia** en vez de
Colaborativo: Equipo Rojo 🔴 contra Equipo Azul 🔵, cada uno arma **su
propia copia** del mismo rompecabezas (misma imagen y mismas piezas, pero
posiciones independientes por equipo — no comparten tablero).

- Quien entra a una sala de competencia primero elige equipo (con contador
  de jugadores en vivo por equipo).
- Las piezas quedan bloqueadas hasta que alguien aprieta **"Iniciar
  carrera"** — a partir de ahí corre un cronómetro y se ve el progreso de
  ambos equipos en vivo, uno al lado del otro.
- Apenas un equipo coloca su última pieza, se declara ganador (con el
  tiempo final) y el tablero se bloquea para los dos equipos.
- La detección de "equipo completo" corre en el navegador de quien coloca
  la última pieza — no hay backend propio — así que basta con que alguien
  del equipo ganador siga conectado en el momento de terminar.

## Estructura del proyecto

```
lib/puzzleGeometry.ts   Generador determinístico de la forma de las piezas
lib/piecesRender.ts     Recorta la imagen en bitmaps individuales por pieza
lib/room.ts             Crear sala, subir imagen, piezas, equipos y estado de carrera
lib/presence.ts         Jugadores conectados (Realtime Database + onDisconnect)
lib/firebase.ts         Inicialización de Firebase (Database/Storage)
components/PuzzleStage.tsx   Tablero interactivo (Konva): zoom, paneo, drag & drop
components/TeamPicker.tsx    Selector de equipo (modo Competencia)
components/RaceBar.tsx       Progreso dual, cronómetro y banner de ganador
app/sala/[roomId]/           Página de una sala
app/page.tsx                 Inicio: crear sala (colab/versus) / unirse a una sala
```
