# Compra Ágil Scraper

Herramienta para monitorear y evaluar oportunidades de compra pública en [Compra Ágil](https://compra-agil.mercadopublico.cl), el sistema de adquisiciones del Estado de Chile.

## ¿Qué hace?

- Consulta la API de Compra Ágil y descarga oportunidades filtradas por región y rubros
- Enriquece cada oportunidad con detalle de productos y score de confiabilidad del comprador
- Presenta las oportunidades en un panel visual con urgencia por color, filtros y ordenamiento
- Permite acceder directamente a cada oportunidad en Mercado Público con un clic

## Requisitos

- Node.js 18+
- Cuenta activa en [Mercado Público](https://www.mercadopublico.cl) como proveedor

## Instalación
```bash
git clone 
cd mercadopublico-scraper
npm install
```

## Uso en Windows

| Archivo | Acción |
|---|---|
| `Iniciar.bat` | Inicia el servidor y abre el panel en el navegador |
| `ReAutenticar.bat` | Re-autenticación con Clave Única (cuando la sesión expira) |

## Uso por línea de comandos
```bash
# Iniciar el panel web
node server.js

# Ejecutar scraper directamente
node scraper-final.js --region-metropolitana --mis-rubros --days=1

# Verificar estado de sesión
node session-monitor.js --probe

# Re-autenticar (requiere navegador con interfaz gráfica)
node login-local.js
```

## Arquitectura

| Archivo | Rol |
|---|---|
| `scraper-final.js` | Scraper principal vía API |
| `enricher.js` | Enriquecimiento de detalle y confiabilidad del comprador |
| `token-manager.js` | Gestión del ciclo de vida del token de acceso |
| `session-monitor.js` | Verificación de salud de la sesión |
| `login-local.js` | Re-autenticación con Playwright (requiere interfaz gráfica) |
| `server.js` | Servidor Express + API REST |
| `public/index.html` | Panel de control técnico |
| `public/opportunities.html` | Panel de evaluación de oportunidades |

## Autenticación

El sistema usa Keycloak SSO vía Clave Única. La sesión se guarda en `session.json` (excluido de git). El token de acceso dura aproximadamente 8 horas.

Cuando expira:
1. Ejecutar `ReAutenticar.bat` (Windows) o `node login-local.js`
2. Completar login con Clave Única y 2FA
3. La sesión se actualiza automáticamente

## Confiabilidad del comprador

| Nivel | Rango |
|---|---|
| 🟢 Muy confiable | 02% reclamos |
| 🟢 Confiable | 25% |
| 🟡 Precaución | 510% |
| 🔴 Riesgo | 1020% |
| 🔴 Evitar | +20% |

El porcentaje corresponde a reclamos por pago no oportuno sobre el total de órdenes de compra del organismo.

## Seguridad

- `session.json` y `.env` están excluidos de git
- El panel web no tiene autenticación propia  úsalo solo en red local
- Si el token se expone, rotar sesión con `login-local.js`

## Guía de uso

Ver [GUIA.md](GUIA.md) para instrucciones detalladas para usuarios no técnicos.

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).
