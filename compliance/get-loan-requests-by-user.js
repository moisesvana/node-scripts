import AWS from "aws-sdk";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import { OpenSearchClient } from "./opensearch-client.js";
dotenv.config();

const usersWithRejection = JSON.parse(
  fs.readFileSync("./logs/user-automatic-rejection.json", "utf-8"),
);

AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_TABLE = process.env.LOAN_REQUEST_TABLE || "loan_request";
const USER_STATE_TABLE = process.env.USER_STATE_TABLE || "user_state";
const USER_INDEX = "user_index";
const LOAN_API_TOKEN = process.env.LOAN_API_TOKEN;
const LOAN_API_BASE_URL = "https://api.vanalms.com";

const openSearchClient = new OpenSearchClient(process.env.OPENSEARCH_NODE, {
  username: process.env.OPENSEARCH_USERNAME,
  password: process.env.OPENSEARCH_PASSWORD,
});

async function getUserPersonalDataFromOpenSearch(userId) {
  const response = await openSearchClient.search({
    index: "user_index",
    queryInput: {
      _source: ["personal.id_number", "personal.country"],
      query: {
        term: {
          "user_id.keyword": userId,
        },
      },
    },
  });

  const personal = response.items?.[0]?.personal;
  return {
    id_number: personal?.id_number || null,
    country: personal?.country || null,
  };
}

async function getUserReviewingFromDynamo(userId) {
  const params = {
    TableName: USER_STATE_TABLE,
    Key: { user_id: userId },
    ProjectionExpression: "loan_review",
  };

  const result = await dynamodb.get(params).promise();
  return result.Item?.loan_review || null;
}

async function getLoansByUserId(userId) {
  const url = `${LOAN_API_BASE_URL}/v1/loan/search?page=1&user_id=${userId}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${LOAN_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  return response.data?.data?.data?.data || [];
}

function hasReleasedLoan(loans) {
  return loans.some((loan) => loan.status === "released");
}

async function getLoanRequestsByUserId(userId) {
  const loanRequests = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: LOAN_REQUEST_TABLE,
      IndexName: USER_INDEX,
      KeyConditionExpression: "user_id = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();
    loanRequests.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return loanRequests.sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
}

function saveResultsToFile(data, filename) {
  if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
  }

  const filePath = `logs/${filename}`;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`File '${filePath}' saved with ${data.length} records.`);
}

(async () => {
  try {
    console.log(
      `\nProcessing ${usersWithRejection.length} users with automatic_rejection=true...\n`,
    );

    const results = [];
    let processed = 0;

    for (const rejectionRecord of usersWithRejection) {
      const { user_id, props, created_at, updated_at } = rejectionRecord;

      const [loanRequests, loans, { id_number, country }, reviewing] =
        await Promise.all([
          getLoanRequestsByUserId(user_id).catch((err) => {
            console.error(
              `Error fetching DynamoDB loan requests for user ${user_id}:`,
              err.message,
            );
            return [];
          }),
          getLoansByUserId(user_id).catch((err) => {
            console.error(
              `Error fetching loans from API for user ${user_id}:`,
              err.message,
            );
            return [];
          }),
          getUserPersonalDataFromOpenSearch(user_id).catch((err) => {
            console.error(
              `Error fetching personal data from OpenSearch for user ${user_id}:`,
              err.message,
            );
            return { id_number: null, country: null };
          }),
          getUserReviewingFromDynamo(user_id).catch((err) => {
            console.error(
              `Error fetching user state from DynamoDB for user ${user_id}:`,
              err.message,
            );
            return null;
          }),
        ]);

      const rejectionActivatedAt = new Date(created_at);
      const hasLoanRequestAfterRejection = loanRequests.some(
        (lr) => new Date(lr.created_at) > rejectionActivatedAt,
      );
      const hasReleasedLoanResult = hasReleasedLoan(loans);

      results.push({
        user_id,
        id_number,
        country,
        rejection_info: {
          created_at,
          updated_at,
          props,
        },
        blocked_loan_request_id: props?.loan_request_id || null,
        loan_requests: loanRequests,
        loans,
        reviewing,
        should_reject_next_loan_request:
          hasLoanRequestAfterRejection && hasReleasedLoanResult,
      });

      processed++;
      if (processed % 10 === 0) {
        console.log(
          `Processed ${processed}/${usersWithRejection.length} users...`,
        );
      }
    }

    console.log(`\nDone. Processed ${processed} users total.`);

    saveResultsToFile(results, `loan-requests-by-rejected-user.json`);
  } catch (err) {
    console.error("Error in main process:", err);
    process.exit(1);
  }
})();
