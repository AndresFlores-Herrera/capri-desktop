# Abrir aplicaciones

Pedí «Abrí Discord», «Abrime VS Code» o «Por favor abrí Word» en el chat.
Capri busca en Inicio, accesos directos del escritorio e Inicio, App Paths del
registro de Windows y juegos de Steam y Epic. Reconoce alias habituales y nombres
sin tildes; ante nombres ambiguos, pedí el nombre completo.

Para aplicaciones portátiles o no detectadas, usá **Aplicaciones → Agregar
aplicación…**, elegí su `.exe` o `.lnk` y luego pedila por el nombre del archivo.
**Quitar aplicación agregada** solo borra su registro en Capri, no desinstala.
**Actualizar lista de aplicaciones** vuelve a consultar Windows; una búsqueda
sin resultados también actualiza la lista.

Solo se abren entradas del inventario; el chat no se interpreta como un comando
de consola. Los errores nativos se muestran en el chat. Que Windows acepte la
apertura no garantiza que el programa termine de arrancar.

Pruebas: `node --test tests/launch.test.js`.
