# Probar Minemarket Tito's gratis en internet

El servidor entrega la interfaz web y la API bajo el mismo enlace. La configuración de `render.yaml` crea una aplicación gratuita en Render. Para la base de datos se recomienda TiDB Cloud Starter, compatible con el protocolo MySQL que usa este proyecto.

## Límites de la opción gratuita

- Render apaga el servicio tras 15 minutos sin visitas. El primer acceso después de la pausa puede tardar cerca de un minuto.
- Render no conserva archivos escritos en el servidor gratuito; por eso el Kardex y los productos se guardan en la base externa TiDB, no en archivos locales.
- TiDB Starter incluye una cuota gratuita de almacenamiento y consultas. Si se alcanza, puede detener nuevas conexiones hasta el reinicio de cuota o el cambio de plan.
- Esta configuración sirve para probar y presentar el proyecto; Render advierte que el plan gratuito no es para producción.

## Publicación

1. Crea una cuenta en TiDB Cloud Starter, selecciona **MySQL-compatible** y crea una instancia.
2. En la pantalla **Connect**, copia el host, usuario y contraseña de la conexión pública. Usa puerto `4000`, base `test` y TLS habilitado.
3. Publica este repositorio en GitHub y conéctalo a Render como Blueprint. Render leerá `render.yaml`; selecciona el plan gratuito y completa `DB_HOST`, `DB_USER` y `DB_PASSWORD` cuando lo solicite.
4. Cuando Render termine, abre la URL `onrender.com` generada. Esa será la dirección del sistema.
5. Antes de iniciar sesión, importa la base existente desde tu computadora. En PowerShell, establece temporalmente `DB_HOST`, `DB_USER` y `DB_PASSWORD` con los valores de TiDB, y ejecuta:

   ```powershell
   $env:DB_PORT = '4000'
   $env:DB_NAME = 'test'
   $env:DB_SSL = 'true'
   node backend/scripts/importar-respaldo-remoto.js
   ```

El respaldo contiene usuarios, productos, movimientos, alertas y Kardex. Se guarda localmente en `outputs/minemarket-titos-database.sql` y está excluido de Git para no publicarlo junto al código. No compartas la contraseña de TiDB ni agregues ese archivo al repositorio.
