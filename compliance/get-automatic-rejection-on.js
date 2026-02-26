import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME || "user_properties_dev";

async function getComplianceWithAutomaticRejection() {
  console.log(
    "\n------------------------------ Scanning user_properties for compliance namespace -------------------------",
  );

  const results = [];
  let lastEvaluatedKey = undefined;
  let scannedCount = 0;

  do {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: "contains(pk, :nsCompliance)",
      ExpressionAttributeValues: {
        ":nsCompliance": "|NS|compliance",
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.scan(params).promise();
    scannedCount += response.ScannedCount;

    for (const item of response.Items) {
      if (item.props && item.props?.automatic_rejection === true) {
        results.push(item);
      }
    }

    console.log(
      `Scanned ${scannedCount} items so far... Found ${results.length} with automatic_rejection=true`,
    );

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(
    `\nScan complete. Total scanned: ${scannedCount}. Found ${results.length} items with automatic_rejection=true`,
  );

  results.sort((a, b) => {
    const dateA = new Date(a.created_at || 0);
    const dateB = new Date(b.created_at || 0);
    return dateB - dateA;
  });

  return results;
}

function saveResultsToFile(data, filename) {
  if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
  }

  const filePath = `logs/${filename}`;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
  console.log(
    `File '${filePath}' created successfully with ${data.length} items.`,
  );
}

(async () => {
  try {
    const items = await getComplianceWithAutomaticRejection();

    saveResultsToFile(items, `user-automatic-rejection.json`);

    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error in main process:", err);
    process.exit(1);
  }
})();
