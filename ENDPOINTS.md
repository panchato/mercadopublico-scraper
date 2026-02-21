# ENDPOINTS.md - Mercado Público Compra Ágil

Tracked endpoint inventory for scraper architecture and enrichment roadmap.

## Legend
- **Priority**: High / Medium / Low
- **Status**:
  - `integrated` = currently used by production scraper path
  - `discovered` = confirmed endpoint, not yet integrated
  - `pending-fields` = endpoint known, field map still incomplete

---

## 1) Search/List Opportunities

- **Method**: `GET`
- **Path**: `/v1/compra-agil-busqueda/buscar`
- **Auth**: Bearer token required
- **Priority**: **High**
- **Status**: `integrated` ✅
- **Purpose**: Main listing feed (pagination + filters)
- **Current usage**: Base dataset for daily scraping

### Key Query Params
- `desde`, `hasta`
- `orderBy`
- `page`, `size`
- `region`
- `estado`
- `misRubros`
- optional `q` (search by code/text)

### Key Fields (observed)
- `id`, `codigo`, `nombre`, `organismo`, `unidad`
- `moneda`, `montoDisponible`
- `fechaPublicacion`, `fechaApertura`, `fechaCierre`
- `fechaCierrePrimerLLamado`, `fechaCierreSegundoLLamado`
- `estado`, `estadoConvocatoria`, `idEstado`
- `numeroOfertas`, `ofertasRecibidas`, `misOfertas`
- `reseleccion`, `accionOcPendiente`, `totalRegistros`

### Notes
- `numeroOfertas`, `ofertasRecibidas`, `misOfertas` come from this endpoint.

---

## 2) Opportunity Detail / Request Content

- **Method**: `GET`
- **Path**: `/v1/compra-agil/solicitud/{codigo}`
- **Auth**: Bearer token required
- **Priority**: **High**
- **Status**: `discovered` 🔶 (ready for enrichment integration)
- **Purpose**: Deep detail per opportunity (requirements/specs)

### Key Query Params
- `size`, `page`

### Key Fields (observed)
Inside `payload.detalleSolicitud`:
- `id`, `nombre`, `descripcion`
- `fechaApertura`, `fechaPublicacion`, `fechaCierre`
- `estado`, `idEstado`
- `direccion`
- `moneda`, `montoMoneda`, `montoTotalEstimado`
- `plazoEntrega`
- `productos[]`:
  - `codigoProducto`, `idCategoria`, `cantidad`
  - `descripcion`, `nombre`, `unidad.{codigo,nombre}`
- `institucion.{empresa,organizacion,rut}`

Other payload fields:
- `estadoConvocatoriaAgil.{convocatoria,fechaCierrePrimerLlamado,fechaCierreSegundoLlamado,priorizado,disclaimer*}`
- `proveedoresNotificados`
- `tipoPresupuesto`
- `consideraRequisitosMedioambientales`
- `consideraRequisitosImpactoSocialEconomico`

### Notes
- High-value for fit scoring and action recommendation.

---

## 3) Buyer Detail

- **Method**: `GET`
- **Path**: `/v1/compra-agil/comprador/listar/{codigo}`
- **Auth**: Bearer token required
- **Priority**: **High**
- **Status**: `pending-fields` ⏳
- **Purpose**: Buyer-side contextual detail for the selected opportunity

### Notes
- Endpoint confirmed in network logs.
- Need one sample JSON body to finalize field mapping.

---

## 4) Request Parameter Catalog

- **Method**: `GET`
- **Path**: `/v1/compra-agil/parametros/solicitudCotizacion`
- **Auth**: Bearer token required
- **Priority**: Medium
- **Status**: `discovered`
- **Purpose**: Metadata catalog useful for normalization/mapping

---

## 5) Quotation Criteria Catalog

- **Method**: `GET`
- **Path**: `/v1/compra-agil/parametros/cotizacion/criterios`
- **Auth**: Bearer token required
- **Priority**: Medium
- **Status**: `discovered`
- **Purpose**: Criteria metadata for quote-related interpretation

---

## 6) Tax Catalog

- **Method**: `GET`
- **Path**: `/v1/compra-agil/catalogo/impuestos?activo=1`
- **Auth**: Bearer token required
- **Priority**: Medium
- **Status**: `discovered`
- **Purpose**: Tax metadata for normalization/computation support

---

## 7) Tutorial Content

- **Method**: `GET`
- **Path**: `/v1/compra-agil/tutorial`
- **Auth**: Bearer token required
- **Priority**: Low
- **Status**: `discovered`
- **Purpose**: Informational content (not relevant for scraping/scoring core pipeline)

---

## Integration Roadmap (next)

1. Add optional enrichment mode in scraper:
   - `--enrich-details` → call endpoint #2 per `codigo`
2. Add optional buyer enrichment:
   - `--enrich-comprador` → call endpoint #3 per `codigo`
3. Build distilled/classified outputs from merged data.

---

## Security Reminder

Never store real Bearer tokens in docs, commits, or chat logs.
If exposed, rotate session (`login-local.js`) and replace `session.json`.
