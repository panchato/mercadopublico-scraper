# Changelog

Todos los cambios relevantes de este proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado semántico según [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-03-08

### Agregado
- Scraper API contra endpoint de búsqueda de Compra Ágil con soporte de filtros por región, rubros, fechas y paginación
- Gestión de sesión con `session.json` y autenticación Bearer token
- Re-autenticación local con Playwright vía Clave Única y 2FA (`login-local.js`)
- Monitor de sesión con niveles de salud y probe de API en vivo (`session-monitor.js`)
- Gestión del ciclo de vida del token con refresco automático (`token-manager.js`)
- Enriquecimiento de oportunidades: detalle de productos vía `/v1/compra-agil/solicitud/{codigo}`
- Score de confiabilidad del comprador basado en reclamos por pago no oportuno
- Servidor Express con API REST y streaming SSE para progreso en tiempo real (`server.js`)
- Panel de control técnico con estado de sesión, controles del scraper y descarga de archivos (`public/index.html`)
- Panel de evaluación de oportunidades con tarjetas, código de colores por urgencia y detalle expandible (`public/opportunities.html`)
- Filtros y ordenamiento en panel lateral: por caducidad, monto y confiabilidad
- Títulos de oportunidades como enlaces directos a Mercado Público
- Banners de advertencia en dashboard cuando la sesión está por expirar o expirada
- Launchers Windows sin necesidad de terminal (`Iniciar.bat`, `ReAutenticar.bat`)
- Guía de uso completa en español chileno (`GUIA.md`)
- Documentación de endpoints descubiertos (`ENDPOINTS.md`)

### Seguridad
- `session.json` y `.env` excluidos de git
- Credenciales purgadas del historial de git
