# ingestIA - Guía de Producción & Arquitectura Integral

Sistema integral de detección de cambios y sincronización en tiempo real entre **SAP Business One (HANA + Service Layer)** y la **API de Ingestión Comercia**, con configuración centralizada en **PostgreSQL**, diseñado para operar 24/7 en **Windows Server 2019** con el **Backend como Servicio de Windows (NSSM)** y el **Frontend bajo IIS**.

---

## 📐 Puertos y Rutas en Producción

| Componente | Directorio en Servidor | Puerto | Tecnología / Host | Repositorio GitHub |
| :--- | :--- | :--- | :--- | :--- |
| **BackEnd** | `C:\inetpub\ingestiaBack` | **9015** | Node.js + Express (Servicio Windows NSSM) | [ingestiaBack](https://github.com/gsilverd2239/ingestiaBack.git) |
| **FrontEnd** | `C:\inetpub\ingestiaFront` | **9025** | Next.js 16 + React 19 (IIS Web Site + Reverse Proxy) | [ingestiaFront](https://github.com/gsilverd2239/ingestiaFront.git) |

> [!NOTE]
> El FrontEnd en el puerto `9025` se comunica de forma automática con el BackEnd en el puerto `9015`. Gracias al selector dinámico de host incorporado, funciona tanto accediendo localmente desde el servidor (`http://localhost:9025`) como desde cualquier máquina de la red (`http://<IP_SERVIDOR>:9025`).

---

## 🏗️ Arquitectura de la Solución

```
C:\inetpub\
├── ingestiaBack\                    # Backend (Puerto 9015 - Servicio Windows)
│   ├── config\
│   │   └── config.json              # Configuración local de fallback
│   ├── logs\                        # Logs de Winston rotativos (ingestia.log, error.log)
│   ├── src\
│   │   ├── db\
│   │   │   ├── pg.js                # Pool de conexión PostgreSQL (172.19.0.232:5432)
│   │   │   └── configRepository.js  # Repositorio CRUD de tablas de configuración
│   │   ├── config.js                # Gestor de configuración activa en memoria
│   │   ├── engine.js                # Motor de polling continuo y orquestación
│   │   ├── hanaClient.js            # Conexión directa a SAP HANA DB (puerto 30015)
│   │   ├── serviceLayerClient.js    # Cliente HTTP autenticado contra SAP Service Layer
│   │   ├── transformer.js           # Normalización de datos (OCRD, OITM, JCANAL, etc.)
│   │   ├── ingestionClient.js       # Cliente HTTP PUT/POST con Smart Fallback y lógica ENDURO
│   │   ├── logger.js                # Winston logger con búfer en memoria para frontend
│   │   ├── server.js                # API REST con endpoints de monitoreo, simulación y CRUD
│   │   └── index.js                 # Punto de entrada principal
│   └── package.json
│
└── ingestiaFront\                   # Frontend (Puerto 9025 - IIS Site)
    ├── app\
    │   ├── layout.js                # Layout base con fuentes y estilos
    │   ├── globals.css              # Sistema visual Glassmorphism Dark Mode
    │   └── page.js                  # Dashboard interactivo, logs en vivo y CRUDs PostgreSQL
    ├── web.config                   # Configuración de IIS con Reverse Proxy (URL Rewrite + ARR)
    ├── package.json
    └── next.config.mjs
```

---

## ⚡ Comportamiento ENDURO (Sincronización Dual)

El motor detecta eventos desde `TBL_COMERCIA_EVENTS` en SAP HANA y ejecuta sincronización dual en código sin depender de plantillas en PostgreSQL para estos dos objetos clave:

### 1. ObjectType = 4 (Artículos / OITM + ITM1 Precios)
- **Service Layer**: Consulta `/b1s/v1/Items('{EntryKey}')`.
- **Cabecera `tbl_oitm`**:
  - `POST /catalogo/empresas/{empresaId}/tbl_oitm` (si `Action = 'A'`) con fallback a `PUT`.
  - `PUT /catalogo/empresas/{empresaId}/tbl_oitm/{ItemCode}` (si `Action = 'U'`) con fallback a `POST`.
  - Mapeo exacto de campos: `DfltWH`, `ItemCode`, `ItemName`, `SWeight1`, `validFor`, `TaxCodeAR`, `U_ItemQty` (entero), `U_beas_vg` (string), `frozenFor`, `ItmsGrpCod`, `QryInventario`.
- **Listas de Precios `tbl_itm1`**:
  - Recorre en paralelo las listas del array `ItemPrices`.
  - Formatea precios obligatoriamente con 6 decimales (`Price: "95000.000000"`).
  - `PUT /catalogo/empresas/{empresaId}/tbl_itm1/{ItemCode}/{PriceList}` (con fallback a `POST` si el precio > 0 y no existía en la tabla; omite precios en 0 inexistentes).

### 2. ObjectType = 2 (Socios de Negocio / OCRD + CRD1 Direcciones)
- **Service Layer**: Consulta `/b1s/v1/BusinessPartners('{EntryKey}')`.
- **Cabecera `tbl_ocrd`**:
  - `POST /socios-negocio/empresas/{empresaId}/tbl_ocrd` (si `Action = 'A'`) con fallback a `PUT`.
  - `PUT /socios-negocio/empresas/{empresaId}/tbl_ocrd/{CardCode}` (si `Action = 'U'`) con fallback a `POST`.
  - Mapeo de 26 atributos requeridos (incluyendo `QryGroup3..7` como `QryLunes..Viernes`).
- **Direcciones `tbl_crd1`**:
  - Recorre el array `BPAddresses` de Service Layer.
  - Mapea: `AddressName` ➔ `Address`, `Street` ➔ `Street`, `AddressType` (`bo_ShipTo`/`bo_BillTo`) ➔ `AdresType` (`'S'`/`'B'`).
  - Consulta direcciones existentes para el socio y ejecuta `PUT /socios-negocio/empresas/{empresaId}/tbl_crd1/{CardCode}?direccion={...}` con selector JSON completo para evitar conflictos con múltiples direcciones.
  - Inserta nuevas direcciones mediante `POST /socios-negocio/empresas/{empresaId}/tbl_crd1`.

---
## 🛠️ Comandos de Mantenimiento

### Control de Servicios NSSM:
```cmd
:: Ver estado
nssm status ingestiaBack
nssm status ingestiaFrontSvc

:: Reiniciar servicios
nssm restart ingestiaBack
nssm restart ingestiaFrontSvc

:: Detener servicios
nssm stop ingestiaBack
nssm stop ingestiaFrontSvc

:: Ver interfaz gráfica de configuración
nssm edit ingestiaBack
```

### Ubicación de Logs para Soporte:
- **Logs del Backend ingestIA**: `C:\inetpub\ingestiaBack\logs\ingestia.log`
- **Logs de Errores del Backend**: `C:\inetpub\ingestiaBack\logs\error.log`
- **Salida de Consola NSSM BackEnd**: `C:\inetpub\ingestiaBack\logs\service-stdout.log`
- **Salida de Consola NSSM FrontEnd**: `C:\inetpub\ingestiaFront\logs\` (si se configuró)

---

## 🔄 Procedimiento para Actualizar Versiones Futuras

Cuando haya nuevas actualizaciones en GitHub:

```powershell
# 1. Actualizar BackEnd
cd C:\inetpub\ingestiaBack
git pull origin master
npm install --omit=dev
nssm restart ingestiaBack

# 2. Actualizar FrontEnd
cd C:\inetpub\ingestiaFront
git pull origin master
npm install
npm run build
nssm restart ingestiaFrontSvc
```
