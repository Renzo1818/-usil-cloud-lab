# Descubre el Perú

Aplicación de turismo del Perú con login, saludo personalizado y bienvenida protegida. Presenta Machu Picchu, lago Titicaca, líneas de Nasca, Arequipa, Paracas e Iquitos mediante tarjetas e ilustraciones CSS locales.

## 1. Preparar Codespaces

Abre este repositorio en **Code → Codespaces**. La configuración incluida prepara Node 24 y Docker sin añadir servicios al Compose de la aplicación.

```bash
node --version
docker version
docker compose version
```

Docker debe mostrar cliente y servidor. Si aparece `permission denied` sobre `/var/run/docker.sock`, revisa `id` y `ls -l /var/run/docker.sock`, y reconstruye/reabre el Codespace con la configuración incluida. No hagas público el socket ni cambies sus permisos a `666`. En la ejecución asistida se logró acceder al motor mediante el permiso de ejecución correspondiente.

Versiones de las imágenes: Node `24.21.0-bookworm-slim`, Nginx `1.28.0-alpine` y PostgreSQL `17.11-bookworm`. Dependencias npm fijadas en `package-lock.json`.

## 2. Configurar y levantar el proyecto

Desde la raíz:

```bash
node scripts/generate-env.js
docker compose up -d --build --wait
docker compose ps
curl -f http://localhost/health
curl -f http://localhost/ready
```

El generador crea `.env` con permisos `600`, contraseñas aleatorias y un secreto de sesión; no imprime sus valores ni sobrescribe un archivo existente. `.env` está excluido de Git y del contexto Docker. `.env.example` contiene únicamente ejemplos de configuración. Para instalar dependencias fuera de Docker: `npm ci --no-audit --no-fund`.

### Si PostgreSQL está healthy pero la app no conecta

En este Codespace se detectó una política `FORWARD DROP` de `iptables-legacy` anterior al motor Docker actual. Bloqueaba el tráfico entre contenedores. Si se reproduce exactamente ese problema:

```bash
bash scripts/repair-codespace-network.sh
docker compose up -d --wait app proxy
```

El script comprueba esa política y permite únicamente tráfico dentro de cada bridge conectado a app. Requiere `sudo`; no cambia la política global ni publica la base. Las reglas son propias del entorno y deben reaplicarse si se recrean las redes. No es necesario en instalaciones Docker sin ese bloqueo.

### Abrir desde Codespaces por HTTPS

En la pestaña **Ports**, reenvía el puerto **80**, mantenlo privado y usa **Open in Browser**. Antes de autenticarte desde esa URL HTTPS, cambia estas dos líneas en tu `.env` privado:

```dotenv
COOKIE_SECURE=true
PROXY_SCHEME=https
```

Aplica los cambios:

```bash
docker compose up -d --wait --force-recreate app proxy
```

Para usar el navegador por `http://localhost`, vuelve a `COOKIE_SECURE=false` y `PROXY_SCHEME=http` y recrea app/proxy. No uses ambos modos simultáneamente: las cookies Secure no se envían por HTTP. Las comprobaciones `/health` y `/ready` siguen disponibles por HTTP en ambos modos.

El proxy establece el esquema desde la configuración, sin aceptar el encabezado enviado por el visitante. `TRUST_PROXY=172.30.10.2` confía únicamente en la IP fija del Nginx local. La red frontal usa `172.30.10.0/24`; si entra en conflicto con otra red, cambia la subred, la IP de proxy y `TRUST_PROXY` de forma consistente.

### Credenciales de demostración

| Usuario | Nombre | Contraseña en `.env` |
| --- | --- | --- |
| `demo_ana` | Ana Torres | `SEED_USER1_PASSWORD` |
| `demo_luis` | Luis Ramos | `SEED_USER2_PASSWORD` |

Abre `.env` en tu editor privado para consultar las contraseñas. No lo captures en pantalla ni lo pegues en logs, commits o chat. Cambiar una variable de seed después de crear el usuario **no cambia su contraseña almacenada**.

## 3. Servicios e inicialización

```text
Navegador → Nginx :80 → aplicación :8080 → PostgreSQL :5432
                         │                    │
                    red frontal          red interna → volumen
```

Compose mantiene exactamente tres servicios: `proxy`, `app` y `db`. Solo el proxy publica un puerto. App y DB comparten una red con `internal: true`; Nginx no pertenece a esa red. El volumen `postgres_data` conserva `/var/lib/postgresql/data`. La aplicación usa `db`, nunca `localhost`, como host de PostgreSQL.

El arranque espera PostgreSQL con reintentos limitados, aplica `db/migrations/001_init.sql` en transacción con bloqueo asesor y crea solo los usuarios ausentes cuando `SEED_ENABLED=true`. Los hashes bcrypt se generan en ejecución con coste 12. El esquema no incluye contraseñas ni hashes precalculados. El inicializador también funciona en la base administrada de Blitz y no requiere extensiones.

Para repetir la inicialización:

```bash
docker compose exec -T app npm run init-db
```

Después de verificar los dos usuarios, puedes establecer `SEED_ENABLED=false`, retirar `SEED_USER1_PASSWORD` y `SEED_USER2_PASSWORD` y recrear la aplicación. Guarda previamente las credenciales de demostración en un lugar privado; el seed desactivado no necesita esas variables.

| Variable | Configuración |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL; local apunta a `db`, cloud la proporciona Blitz |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Solo inicialización del PostgreSQL local |
| `SESSION_SECRET` | Al menos 32 bytes, generado aleatoriamente |
| `PORT` | `8080` en contenedor y Blitz |
| `COOKIE_SECURE` | `false` para HTTP local; `true` para HTTPS |
| `PROXY_SCHEME` | `http` o `https`, solo Nginx local |
| `TRUST_PROXY` | `false`, `loopback` o IP/CIDR explícitas del proxy real |
| `SEED_ENABLED` | Activa creación de usuarios ausentes |
| `SEED_USER1_PASSWORD`, `SEED_USER2_PASSWORD` | Solo con seed activo; entre 12 y 72 bytes |
| `NODE_ENV` | `production` en despliegue |
| `DOCKERHUB_USERNAME`, `APP_VERSION` | Namespace real y versión de publicación |

Las sesiones duran 30 minutos y se almacenan en PostgreSQL. Las cookies usan HttpOnly y SameSite=Lax. Las consultas de autenticación están parametrizadas, los nombres se escapan con EJS y los formularios llevan CSRF. El login limita a 10 intentos por IP cada 15 minutos mediante memoria de una instancia; reiniciar borra ese contador. Tras el reenvío de Codespaces varios visitantes pueden compartir IP y límite. No es un limitador distribuido.

## 4. Pruebas

### Integración con una base temporal aislada

Con los servicios levantados:

```bash
bash scripts/test-local.sh
```

Se crea una base temporal `test_peru_...`, se ejecutan las pruebas y se elimina únicamente esa base al terminar. El usuario de pruebas necesita permiso `CREATEDB`, disponible en el PostgreSQL local inicializado por la imagen oficial. No ejecutar esta suite contra la base administrada o una base ajena. Las pruebas se ejecutan dentro del contenedor app existente; no añaden servicios.

Comprueba ambos usuarios, regeneración de sesión, cookies, logout con reutilización de cookie anterior, acceso sin sesión, errores genéricos, SQL malicioso, CSRF, escape HTML, límite de intentos, hashes, inicialización repetible y disponibilidad sin DB. Sin `DATABASE_URL`, la integración se omite: eso no demuestra que la autenticación funcione.

### Smoke test a través de Nginx

Con la configuración HTTP local y seed todavía disponible en las variables:

```bash
docker compose exec -T app npm run smoke
```

Gestiona cookies y tokens CSRF para verificar login, bienvenida y logout de ambos usuarios. Para una URL HTTPS accesible desde el contenedor puede indicarse `TEST_BASE_URL`; una URL privada de Codespaces requiere además autenticación de GitHub y debe comprobarse desde el navegador.

### Persistencia real

Ejecutar en modo HTTP local y con ambos usuarios creados:

```bash
bash scripts/verify-persistence.sh
```

El script crea una fila de control ajena al seed, detiene app/proxy, recrea `db` sin eliminar el volumen, espera disponibilidad y compara identificador, usuario y fecha originales. Después retira solo su fila de control y repite login con ambos usuarios. No utiliza `down -v`. Si falla, intenta restablecer app/proxy; revisa el error antes de repetirlo.

## 5. Publicar en Docker Hub

Repositorio público creado: [renzo1818/descubre-peru](https://hub.docker.com/r/renzo1818/descubre-peru). Los siguientes comandos reproducen la construcción y publicación con tu sesión de Docker. Configura las variables en tu terminal; no escribas tokens en comandos guardados:

```bash
read -r -p 'Namespace Docker Hub: ' DOCKERHUB_USERNAME
export DOCKERHUB_USERNAME
export APP_VERSION=1.0.0
docker login --username "$DOCKERHUB_USERNAME"
# Introduce tu access token en el prompt seguro de Docker.
docker buildx build --platform linux/amd64 \
  -t "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION" --load .
docker image inspect "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION" \
  --format '{{.Os}}/{{.Architecture}} usuario={{.Config.User}}'
docker push "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION"
```

Imagen publicada y verificada: `renzo1818/descubre-peru:1.0.0`.

Digest del índice: `sha256:0c6cc84e3028430be63a181ad3493224c0dc713830ceed9617636375c882607f`.

La plataforma ejecutable es `linux/amd64`; la entrada adicional `unknown/unknown` es la atestación de construcción, no otra arquitectura de ejecución. No sobrescribas una etiqueta entregada: usa `1.0.1` para la siguiente corrección. Nginx y PostgreSQL usan imágenes oficiales; no necesitas copiarlas a tu cuenta.

## 6. Desplegar en Blitz Cloud

Paso pendiente de publicación y acceso a la cuenta. No desplegar el Compose, Nginx ni un PostgreSQL propio en Blitz.

1. Verifica la cuenta y los límites del plan en el panel antes de crear recursos.
2. Selecciona **Host something new → An app from Docker Hub** y elige la imagen pública y su versión.
3. Confirma el puerto **8080** y activa **Needs a database → PostgreSQL**. Conserva la `DATABASE_URL` que proporciona Blitz; no copies la URL local.
4. Configura `NODE_ENV=production`, `PORT=8080`, un `SESSION_SECRET` aleatorio, `COOKIE_SECURE=true`, `SEED_ENABLED=true` y las dos contraseñas ficticias mediante el panel privado.
5. Para identificar el proxy, inicia con `TRUST_PROXY=false`. Abre `/login` en la URL HTTPS y consulta el log «Entrada HTTPS observada desde …». La dirección procede de la conexión TCP, no del valor de una cabecera del visitante. Verifica que corresponde al proxy de Blitz y configura esa IP en `TRUST_PROXY`; si tiene varios proxies, utiliza únicamente su rango documentado. Nunca uses `true` ni `0.0.0.0/0`. Sin esa configuración no se emitirá la cookie Secure y el login quedará pendiente. Si no aparece el log, confirma la topología con el proveedor.
6. Inicia el despliegue. El comando de arranque inicializa tablas y usuarios antes de ejecutar el servidor. Revisa logs sanitizados y `/ready`.
7. Abre la URL HTTPS real: prueba ambos usuarios, credenciales inválidas, logout y bienvenida desde una ventana privada.
8. Desactiva el seed, retira sus dos secretos y verifica que los usuarios existentes siguen entrando.
9. Registra aquí la URL comprobada y la referencia de imagen utilizada.

La base administrada es privada; no abras puertos ni añadas endpoints administrativos para inicializarla. El volumen Docker es evidencia local, no el almacenamiento de la base administrada.

Según las [condiciones publicadas de Blitz](https://blitz.cloud/pricing/), consultadas el 21 de octubre de 2026 (Lima), el plan gratuito incluye una base administrada y suspensión de apps tras 30 minutos sin visitas. Comprueba de nuevo el panel antes del despliegue; no se ha contratado ningún plan ni creado recursos cloud en esta implementación.

## 7. Logs, reinicio y detención

```bash
docker compose logs --tail=50 app
docker compose ps
docker compose restart app
docker compose down
```

`down` conserva el volumen. **`docker compose down -v` elimina los datos**: no usar en las pruebas ni antes de la exposición. No se ejecuta limpieza automática al terminar.

Si `/ready` devuelve 503, comprueba DB y variables. Si el login vuelve al formulario tras autenticar, revisa `COOKIE_SECURE`, `PROXY_SCHEME` y `TRUST_PROXY`. Si faltan variables, genera `.env` o completa su configuración. Cambiar `POSTGRES_PASSWORD` en `.env` no actualiza una base ya inicializada: restaura el valor original o cambia la contraseña de forma controlada. No compartas salidas completas de `docker inspect` o `docker compose config`, pues pueden contener secretos.

## Estado de verificación

Verificado el 21 de octubre de 2026 (Lima), en GitHub Codespaces:

| Comprobación | Resultado observado |
| --- | --- |
| `docker compose ps` | `proxy`, `app` y `db` saludables |
| `/health` y `/ready` a través de Nginx | HTTP 200 |
| `bash scripts/test-local.sh` | Configuración e integración aprobadas; sin pruebas omitidas |
| Login, logout, SQL, CSRF, escape HTML, límite de intentos | Aprobados sobre una base temporal PostgreSQL real |
| Cookie Secure detrás de proxy confiable y no confiable | Comportamiento esperado en ambos casos |
| `npm run smoke` dentro de app | Ambos usuarios pasan login, bienvenida y logout a través de Nginx |
| `bash scripts/verify-persistence.sh` | Fila de control ID 3 conservada con fecha original tras recrear DB; control retirado después |
| Navegador Chromium, anchos 1440 y 390 px | Login, seis destinos, logout y bloqueo sin sesión; sin errores de consola ni desbordamiento horizontal |
| Imagen Docker Hub | Publicada, `linux/amd64`, usuario `node`, puerto 8080 |
| Secretos y red | Sin secretos generados en archivos públicos; imagen sin `.env`/`.git`; puerto 5432 sin publicación |

La revisión de Chromium se ejecutó contra HTTP local en el Codespace. El flujo desde la URL HTTPS reenviada de Codespaces todavía requiere comprobación manual.

Pendientes: completar el despliegue desde el panel Blitz, comprobar su URL HTTPS y el login en ella, y verificar manualmente la URL reenviada de Codespaces. El código de esta implementación se publica en la rama [codex/descubre-peru](https://github.com/Renzo1818/-usil-cloud-lab/tree/codex/descubre-peru) del repositorio existente para revisión antes de incorporarlo a `main`.

Referencias oficiales de ejecución: [PostgreSQL en Blitz](https://blitz.cloud/guides/deploy-app-with-postgres/), [contenedores en Blitz](https://blitz.cloud/guides/deploy-docker-container-free/), [sesiones Express](https://expressjs.com/en/resources/middleware/session/), [imagen PostgreSQL](https://hub.docker.com/_/postgres), [Docker Compose](https://docs.docker.com/compose/).
