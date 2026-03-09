# Guía de Uso - Panel de Control Compra Ágil

## ¿Qué hace esta aplicación?
Esta aplicación monitorea oportunidades de compra del Estado de Chile en Compra Ágil, las muestra en un panel visual y te ayuda a decidir en cuáles te conviene cotizar.

## Requisitos previos
- Node.js instalado (descargar desde https://nodejs.org)
- Microsoft Edge o Google Chrome instalado (Edge viene preinstalado en Windows 10/11)
- Acceso a internet
- Cuenta activa en Mercado Público como proveedor

## Cómo iniciar la aplicación
1. Hacer doble clic en **Iniciar.bat**
2. El navegador se abrirá automáticamente en el panel de control
3. La primera vez, se instalarán las dependencias automáticamente (puede tardar un minuto)

## Primera vez: autenticación
Para que el sistema funcione, primero debes autenticarte:
1. Hacer doble clic en **ReAutenticar.bat**
2. Se abrirá un navegador: iniciar sesión con Clave Única
3. Completar el proceso de doble factor (2FA)
4. Esperar a que el navegador se cierre automáticamente
5. La sesión quedará guardada. Ya puedes usar **Iniciar.bat**

## Estado de la sesión
El panel muestra el estado de tu sesión con colores:
- 🟢 Verde: sesión saludable
- 🟡 Amarillo: sesión próxima a expirar  ejecuta **ReAutenticar.bat** pronto
- 🔴 Rojo: sesión expirada  debes ejecutar **ReAutenticar.bat** antes de continuar

Cuando la sesión está por expirar o expirada, el panel mostrará un aviso con instrucciones.

## Cómo ejecutar el scraper
1. Abrir el panel con **Iniciar.bat**
2. En la sección "Ejecutar Scraper", configurar los filtros:
   - **Región Metropolitana**: activa para filtrar solo oportunidades de la RM
   - **Mis Rubros**: activa para filtrar por los rubros registrados en tu cuenta
   - **Días hacia atrás**: cuántos días hacia atrás buscar (recomendado: 1 para uso diario)
   - **Máximo de páginas**: límite de páginas a consultar
   - **Enriquecer oportunidades**: activa para obtener detalle completo y score de confiabilidad del comprador
3. Hacer clic en **Ejecutar**
4. El registro muestra el progreso en tiempo real

## Ver las oportunidades
1. Hacer clic en **"Ver oportunidades "**
2. La barra de color en cada tarjeta indica urgencia:
   - 🔴 Rojo: cierra hoy o mañana antes del mediodía
   - 🟡 Amarillo: cierra mañana después del mediodía
   - 🟢 Verde: cierra pasado mañana o más adelante
3. Usar el panel lateral izquierdo para ordenar y filtrar por monto, confiabilidad o caducidad
4. Hacer clic en el **título** de una oportunidad para abrirla directamente en Mercado Público
5. Hacer clic en **"Ver detalle"** para ver productos, institución y confiabilidad del comprador

## Confiabilidad del comprador
La confiabilidad se calcula en base a reclamos por pago no oportuno respecto al total de órdenes de compra del organismo:
- 🟢 Muy confiable: 02%
- 🟢 Confiable: 25%
- 🟡 Precaución: 510%
- 🔴 Riesgo: 1020%
- 🔴 Evitar: más del 20%

## ¿Qué hacer si la sesión expira?
1. Aparecerá un aviso en rojo en el panel de control
2. Cerrar el panel (cerrar la ventana del navegador)
3. Hacer doble clic en **ReAutenticar.bat**
4. Completar el login con Clave Única y el doble factor (2FA)
5. Volver a abrir con **Iniciar.bat**

## Rutina diaria recomendada
1. Hacer doble clic en **Iniciar.bat**
2. Verificar que el estado de sesión esté en verde
3. Ejecutar el scraper con **"Enriquecer oportunidades"** activado y días: 1
4. Ir a **"Ver oportunidades"**
5. Ordenar por caducidad
6. Revisar primero las oportunidades rojas y amarillas
7. Hacer clic en las que sean de interés para cotizar directamente en Mercado Público
