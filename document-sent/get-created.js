import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const CUSTOMER_TICKETS_TABLE = process.env.CUSTOMER_TICKETS_TABLE;
const USER_STATE_TABLE = process.env.USER_STATE_TABLE;
const MINUTES_THRESHOLD = 30;

async function getUserState(userId) {
  if (!userId) return null;
  const params = {
    TableName: USER_STATE_TABLE,
    Key: { user_id: userId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

async function getStuckCreatedTickets() {
  const thresholdDate = new Date(
    Date.now() - MINUTES_THRESHOLD * 60 * 1000,
  ).toISOString();

  console.log(
    `\n------------------------------ Getting tickets stuck in 'created' (updated_at <= ${thresholdDate}) -------------------------`,
  );

  const tickets = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: CUSTOMER_TICKETS_TABLE,
      IndexName: "status_index",
      KeyConditionExpression:
        "#status = :statusValue AND #updated_at <= :threshold",
      FilterExpression: "#type = :typeValue",
      ExpressionAttributeNames: {
        "#status": "status",
        "#updated_at": "updated_at",
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":statusValue": "created",
        ":threshold": thresholdDate,
        ":typeValue": "TICKET_VERIFICATION",
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();

    for (const item of response.Items) {
      const userId = item.props?.user_id;
      const userState = await getUserState(userId);
      console.log("\n");
      console.log(
        `pk: ${item.pk} | user_id: ${userId} | loan_review: ${userState?.loan_review ?? ""} | status: ${userState?.status ?? ""}`,
      );
      console.log(
        `created_at: ${item?.created_at} | updated_at: ${item?.updated_at}`,
      );
      console.log("--------------------------------------------------");

      tickets.push(item);
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Found ${tickets.length} tickets stuck in 'created'`);
  return tickets;
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
    const stuckTickets = await getStuckCreatedTickets();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    saveResultsToFile(stuckTickets, `stuck-created-tickets-${timestamp}.json`);

    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error in main process:", err);
    process.exit(1);
  }
})();
