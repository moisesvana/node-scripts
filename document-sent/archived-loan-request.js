import AWS from "aws-sdk";
import axios from "axios";
import dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const loanRequests = JSON.parse(
  readFileSync(
    new URL("./loan_requests_not_in_ticket_table.json", import.meta.url),
  ),
);

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;
const LOAN_REQUEST_API_KEY = process.env.LOAN_REQUEST_API_KEY;

async function archiveLoanRequest(loanRequestId, userId) {
  const url = `https://credit.api.vana-private.com/v1/loan-requests/${loanRequestId}/archival`;
  const response = await axios.post(
    url,
    { data: { user_id: userId } },
    {
      headers: {
        "x-api-key": LOAN_REQUEST_API_KEY,
        "Content-Type": "application/json",
      },
    },
  );
  return response.data;
}

async function getLoanRequestState(loanRequestId) {
  const params = {
    TableName: LOAN_REQUEST_STATE_TABLE,
    Key: { loan_request_id: loanRequestId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

(async () => {
  try {
    console.log(`Processing ${loanRequests.length} loan requests...\n`);

    const results = [];

    for (const { loan_request_id } of loanRequests) {
      const item = await getLoanRequestState(loan_request_id);

      if (!item) {
        console.log(`loan_request_id: ${loan_request_id} | NOT FOUND`);
        continue;
      }

      results.push({ loan_request_id, ...item });
    }

    results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    for (const item of results) {
      console.log(
        `loan_request_id: ${item.loan_request_id} | user_id: ${item.user_id} | status: ${item.status} | created_at: ${item.created_at} | updated_at: ${item.updated_at}`,
      );
      try {
        const res = await archiveLoanRequest(
          item.loan_request_id,
          item.user_id,
        );
        console.log(`  -> archival OK:`, JSON.stringify(res));
      } catch (err) {
        console.error(
          `  -> archival FAILED: ${err.response?.status} ${JSON.stringify(err.response?.data)}`,
        );
      }
    }

    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
