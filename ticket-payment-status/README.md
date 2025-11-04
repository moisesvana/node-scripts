# Ticket Payment Status Scripts

Colección de scripts para consultar y actualizar registros de tipo `TICKET_PAYMENT` en DynamoDB.

## Scripts Disponibles

### 1. get-pending-payments.js
Consulta y lista todos los items con status `pending`.

**Características:**
- Consulta DynamoDB usando el índice `type_sk_index` con el tipo `TICKET_PAYMENT`
- Itera por todos los items usando paginación
- Filtra items con status `pending`
- Guarda logs de todos los items pending en la carpeta `logs/`
- Guarda logs de items que fallan al procesarse en la carpeta `logs/`
- Muestra información detallada de cada item procesado

### 2. update-pending-to-completed.js
Actualiza el status de `pending` a `completed` para todos los items encontrados.

**Características:**
- Consulta items con tipo `TICKET_PAYMENT`
- Filtra solo los items con status `pending`
- Actualiza el status a `completed` y el campo `updated_at`
- Usa `ConditionExpression` para evitar race conditions
- Si falla una actualización, continúa con el siguiente item
- Guarda logs de items actualizados exitosamente
- Guarda logs de items que fallaron al actualizar
- Muestra resumen completo al finalizar

## Requisitos

- Node.js instalado
- Credenciales de AWS configuradas
- Acceso a la tabla DynamoDB especificada

## Instalación

```bash
cd ticket-payment-status
npm install
```

## Configuración

1. Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

2. Configura las variables de entorno en `.env`:

```bash
# Nombre de la tabla DynamoDB
TABLE_NAME=costumer_tickets_records_dev

# Índice a utilizar
TYPE_INDEX=type_sk_index

# Rango de fechas (opcional - dejar vacío para procesar todos)
START_DATE=
END_DATE=

# Tamaño del lote de procesamiento
BATCH_SIZE=500
```

### Variables de entorno

- **TABLE_NAME**: Nombre de la tabla DynamoDB (default: `costumer_tickets_records_dev`)
- **TYPE_INDEX**: Nombre del índice GSI a usar (default: `type_sk_index`)
- **START_DATE**: Fecha de inicio del filtro (formato ISO 8601, opcional)
- **END_DATE**: Fecha de fin del filtro (formato ISO 8601, opcional)
- **BATCH_SIZE**: Número de registros a procesar por lote (default: 500)

## Uso

### Consultar items pending

```bash
npm run get-pending
```

### Actualizar items de pending a completed

```bash
npm run update-to-completed
```

## Salida

Los scripts generarán archivos en la carpeta `logs/`:

### Script: get-pending-payments.js

1. **pending-payments-{timestamp}.json** - Items con status `pending`
```json
{
  "summary": {
    "totalPending": 10,
    "timestamp": "2025-11-03T18:00:00.000Z",
    "tableName": "costumer_tickets_records_dev",
    "typeValue": "TICKET_PAYMENT"
  },
  "pendingItems": [...]
}
```

2. **failed-items-{timestamp}.json** - Items que fallaron al procesarse
```json
{
  "summary": {
    "totalFailed": 2,
    "timestamp": "2025-11-03T18:00:00.000Z",
    "tableName": "costumer_tickets_records_dev",
    "typeValue": "TICKET_PAYMENT",
    "statusFilter": "pending"
  },
  "failedItems": [...]
}
```

### Script: update-pending-to-completed.js

1. **successful-updates-{timestamp}.json** - Items actualizados exitosamente
```json
{
  "summary": {
    "totalUpdated": 25,
    "timestamp": "2025-11-03T18:00:00.000Z",
    "tableName": "costumer_tickets_records_dev",
    "typeValue": "TICKET_PAYMENT",
    "operation": "update status pending to completed"
  },
  "updatedItems": [...]
}
```

2. **failed-updates-{timestamp}.json** - Items que fallaron al actualizar
```json
{
  "summary": {
    "totalFailed": 2,
    "timestamp": "2025-11-03T18:00:00.000Z",
    "tableName": "costumer_tickets_records_dev",
    "typeValue": "TICKET_PAYMENT",
    "operation": "update status pending to completed"
  },
  "failedItems": [...]
}
```

## Logs en Consola

### get-pending-payments.js

```
----------------------------------------
📋 Procesando item 1
PK: TICKET_PAYMENT|ae12ef17-a3f7-4ba5-8cd6-47f5439636b2
SK: TYPE|TICKET_PAYMENT|QUEUE|review|COUNTRY|DO
Status: pending
Type: TICKET_PAYMENT
Intent ID: ae12ef17-a3f7-4ba5-8cd6-47f5439636b2
Loan ID: de2091eb-54f1-4414-8f1e-8cb308d8c10b
User ID: rYJYRBuMCDL2qAYBARpDHf
Amount: 394
Country: DO
Queue: review
Updated At: 2025-11-03T18:16:36.835Z
✅ Item con status PENDING encontrado (Total: 1)
----------------------------------------
```

Resumen final:
```
========================================
🎯 RESUMEN DEL PROCESO
========================================
Total de registros procesados: 100
Total de items con status PENDING: 25
Total de items fallidos: 0
========================================
```

### update-pending-to-completed.js

```
----------------------------------------
📋 Procesando item 1
PK: TICKET_PAYMENT|ae12ef17-a3f7-4ba5-8cd6-47f5439636b2
SK: TYPE|TICKET_PAYMENT|QUEUE|review|COUNTRY|DO
Status actual: pending
Type: TICKET_PAYMENT
Intent ID: ae12ef17-a3f7-4ba5-8cd6-47f5439636b2
Loan ID: de2091eb-54f1-4414-8f1e-8cb308d8c10b
User ID: rYJYRBuMCDL2qAYBARpDHf
Amount: 394
Country: DO
Queue: review
Updated At: 2025-11-03T18:16:36.835Z
✅ Item con status PENDING encontrado (Total pending: 1)
🎉 Status actualizado exitosamente: pending → completed
🕐 Nuevo updated_at: 2025-11-03T19:30:45.123Z
----------------------------------------
```

Resumen final:
```
========================================
🎯 RESUMEN DEL PROCESO
========================================
Total de registros procesados: 100
Total de items con status PENDING: 25
Total de items ACTUALIZADOS exitosamente: 23
Total de items OMITIDOS (no pending): 75
Total de items FALLIDOS: 2
========================================
```

## Estructura del Item

Cada item en la tabla tiene la siguiente estructura:

```javascript
{
  "pk": "TICKET_PAYMENT|{intent_id}",
  "sk": "TYPE|TICKET_PAYMENT|QUEUE|{queue}|COUNTRY|{country}",
  "type": "TICKET_PAYMENT",
  "status": "pending",  // pending, uploading, completed, etc.
  "search": "IDENT|{loan_id}",
  "created_at": "2025-11-03T18:16:36.835Z",
  "updated_at": "2025-11-03T18:16:36.835Z",
  "props": {
    "intent_id": "ae12ef17-a3f7-4ba5-8cd6-47f5439636b2",
    "payment_id": "ae12ef17-a3f7-4ba5-8cd6-47f5439636b2",
    "loan_id": "de2091eb-54f1-4414-8f1e-8cb308d8c10b",
    "user_id": "rYJYRBuMCDL2qAYBARpDHf",
    "amount": 394,
    "country": "DO",
    "queue": "review",
    "status": "uploading",
    // ... otros campos
  }
}
```

## Notas

- El script utiliza CommonJS (`require`/`module.exports`)
- La región de AWS está configurada como `us-east-1`
- El script usa paginación para manejar grandes volúmenes de datos
- Los archivos de log incluyen timestamp para evitar sobrescritura
- La carpeta `logs/` se crea automáticamente si no existe
