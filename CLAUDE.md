# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains a collection of independent Node.js scripts for administrative and data backfill operations, primarily interacting with AWS DynamoDB. Each subdirectory is a standalone script or service with its own dependencies.

## Project Structure

The repository is organized into separate directories, each containing isolated scripts:

- `backfill-tickets-records-verification-service/` - Multi-service backfill system for ticket verification records
- `backfill-internal-users/` - Scripts for migrating and updating internal user records
- `import-regions/` - Geographic data import from Excel to DynamoDB
- `chat-gpt/` - User validation scripts using external APIs
- `rtn/` - RTN (Registro Tributario Nacional) validation for Honduras
- `get-evidence-checkpoints/` - Evidence and checkpoint data retrieval
- `collection-house-scripts/` - Collection house related operations
- `text-extract/` - Text and image extraction utilities
- Other utility directories for specific operations

## Common Commands

### Backfill Tickets Records Verification Service

This is the most complex service with multiple concurrent operations:

```bash
cd backfill-tickets-records-verification-service
npm install

# Run individual services
npm run ticket-request          # Process ticket requests
npm run checkpoints             # Process checkpoints
npm run checkpoints-photo       # Process checkpoint photos
npm run checkpoints-user        # Process checkpoint users
npm run update-created-at       # Update creation timestamps

# Run all services concurrently
npm run all
```

### Other Services

Most other services don't have npm scripts defined. Run them directly:

```bash
cd <service-directory>
npm install
node -r dotenv/config <script-name>.js
```

## Architecture Patterns

### Module System

**IMPORTANT**: All scripts use CommonJS module system (`require`/`module.exports`), NOT ES6 modules (`import`/`export`).

Example:
```javascript
const AWS = require("aws-sdk");
const { OpenSearchClient } = require("./opensearch-client.js");
```

### DynamoDB Query Pattern

Scripts follow a consistent pattern for querying DynamoDB:

1. **Configuration**: AWS region set to `us-east-1`
2. **DocumentClient**: Uses `AWS.DynamoDB.DocumentClient` for simplified operations
3. **Pagination**: Implements `do-while` loops with `ExclusiveStartKey` for large datasets
4. **GSI Usage**: Leverages Global Secondary Indexes (GSI) for efficient queries (e.g., `type_index`, `type_sk_index`)

Example pattern:
```javascript
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB.DocumentClient();

let lastEvaluatedKey = undefined;
do {
  const params = {
    TableName: TABLE_NAME,
    IndexName: INDEX_NAME,
    KeyConditionExpression: "#type = :typeValue",
    ExpressionAttributeNames: { "#type": "type" },
    ExpressionAttributeValues: { ":typeValue": TYPE_VALUE },
    ExclusiveStartKey: lastEvaluatedKey,
    Limit: 100
  };
  const data = await dynamodb.query(params).promise();
  // Process data.Items
  lastEvaluatedKey = data.LastEvaluatedKey;
} while (lastEvaluatedKey);
```

### DynamoDB Get Pattern

For retrieving single records by primary key:

```javascript
const params = {
  TableName: TABLE_NAME,
  Key: {
    pk: "ORG|vana|TYPE|id",
    sk: "ORG|vana|TYPE|id",
  },
};

const result = await dynamodb.get(params).promise();
if (result.Item) {
  // Process item
}
```

### Batch Processing

The backfill services use configurable batch sizes via environment variables:

- `BATCH_SIZE` environment variable controls processing batch size (default: 500-1000)
- Date range filtering via `START_DATE` and `END_DATE` (ISO 8601 format)
- Concurrent processing using `concurrently` package for multiple services

### Error Handling and Recovery

Scripts implement robust error handling:

1. **Failed Record Tracking**: Collects failed operations in memory arrays
2. **Batch File Output**: Writes all failures to timestamped JSON files in `fails/` directory
3. **Backup Creation**: Creates timestamped backups before modifications (e.g., `users-backup-{timestamp}.json`)
4. **Error Context**: Stores original item, attempted changes, and error message for debugging

### Retry Utility

The root-level `retryFn.js` provides a promise-based retry mechanism for transient failures.

## Environment Configuration

All services requiring configuration use `.env` files with `dotenv` package. Common variables:

```bash
# DynamoDB Configuration
TABLE_NAME=<table-name>          # DynamoDB table name
TYPE_INDEX=<index-name>          # GSI name for type-based queries

# Date Range Filters
START_DATE=2025-07-01T00:00:00.000Z
END_DATE=2025-08-31T23:59:59.999Z

# Processing Configuration
BATCH_SIZE=1000                  # Number of records to process per batch
```

Each service directory may have its own `.env` file. Copy and configure from existing `.env` files in the service directories.

## AWS Integration

All scripts assume:

- AWS credentials configured via standard AWS credential chain (environment variables, credentials file, or IAM role)
- Region: `us-east-1` (hardcoded in most scripts)
- DynamoDB tables are in production or development environments based on `TABLE_NAME` suffix

## Data Import Pattern

Services like `import-regions` follow a pattern:

1. Read data from Excel files using `xlsx` package
2. Transform data to match DynamoDB schema
3. Validate required fields
4. Batch write to DynamoDB using `batchWrite` operations
5. Generate UUIDs for primary keys using `uuid` package

## Multi-Country Support

Several services handle multi-country operations (GT, DO, HN, PE):

- Country codes used as prefixes or filters
- Geography records organized by country-specific regions
- Role permissions managed per country in internal user system
