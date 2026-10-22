# Descubre el Perú

Aplicación de turismo del Perú con login contra PostgreSQL, saludo personalizado y bienvenida protegida. Presenta Machu Picchu, lago Titicaca, líneas de Nasca, Arequipa, Paracas e Iquitos con recursos CSS locales.

Esta guía permite replicar el proyecto desde GitHub Codespaces, comprobar los tres contenedores y publicar una instancia propia en Blitz Cloud. Ejecuta los comandos desde la raíz del repositorio, en el orden indicado.

- Código completo: [rama codex/descubre-peru](https://github.com/Renzo1818/-usil-cloud-lab/tree/codex/descubre-peru).
- Revisión del código: [pull request #1](https://github.com/Renzo1818/-usil-cloud-lab/pull/1).
- Imagen de referencia: [renzo1818/descubre-peru:1.0.0](https://hub.docker.com/r/renzo1818/descubre-peru).

## 1. Obtener el código y preparar Codespaces

Necesitas cuentas de GitHub, Docker Hub y Blitz Cloud. Revisa los límites de uso de cada cuenta antes de crear recursos; el desarrollo y las pruebas de la actividad se realizan en Codespaces.

1. Abre el repositorio de GitHub del enlace anterior. Si necesitas tu propia copia, crea un **Fork** que incluya la rama de implementación. Si el formulario ofrece copiar solo `main`, desactiva esa opción; no copies únicamente esa rama mientras todavía contenga la versión estática.
2. Selecciona **codex/descubre-peru** en el selector de ramas. Si la implementación ya fue integrada a tu rama principal, selecciona esa rama.
3. Pulsa **Code → Codespaces** y crea un Codespace para la rama seleccionada. GitHub prepara el entorno a partir de `.devcontainer/devcontainer.json`.
4. Abre la terminal y comprueba:

```bash
git branch --show-current
node --version
docker version
docker compose version
```

**Resultado esperado:** Node 24 y Docker con información tanto de cliente como de servidor. La configuración de desarrollo incluye Node y Docker; no añade un cuarto servicio permanente al Compose de la aplicación. Consulta el [procedimiento oficial de Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository) si necesitas ajustar las opciones de creación.

Para obtener el mismo código mediante una terminal con Git, como alternativa al clonado automático de Codespaces:

```bash
git clone --branch codex/descubre-peru --single-branch https://github.com/Renzo1818/-usil-cloud-lab.git
cd ./-usil-cloud-lab
```

El Dockerfile instala las dependencias con `npm ci --omit=dev` y el lockfile. No es necesario instalar paquetes npm en el host para levantar Compose.

## 2. Generar la configuración privada

Ejecuta:

```bash
node scripts/generate-env.js
git check-ignore .env
```

**Resultado esperado:** se crea `.env`, y Git indica que está excluido. El generador produce contraseñas aleatorias y un secreto de sesión de 64 caracteres hexadecimales, con permisos de archivo `600`. Si `.env` ya existe, el script se detiene sin modificarlo: conserva su contenido y revisa sus variables en el editor privado.

`.env.example` describe los nombres necesarios, pero sus placeholders no sirven para arrancar. No publiques `.env`, no lo copies dentro de la imagen y no lo incluyas en capturas o mensajes.

Para comenzar las pruebas por HTTP, comprueba estas opciones en tu `.env`:

```dotenv
NODE_ENV=production
PORT=8080
COOKIE_SECURE=false
PROXY_SCHEME=http
TRUST_PROXY=172.30.10.2
SEED_ENABLED=true
APP_VERSION=1.0.0
```

Conserva los valores aleatorios generados para `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET` y las dos contraseñas de seed. Localmente, `DATABASE_URL` debe usar el host `db` y la misma contraseña de `POSTGRES_PASSWORD`; nunca `localhost` desde el contenedor app.

### Qué hace la inicialización

No necesitas ejecutar SQL manualmente. Al iniciar el contenedor app, `scripts/start.sh` ejecuta `scripts/init-db.js` y después arranca el servidor:

1. Espera la conexión a PostgreSQL con reintentos limitados.
2. Aplica `db/migrations/001_init.sql`, creando `users` y `session` si no existen.
3. Si `SEED_ENABLED=true`, crea los usuarios ficticios ausentes.
4. Si cualquiera de esos pasos falla, no inicia el servidor.

Los nombres provienen de `scripts/init-db.js`; las contraseñas se leen del entorno:

| Usuario para login | Nombre en bienvenida | Variable de contraseña inicial |
| --- | --- | --- |
| `demo_ana` | Ana Torres | `SEED_USER1_PASSWORD` |
| `demo_luis` | Luis Ramos | `SEED_USER2_PASSWORD` |

El script transforma cada contraseña en un hash bcrypt con coste 12 y guarda ese hash en `users.password_hash`. No guarda la contraseña en texto plano. Usa transacción y bloqueo asesor para evitar inicializaciones concurrentes inconsistentes.

**`SEED_ENABLED=false` no desactiva la creación de tablas:** solo omite la inserción de usuarios ficticios. En una base nueva con seed desactivado tendrás tablas sin usuarios. En una base ya inicializada, los usuarios permanecen y pueden iniciar sesión. Reiniciar o cambiar las variables de seed no modifica contraseñas existentes.

## 3. Construir y ejecutar los tres contenedores

```bash
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
curl -f http://localhost/health
curl -f http://localhost/ready
```

**Resultado esperado:** `proxy`, `app` y `db` en estado saludable. `/health` devuelve `{"status":"ok"}` y `/ready` devuelve `{"status":"ready"}`.

Para revisar el arranque:

```bash
docker compose logs --tail=30 app
```

Deben aparecer mensajes como:

```text
Base de datos inicializada.
Descubre el Perú escucha en el puerto 8080.
```

### Arquitectura local

```text
Navegador → Nginx :80 → aplicación :8080 → PostgreSQL :5432 → volumen
```

| Servicio | Responsabilidad | Imagen o construcción | Puerto publicado al host |
| --- | --- | --- | --- |
| `proxy` | Entrada y proxy inverso Nginx | `nginx:1.28.0-alpine` | `80` |
| `app` | Express, EJS y autenticación | Dockerfile con `node:24.21.0-bookworm-slim` | Ninguno |
| `db` | Usuarios y sesiones PostgreSQL | `postgres:17.11-bookworm` | Ninguno |

La app escucha en `0.0.0.0:8080` y se ejecuta como usuario `node`. Nginx y app comparten la red frontal; app y DB comparten otra red con `internal: true`. Nginx no pertenece a la red de DB. El volumen nombrado `postgres_data` se monta en `/var/lib/postgresql/data`.

En la columna `PORTS` de Compose pueden aparecer `8080/tcp` y `5432/tcp`: eso describe puertos internos. Solo el proxy debe mostrar una publicación como `0.0.0.0:80->80/tcp`.

## 4. Verificar funcionalidad y persistencia local

Realiza esta etapa con `COOKIE_SECURE=false`, `PROXY_SCHEME=http` y las dos contraseñas de seed todavía presentes en el entorno. Si ya cambiaste esos valores para HTTPS, restáuralos en `.env` y aplica la configuración:

```bash
docker compose up -d --wait --force-recreate app proxy
```

### 4.1. Integración sobre PostgreSQL real

```bash
bash scripts/test-local.sh
```

La suite valida configuración, login de ambos usuarios, regeneración de sesión, logout, cookie anterior invalidada, acceso sin sesión, credenciales incorrectas, SQL malicioso, CSRF, escape HTML, límite de intentos, bcrypt, inicialización repetible, cookies Secure y disponibilidad de DB.

Crea una base temporal `test_peru_...` y elimina únicamente esa base al terminar. Se ejecuta dentro de app, sin agregar servicios. Necesita permiso `CREATEDB`, disponible en la base local inicializada por la imagen oficial. No ejecutes esta suite contra Blitz ni contra una base ajena.

### 4.2. Flujo completo a través de Nginx

```bash
docker compose exec -T app npm run smoke
```

**Resultado esperado:** ambos usuarios pasan login, bienvenida y logout. El script gestiona cookies y CSRF sin imprimir contraseñas. Requiere que las dos variables de password coincidan con las utilizadas al crear esos usuarios.

### 4.3. Persistencia al recrear PostgreSQL

```bash
bash scripts/verify-persistence.sh
```

El script inserta una fila de control ajena al seed, detiene app/proxy, recrea el contenedor `db` conservando el volumen, espera su disponibilidad y compara el identificador, usuario y fecha originales. Después retira su fila de control y repite el smoke test.

**Resultado esperado:** aparece `Persistencia verificada` y vuelve a funcionar el login. La prueba no se limita a comprobar usuarios que el seed podría recrear. Si falla, intenta restablecer app/proxy; revisa el error antes de repetirla.

## 5. Abrir el proyecto desde Codespaces por HTTPS

1. En el editor, abre la pestaña **Ports**.
2. Reenvía el puerto **80**, conserva la visibilidad privada y selecciona **Open in Browser**.
3. Antes de autenticarte por esa URL HTTPS, cambia tu `.env` local:

```dotenv
COOKIE_SECURE=true
PROXY_SCHEME=https
TRUST_PROXY=172.30.10.2
```

4. Recrea app y proxy para aplicar las variables:

```bash
docker compose up -d --wait --force-recreate app proxy
```

5. Abre `/login` e inicia sesión con `demo_ana` y la contraseña que figura en `SEED_USER1_PASSWORD`. Debe aparecer **Bienvenido, Ana Torres**.
6. Repite con `demo_luis`, cierra sesión y abre `/welcome` en una ventana privada: debe redirigir al login. La URL privada de Codespaces también requiere acceso a GitHub.

Nginx establece el esquema mediante `PROXY_SCHEME`; no utiliza para ello una cabecera arbitraria del visitante. `TRUST_PROXY=172.30.10.2` corresponde exclusivamente al Nginx de este Compose. No copies esa IP a Blitz.

Para volver a ejecutar smoke y persistencia, restaura `COOKIE_SECURE=false` y `PROXY_SCHEME=http` y recrea app/proxy. Los endpoints de salud pueden comprobarse por HTTP en ambos modos; el flujo de login debe probarse en el modo configurado.

## 6. Crear el repositorio y publicar la imagen en Docker Hub

Para publicar una copia propia necesitas un namespace de Docker Hub y un access token con permiso de escritura.

1. En Docker Hub, entra a **My Hub → Repositories → Create repository**.
2. Selecciona tu namespace, el nombre `descubre-peru` y visibilidad **Public**.
3. Crea el repositorio. La visibilidad pública permite que Blitz descargue la imagen sin tus credenciales. Consulta las [instrucciones oficiales de Docker Hub](https://docs.docker.com/docker-hub/repos/create/).
4. Desde la terminal de Codespaces, configura los valores y autentica:

```bash
read -r -p 'Namespace Docker Hub: ' DOCKERHUB_USERNAME
read -r -p 'Versión nueva de la imagen: ' APP_VERSION
export DOCKERHUB_USERNAME APP_VERSION
docker login --username "$DOCKERHUB_USERNAME"
```

Introduce el access token únicamente en el prompt seguro de Docker. Para un repositorio nuevo puedes usar `1.0.0`; si esa etiqueta ya fue publicada para la entrega, usa una nueva, por ejemplo `1.0.1`. No sobrescribas una versión utilizada.

5. Construye para `linux/amd64` y verifica la imagen:

```bash
docker buildx build --platform linux/amd64 \
  -t "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION" --load .
docker image inspect "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION" \
  --format '{{.Os}}/{{.Architecture}} usuario={{.Config.User}}'
```

**Resultado esperado:** `linux/amd64 usuario=node`. Los secretos se inyectan al ejecutar el contenedor; no son argumentos de construcción.

6. Publica y comprueba el resultado remoto:

```bash
docker push "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION"
docker buildx imagetools inspect "$DOCKERHUB_USERNAME/descubre-peru:$APP_VERSION"
```

Guarda la referencia de la imagen y el digest que devuelve el registro. No necesitas subir copias de las imágenes oficiales de Nginx y PostgreSQL.

La imagen de referencia ya publicada es `renzo1818/descubre-peru:1.0.0`, con digest del índice `sha256:0c6cc84e3028430be63a181ad3493224c0dc713830ceed9617636375c882607f`. Su plataforma ejecutable es `linux/amd64`; una entrada adicional `unknown/unknown` corresponde a la atestación de construcción.

## 7. Desplegar la aplicación y PostgreSQL administrado en Blitz

En cloud la arquitectura es:

```text
Navegador → HTTPS de Blitz → imagen propia de app → PostgreSQL administrado privado
```

El Compose, Nginx y el volumen PostgreSQL corresponden al entorno local. En Blitz, despliega la imagen de app y usa la base administrada de la plataforma.

### 7.1. Seleccionar imagen, puerto y base

1. Accede al dashboard de Blitz con una cuenta verificada y comprueba el plan seleccionado.
2. En **Apps**, elige **Host something new → An app from Docker Hub**.
3. Introduce tu imagen `TU_NAMESPACE/descubre-peru` y selecciona la versión que publicaste. Para usar la imagen existente, selecciona `renzo1818/descubre-peru:1.0.0`.
4. En el paso **What we found**, escribe el nombre de la app y una dirección disponible, por ejemplo `descubre-peru`.
5. Si **Database** muestra **Not needed**, despliega **Advanced settings**, situado en la parte inferior, encima de **Continue**. Activa **Needs a database** y selecciona **PostgreSQL**. Este control pertenece al asistente de creación de app, no a la pestaña independiente **Databases**.
6. Confirma el puerto **8080**. Deja desactivado **Runs in the background**, conserva el comando de inicio de la imagen y no añadas carpetas persistentes a la app.
7. Continúa por **Settings** y **Check and go**, revisando la configuración antes de iniciar. Si ya creaste otra base por separado, no la elimines para seguir esta guía: revisa primero su asociación y el límite de bases de tu cuenta.

Blitz proporciona HTTPS y crea una `DATABASE_URL` privada para la base asociada. Conserva ese valor: no lo sustituyas por la conexión local ni por una dirección con host `db`. Referencias: [despliegue de contenedores](https://blitz.cloud/guides/deploy-docker-container-free/) y [aplicación con PostgreSQL](https://blitz.cloud/guides/deploy-app-with-postgres/).

### 7.2. Introducir las variables de entorno

Configura las variables antes del primer arranque si el asistente lo permite. Si no ofrece ese apartado, termina de crear la app y abre su pestaña **Environment**: puede quedar temporalmente en error hasta que guardes las variables y reinicies.

| Variable en Blitz | Valor inicial |
| --- | --- |
| `DATABASE_URL` | El proporcionado por Blitz para su base administrada |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `SESSION_SECRET` | El valor aleatorio de tu `.env` privado, o uno nuevo de al menos 32 bytes |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `false` durante la identificación del proxy |
| `SEED_ENABLED` | `true` para crear los usuarios en esta base nueva |
| `SEED_USER1_PASSWORD` | El valor completo de la misma variable de tu `.env` privado |
| `SEED_USER2_PASSWORD` | El valor completo de la misma variable de tu `.env` privado |

En cada campo de valor pega solo el valor, sin comillas ni el prefijo `VARIABLE=`. Las contraseñas de seed requieren entre **12 y 72 bytes**; los valores hexadecimales de 64 caracteres del generador cumplen esa regla. Usa las contraseñas originales, no un hash bcrypt.

No pegues el `.env` local completo en Blitz: podrías reemplazar su conexión de base de datos. `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PROXY_SCHEME`, `DOCKERHUB_USERNAME` y `APP_VERSION` no se necesitan en el entorno de la app cloud.

Guarda las variables y pulsa **Restart** cuando el panel indique **Restart needed**. Las modificaciones se aplican al siguiente arranque, según la [documentación de variables de Blitz](https://blitz.cloud/docs/settings-and-files/).

### 7.3. Comprobar la inicialización y configurar el proxy

1. En **Logs**, espera los mensajes:

```text
Base de datos inicializada.
Descubre el Perú escucha en el puerto 8080.
```

2. Comprueba que el panel pase a **Online**. El mensaje `PodInitializing` puede aparecer durante el arranque y no confirma que la app ya esté lista.
3. Pulsa **Visit** y abre `/ready` en la URL HTTPS. Debe responder `{"status":"ready"}`.
4. Abre `/login` y vuelve a los logs. Con `TRUST_PROXY=false` y `COOKIE_SECURE=true` debería aparecer **Entrada HTTPS observada desde ...**.
5. Verifica que esa dirección corresponda al proxy de entrada de Blitz. En **Environment**, sustituye `false` en `TRUST_PROXY` por esa IP exacta y conserva `COOKIE_SECURE=true`. Si hay varios proxies, usa únicamente las direcciones o el rango verificado del proveedor. No uses `true`, `0.0.0.0/0` ni una IP copiada de otro despliegue.
6. Guarda y reinicia. Sin la confianza correcta, Express no emitirá la cookie Secure y el login puede fallar. Si no aparece el mensaje o cambia la topología, comprueba la configuración del proveedor antes de ampliar la confianza.

No se requiere ejecutar SQL por fuera de Blitz: la misma imagen inicializa las tablas y los usuarios dentro de su red privada antes de servir la aplicación.

## 8. Probar el login cloud y desactivar el seed

Desde la URL HTTPS de **Visit**, realiza estas comprobaciones:

| Acción | Resultado esperado |
| --- | --- |
| Entrar con `demo_ana` y su contraseña configurada | `Bienvenido, Ana Torres` |
| Entrar con `demo_luis` y su contraseña configurada | `Bienvenido, Luis Ramos` |
| Usar password incorrecto o usuario inexistente | `Usuario o contraseña incorrectos` |
| Abrir `/welcome` en ventana privada sin sesión | Redirección a `/login` |
| Cerrar sesión e intentar abrir `/welcome` otra vez | Redirección a `/login` |
| Abrir `/health` y `/ready` | Respuestas de salud y disponibilidad correctas |

Los usuarios de login son los definidos en `scripts/init-db.js`; no son la cuenta de Blitz ni el usuario de conexión a PostgreSQL. Sus contraseñas corresponden a las variables usadas la primera vez que se insertaron en esa base.

Después de verificar ambos usuarios:

1. Guarda sus contraseñas en un lugar privado para la demostración.
2. En **Environment** de Blitz, cambia `SEED_ENABLED` a `false`.
3. Retira `SEED_USER1_PASSWORD` y `SEED_USER2_PASSWORD`; conserva `DATABASE_URL`, `SESSION_SECRET` y las demás opciones de ejecución.
4. Guarda, reinicia y comprueba que ambos usuarios siguen entrando. El login consulta los hashes almacenados en PostgreSQL y ya no depende de las variables de seed.

La base local y la administrada son independientes: modificar `.env` en Codespaces no cambia Environment en Blitz, y viceversa. Si también retiras las contraseñas del entorno local, smoke y la prueba de persistencia necesitarán que las vuelvas a proporcionar de forma privada para verificar login.

Conserva la URL HTTPS real y la versión de imagen utilizada para la entrega. Antes de exponer, abre la URL y comprueba su disponibilidad. La [página de precios de Blitz](https://blitz.cloud/pricing/), consultada el 21 de octubre de 2026 (Lima), describe suspensión de apps gratuitas tras 30 minutos sin visitas y una base administrada incluida; revisa de nuevo las condiciones de tu cuenta al replicar.

## 9. Reiniciar, actualizar y detener sin perder datos

Después de editar código, reconstruye y levanta los servicios locales:

```bash
docker compose up -d --build --wait
```

Después de editar variables de `.env`, recrea app/proxy para inyectar los nuevos valores:

```bash
docker compose up -d --wait --force-recreate app proxy
```

Para consultar estado, reiniciar el proceso sin cambiar configuración o detener el proyecto:

```bash
docker compose ps
docker compose logs --tail=50 app
docker compose restart app
docker compose down
```

`docker compose down` conserva el volumen; al ejecutar `docker compose up -d --wait` se reutilizan los datos. **`docker compose down -v` destruye el volumen y los datos**: no lo uses en las pruebas ni antes de la exposición.

Para repetir manualmente el inicializador dentro del entorno ya configurado:

```bash
docker compose exec -T app npm run init-db
```

No uses `npm start` directamente en el host como sustituto de Compose: esos scripts no cargan `.env` automáticamente y el host `db` de la conexión local pertenece a la red Docker.

Después de la exposición, detén los servicios y el Codespace cuando ya no los necesites. La eliminación de app/DB en Blitz y la destrucción de volúmenes son decisiones separadas; esta guía no las ejecuta automáticamente.

## 10. Solución de problemas

| Síntoma | Comprobación y acción |
| --- | --- |
| No existen `src`, `scripts` o `docker-compose.yml` | Abre la rama de implementación del paso 1; `main` puede conservar la versión estática |
| Docker muestra `permission denied` sobre su socket | Revisa `id` y `ls -l /var/run/docker.sock`; reabre o reconstruye el Codespace con su configuración de desarrollo. No cambies el socket a permisos `666` |
| `Los passwords de seed requieren entre 12 y 72 bytes` | Revisa ambas variables, pega únicamente sus valores completos, guarda y reinicia en Blitz; consulta los logs del nuevo arranque |
| `Falta la variable ...` | Completa la variable en el entorno correspondiente y recrea localmente o reinicia en Blitz |
| DB saludable pero app no conecta | Revisa `DATABASE_URL`, host, credenciales y las reglas de red del Codespace indicadas abajo |
| `/ready` responde 503 | PostgreSQL no está accesible; revisa el estado de DB y los logs sanitizados de app |
| Login vuelve al formulario o rechaza CSRF | Comprueba `COOKIE_SECURE`, modo HTTP/HTTPS y la IP de `TRUST_PROXY`; después de cambiar la configuración abre de nuevo `/login` |
| Login rechaza una contraseña de seed modificada | El usuario existente conserva su contraseña original; cambiar el seed no la restablece |
| Respuesta 429 en login | Se alcanzó el límite de 10 intentos por IP en 15 minutos; espera. Codespaces puede hacer que varios visitantes compartan IP |
| Smoke falla después de configurar HTTPS o retirar passwords | Vuelve al modo HTTP y proporciona las dos contraseñas originales en el entorno local antes de repetir la etapa 4 |
| DB deja de autenticar tras editar `POSTGRES_PASSWORD` | Cambiar `.env` no cambia el password de una base ya inicializada; restaura la configuración correcta o realiza un cambio controlado, sin borrar el volumen |

### Bloqueo de red observado en Codespaces

En el entorno de desarrollo se encontró una política antigua `FORWARD DROP` de `iptables-legacy` que impedía la comunicación de las nuevas redes Docker. Si reproduces ese bloqueo y los contenedores ya fueron creados:

```bash
bash scripts/repair-codespace-network.sh
docker compose up -d --wait app proxy
```

El script requiere `sudo`, comprueba esa política y permite tráfico únicamente dentro de los bridges conectados a app. No cambia la política global ni publica PostgreSQL. No es un paso necesario en instalaciones sin ese problema; si se recrean las redes afectadas, la reparación debe reaplicarse.

La red frontal utiliza `172.30.10.0/24`, con proxy en `.2` y app en `.3`. Si ese rango ya está ocupado, elige una subred libre y actualiza de forma consistente la subred, ambas IP en Compose y el `TRUST_PROXY` local.

Para pedir ayuda, comparte solo mensajes sanitizados. Las salidas completas de `docker inspect` y `docker compose config` pueden incluir secretos; no las adjuntes a capturas ni issues.

## Funcionamiento y estado comprobado

Las rutas principales son `/login`, `/welcome` y `/logout` (POST). `/` redirige según la sesión. La aplicación usa consultas parametrizadas, bcrypt, salida escapada de EJS, CSRF y sesiones PostgreSQL con cookies HttpOnly, SameSite=Lax y duración de 30 minutos. El límite de login es de memoria por instancia; se reinicia con el proceso y no es distribuido.

Comprobaciones realizadas durante la implementación en Codespaces, el 21 de octubre de 2026 (Lima):

- Tres contenedores saludables y `/health` y `/ready` respondiendo a través de Nginx.
- Suite de configuración e integración PostgreSQL aprobada, sin omisiones; smoke de ambos usuarios aprobado.
- Fila de control conservada con el mismo ID y fecha tras recrear DB; después se retiró únicamente esa fila.
- Chromium a 1440 y 390 px: login, seis destinos, logout y bloqueo sin sesión, sin desbordamiento horizontal ni errores de consola.
- Imagen publicada para `linux/amd64`, usuario `node`, puerto 8080, sin `.env` ni `.git`; DB local sin puerto publicado.

El panel Blitz mostró la aplicación **Online**, los logs confirmaron la inicialización y el usuario confirmó que pudo ver la bienvenida tras iniciar sesión. Esto acredita ese flujo reportado; todavía falta registrar una URL HTTPS confirmada en este README y los resultados de las demás pruebas manuales cloud. El acceso desde la URL privada reenviada de Codespaces también queda como comprobación manual independiente.

Referencias técnicas adicionales: [Docker Compose](https://docs.docker.com/compose/), [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres) y [sesiones Express](https://expressjs.com/en/resources/middleware/session/).
