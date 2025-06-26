const AWS = require("aws-sdk");

const TABLE_NAME = "geography_records";

AWS.config.update({
  region: "us-east-1",
});
const docClient = new AWS.DynamoDB.DocumentClient();

async function deleteAllRegions() {
  const params = {
    TableName: TABLE_NAME,
    IndexName: "kind_index",
    KeyConditionExpression: "#kind = :regionKind",
    ExpressionAttributeNames: {
      "#kind": "kind",
    },
    ExpressionAttributeValues: {
      ":regionKind": "REGION",
    },
  };

  let items = [];
  let lastEvaluatedKey = null;

  // Paginate through all REGION items
  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    const data = await docClient.query(params).promise();
    items = items.concat(data.Items);
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (items.length === 0) {
    console.log("No REGION items found.");
    return;
  }

  console.log(`Found ${items.length} REGION items. Deleting...`);

  // Batch delete (max 25 per batch)
  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    const deleteRequests = batch.map((item) => ({
      DeleteRequest: {
        Key: {
          pk: item.pk,
        },
      },
    }));

    const batchParams = {
      RequestItems: {
        [TABLE_NAME]: deleteRequests,
      },
    };

    await docClient.batchWrite(batchParams).promise();
    console.log(`Deleted batch of ${deleteRequests.length} items.`);
  }

  console.log("All REGION items deleted.");
}

deleteAllRegions().catch((err) => {
  console.error("Error deleting REGION items:", err);
});
