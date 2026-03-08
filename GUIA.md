# Guía de Uso - Panel de Control Compra Ágil

## ¿Qué hace esta aplicación?
Esta aplicación monitorea oportunidades de compra del Estado de Chile en Compra Ágil, las muestra en un panel visual y te ayuda a decidir en cuáles te conviene cotizar.

## Requisitos previos
- Node.js instalado
- Acceso a internet
- Cuenta activa en Mercado Público como proveedor

## Cómo iniciar la aplicación
1. Abrir una terminal en la carpeta del proyecto
2. `node server.js`
3. Abrir el navegador en `http://localhost:3000`

## Primera vez: autenticación
Para que el sistema funcione, debe existir el archivo `session.json`.
1. `node login-local.js`
2. Se abrirá un navegador: iniciar sesión con Clave Única
3. Completar el proceso de doble factor (2FA)
4. Esperar a que el navegador se cierre automáticamente
5. La sesión quedará guardada

## Estado de la sesión
El panel muestra tres colores:
- Verde: sesión saludable
- Amarillo: sesión próxima a expirar
- Rojo: sesión expirada

Si aparece rojo, ejecuta `node login-local.js` nuevamente.

## Cómo ejecutar el scraper
1. En el Panel de Control, sección "Ejecutar Scraper"
2. Configurar los filtros (Región, Mis Rubros, días, páginas)
3. Activar "Enriquecer oportunidades" para obtener detalle completo y score de confiabilidad del comprador
4. Hacer clic en "Ejecutar"
5. Esperar a que termine: el log muestra el progreso en tiempo real

## Ver las oportunidades
1. Hacer clic en "Ver oportunidades →"
2. Barra de color: rojo = cierra hoy o mañana antes del mediodía, amarillo = mañana después del mediodía, verde = pasado mañana o más
3. Usar el panel lateral para ordenar y filtrar
4. Hacer clic en el título de una oportunidad para abrirla en Mercado Público
5. Hacer clic en "Ver detalle" para ver productos, institución y confiabilidad del comprador

## Confiabilidad del comprador
La confiabilidad se calcula como: reclamos por pago no oportuno dividido por total de órdenes de compra.
- Muy confiable: 0-2%
- Confiable: 2-5%
- Precaución: 5-10%
- Riesgo: 10-20%
- Evitar: más de 20%

## ¿Qué hacer si la sesión expira?
1. El punto rojo aparecerá en "Estado de Sesión"
2. Abrir terminal
3. `node login-local.js`
4. Completar login y 2FA
5. Volver al panel: el estado se actualizará

## Rutina diaria recomendada
1. Iniciar la aplicación: `node server.js`
2. Verificar estado de sesión (punto verde)
3. Ejecutar scraper con "Enriquecer oportunidades" activado, días: 1
4. Ir a "Ver oportunidades"
5. Ordenar por caducidad
6. Revisar las oportunidades rojas y amarillas primero
7. Hacer clic en las que sean de interés para cotizar en Mercado Público
