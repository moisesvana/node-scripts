import AWS from "aws-sdk";
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_TABLE = process.env.LOAN_REQUEST_TABLE;
const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;

const loanRequests = JSON.parse(
  readFileSync(new URL("./reviewing_completed.json", import.meta.url)),
);

async function getLoanRequest(loanRequestId) {
  const params = {
    TableName: LOAN_REQUEST_TABLE,
    Key: { loan_request_id: loanRequestId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

async function getLoanRequestStatus(loanRequestId) {
  const params = {
    TableName: LOAN_REQUEST_STATE_TABLE,
    Key: { loan_request_id: loanRequestId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item?.status || null;
}

async function getLoanRequestsByUserId(userId) {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: LOAN_REQUEST_TABLE,
      IndexName: "user_index",
      KeyConditionExpression: "#user_id = :userId",
      ExpressionAttributeNames: { "#user_id": "user_id" },
      ExpressionAttributeValues: { ":userId": userId },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();
    items.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

(async () => {
  try {
    console.log(`Processing ${loanRequests.length} loan requests...\n`);
    let count = 0;
    let multipleCount = 0;
    const singleResults = [];
    const multipleResults = [];

    for (const { loan_request_id } of loanRequests) {
      const item = await getLoanRequest(loan_request_id);

      if (!item) {
        console.log(`loan_request_id: ${loan_request_id} | NOT FOUND`);
        continue;
      }

      const userId = item.user_id;
      const userLoanRequests = await getLoanRequestsByUserId(userId);
      const hasMultiple = userLoanRequests.length > 1;

      if (hasMultiple) multipleCount++;

      const statusMap = Object.fromEntries(
        await Promise.all(
          userLoanRequests.map(async (lr) => [
            lr.loan_request_id,
            await getLoanRequestStatus(lr.loan_request_id),
          ]),
        ),
      );

      console.log(
        `loan_request_id: ${loan_request_id} | user_id: ${userId} | total_loan_requests: ${userLoanRequests.length} | ${hasMultiple ? "HAS MULTIPLE" : "single"}`,
      );

      for (const lr of userLoanRequests) {
        console.log(
          `  -> loan_request_id: ${lr.loan_request_id} | status: ${statusMap[lr.loan_request_id]} | created_at: ${lr.created_at} | updated_at: ${lr.updated_at}`,
        );
      }
      console.log("\n");

      const record = {
        loan_request_id: loan_request_id,
        user_id: userId,
        loan_requests: userLoanRequests.map((lr) => ({
          loan_request_id: lr.loan_request_id,
          status: statusMap[lr.loan_request_id],
          created_at: lr.created_at,
          updated_at: lr.updated_at,
        })),
      };

      if (hasMultiple) {
        multipleResults.push(record);
      } else {
        singleResults.push(record);
      }

      count++;
    }

    writeFileSync(
      new URL("./single_loan_requests.json", import.meta.url),
      JSON.stringify(singleResults, null, 2),
    );
    writeFileSync(
      new URL("./multiple_loan_requests.json", import.meta.url),
      JSON.stringify(multipleResults, null, 2),
    );

    console.log(`\n--- Summary ---`);
    console.log(`Processed: ${count}`);
    console.log(`Users with multiple loan requests: ${multipleCount}`);
    console.log(`Users with single loan request: ${count - multipleCount}`);
    console.log(
      `Saved: single_loan_requests.json (${singleResults.length} records)`,
    );
    console.log(
      `Saved: multiple_loan_requests.json (${multipleResults.length} records)`,
    );
    console.log(`\nScript completed successfully.`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
