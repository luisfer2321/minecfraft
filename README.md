# Minecfraft

Un clon de Minecraft que se juega en el navegador, hecho con JavaScript y [Three.js](https://threejs.org/).

## Características

- Mundo infinito generado por procedimientos (ruido simplex) a partir de una semilla: llanuras, colinas,
  montañas nevadas, playas, océanos, bosques y cuevas.
- Minerales de carbón y hierro, roca madre y árboles que cruzan los bordes de los chunks.
- Carga y descarga de chunks alrededor del jugador, con distancia de renderizado ajustable.
- Mallado con sólo las caras visibles, sombreado por cara y oclusión ambiental por vértice.
- Texturas pixeladas generadas por código (no hace falta ningún archivo de imagen).
- Se juega con ratón y teclado o con la pantalla táctil del móvil.
- Física del jugador: gravedad, salto, colisiones, nadar en el agua, correr y modo vuelo.
- Romper, colocar y copiar bloques; barra rápida de 9 ranuras e inventario con 15 bloques.
- Ciclo de día y noche con sol, luna, estrellas y nubes.
- Guardado automático en el navegador (`localStorage`): mundo, posición, hora y barra rápida.

## Cómo jugar

El juego usa módulos de JavaScript, así que hay que servirlo con un servidor web (abrir `index.html`
directamente con `file://` no funciona). Desde la carpeta del proyecto:

```sh
python3 -m http.server 8000
# o bien
npx serve .
```

Luego abre <http://localhost:8000> y pulsa **Jugar**. Se necesita conexión a internet para descargar Three.js
desde unpkg.

También se puede publicar tal cual en GitHub Pages.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / flechas | Moverse |
| Espacio | Saltar, nadar hacia arriba, subir al volar |
| Shift | Correr (bajar al volar) |
| Ctrl | Correr |
| F | Activar o desactivar el vuelo |
| Clic izquierdo | Romper bloque |
| Clic derecho | Colocar bloque |
| Clic central | Copiar el bloque apuntado a la barra rápida |
| 1–9 / rueda del ratón | Elegir bloque |
| E | Inventario |
| F3 | Información de depuración |
| Esc | Pausa |

Si el navegador no deja bloquear el ratón, el juego sigue funcionando: arrastra el ratón para mirar,
haz clic para romper y clic derecho para colocar.

En el móvil aparecen controles táctiles: arrastra en la mitad izquierda para moverte y en la derecha para
mirar; los botones sirven para saltar, bajar, volar, romper, poner y abrir los bloques.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html` | Página, estilos e interfaz (menú, barra rápida, inventario) |
| `src/main.js` | Renderizado, carga de chunks, controles, interacción, día/noche y guardado |
| `src/world.js` | Generación del terreno, cuevas y árboles; lectura y escritura de bloques |
| `src/mesher.js` | Construcción de la geometría de cada chunk |
| `src/player.js` | Física y colisiones del jugador |
| `src/blocks.js` | Definición de los bloques |
| `src/textures.js` | Atlas de texturas e iconos generados por código |
| `src/noise.js` | Ruido simplex y funciones hash con semilla |
