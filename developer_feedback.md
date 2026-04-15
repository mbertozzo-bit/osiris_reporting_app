# Developer Feedback & Lessons Learned: Osiris Reporting App

Este documento resume los retos técnicos encontrados durante el despliegue de la aplicación Osiris y ofrece recomendaciones para mejorar el flujo de desarrollo y mantenimiento.

## 1. Errores Detectados y Soluciones Aplicadas

### A. Dependencias Nativas y Docker (The Alpine Trap)
*   **Error:** Se intentó usar `node:alpine` para compilar una app que usa `@tailwindcss/oxide`. Las librerías alpinas usan `musl` mientras que muchas dependencias nativas modernas esperan `glibc` (Debian/Ubuntu).
*   **Aprendizaje:** Si tu app tiene dependencias de compilación nativa (Rust, C++, etc.), es preferible usar imágenes `-slim` (basadas en Debian) para evitar incompatibilidades binarias.

### B. Gestión de .gitignore y Assets
*   **Error:** El archivo `.gitignore` global ignoraba todas las carpetas `dist/`. Al usar una estrategia de "Local Build" para el frontend, esto causó que los archivos JavaScript compilados jamás se subieran a GitHub, rompiendo la app en el servidor.
*   **Consejo:** Sé específico con tu `.gitignore`. Usa `server/dist/` en lugar de `dist/` si necesitas que el frontend compilado viaje con tu código.

### C. Configuración de Seguridad (Helmet & HTTP)
*   **Error:** Usar `helmet()` con configuraciones por defecto en un entorno que aún no tiene SSL (HTTP puro). Esto bloqueaba recursos y generaba errores de conexión (ERR_SSL_PROTOCOL_ERROR o COOP errors).
*   **Recomendación:** En staging/dev, configura Helmet para ser permisivo (`contentSecurityPolicy: false`, etc.) y solo actívalo al máximo cuando tengas un certificado SSL (HTTPS) real.

### D. SPA Routing (El error del Refresh)
*   **Error:** Al refrescar una sub-página (ej: `/agents`), el servidor devolvía 404 porque no encontraba esa ruta física.
*   **Solución:** Siempre implementa una ruta wildcard `*` al final de tu backend de Express que sirva el `index.html`. El routing debe ser manejado por el cliente (React).

---

## 2. Recomendaciones de Arquitectura y Buenas Prácticas

### 🔐 Gestión de Secretos (La Regla de Oro)
*   **Nunca** dejes credenciales hardcodeadas (como hicimos con `Osiris/Osiris` temporalmente).
*   **Práctica sugerida:** Usa siempre el patrón `.env.example` (sin claves) en Git y un `.env` real (ignorado por Git) en el servidor. Esto evita filtraciones de seguridad.

### 🐳 Dockerización Inteligente
*   **Permisos de Usuario:** Evita usar `USER nodejs` si necesitas que el contenedor cree carpetas de datos (`/app/data`, `/app/logs`) al arrancar. Es mejor manejar los permisos de carpetas manualmente en el `entrypoint.sh`.
*   **Healthchecks:** Mantén los healthchecks simples. Usar `wget` o `curl` contra `/api/health` es vital para que Docker sepa si el servidor realmente está "vivo" internamente.

### 📡 Comunicación Frontend-Backend
*   **URLs Relativas:** En producción, configura tu frontend para usar URLs relativas (`/api/...` en lugar de `http://localhost:3001/...`). Esto hace que la app funcione automáticamente sin importar la IP del servidor donde se despliegue.

### 🧪 Diagnóstico y Logs
*   **Logueo de Identidad:** Cuando trabajes con Azure o servicios externos, añade logs que validen la *longitud* o el *formato* de las claves (como el `DIAGNOSTIC` que usamos). Te ahorrará horas de duda sobre si las variables de entorno se cargaron bien.

---

## 3. Consejos para el Futuro
*   **Documentación de Rama:** Mantén el hábito de cerrar tus ramas de desarrollo al terminar una funcionalidad (`git branch -d`).
*   **Consistencia de Entorno:** Si usas Docker en el servidor, intenta usarlo también en tu PC local para que los errores de dependencias nativas salgan *antes* de llegar a staging.

---
**Firmado:** Igris (Tu asistente de desarrollo)
