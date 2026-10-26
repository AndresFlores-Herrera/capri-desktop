# Voz y pantalla

## Micrófono

El botón 🎤 junto a Enviar inicia el dictado local de Windows. Esperá el mensaje
«Escuchando» y hablá una frase. Las palabras se agregan al campo de texto para
revisarlas antes de enviar. Tocar ■ cancela; cerrar o reemplazar el chat también
detiene la escucha. No se escucha continuamente ni se guarda el audio.
La sesión termina automáticamente como máximo a los 30 segundos.

Usa el micrófono predeterminado y el reconocimiento instalado para el idioma de
Capri. Si falta, instalalo en Configuración de Windows > Hora e idioma > Voz.
Ante problemas, verificá el permiso de micrófono para aplicaciones de escritorio.
La voz de ElevenLabs es independiente del reconocimiento local.

Reiniciá Capri para cargar los cambios.

En **Voz** podés elegir Windows o ElevenLabs, activar la lectura de mensajes,
cambiar volumen, probar la voz y detenerla. **Configurar ElevenLabs…** pide
la API key y el Voice ID de tu biblioteca. La clave se guarda cifrada en tu perfil
de Windows y no se entrega al renderer. **Usar clave guardada** permite cambiar
solo la voz. ElevenLabs recibe los textos pronunciados y puede consumir créditos.

En **Ojos · ver pantalla → Adjuntar pantalla a mis mensajes**, activá la captura
de la pantalla seleccionada al enviar cada mensaje de chat. La captura se envía
al proveedor del chat y no se guarda en el historial. No hay captura continua.
Necesitás un modelo con visión en Ollama o un proveedor compatible con imágenes.
El modo Claude Code no admite esta función. Esto permite ver, no controlar
el mouse ni el teclado.

Pruebas con servicios simulados:
`node --test tests/speech.test.js tests/vision.test.js`.
La prueba real requiere configurar una voz y un modelo con visión.
