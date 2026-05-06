import AWS from "aws-sdk";
import dotenv from "dotenv";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;
const CUSTOMER_TICKETS_TABLE = process.env.CUSTOMER_TICKETS_TABLE;

async function getLoanRequestsInReviewing() {
  console.log(
    "\n------------------------------ Getting loan requests in reviewing -------------------------",
  );

  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: LOAN_REQUEST_STATE_TABLE,
      IndexName: "status_index",
      KeyConditionExpression: "#status = :statusValue",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":statusValue": "reviewing" },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();

    for (const item of response.Items) {
      if (item.loan_request_id) {
        items.push({
          loan_request_id: item.loan_request_id,
          loan_status: item.status,
        });
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Found ${items.length} loan requests in reviewing`);
  return items;
}

async function getTicketsByLoanRequestId(loanRequestId) {
  const searchKey = `IDENT|${loanRequestId}`;

  const params = {
    TableName: CUSTOMER_TICKETS_TABLE,
    IndexName: "search_index",
    KeyConditionExpression: "#search = :searchValue",
    ExpressionAttributeNames: { "#search": "search" },
    ExpressionAttributeValues: { ":searchValue": searchKey },
  };

  const response = await dynamodb.query(params).promise();
  return response.Items;
}

(async () => {
  try {
    const loanRequests = await getLoanRequestsInReviewing();

    console.log(
      "\n------------------------------ Checking existence in customer_tickets_records -------------------------",
    );

    let existsCount = 0;
    let notExistsCount = 0;

    for (const { loan_request_id, loan_status } of loanRequests) {
      const tickets = await getTicketsByLoanRequestId(loan_request_id);

      if (tickets.length === 0) {
        console.log(
          `[NOT FOUND] loan_request_id: ${loan_request_id} | loan_status: ${loan_status} | ticket: NOT IN TABLE`,
        );
        notExistsCount++;
      } else {
        for (const ticket of tickets) {
          console.log(
            `[FOUND]     loan_request_id: ${loan_request_id} | loan_status: ${loan_status} | ticket_status: ${ticket.status} | ticket_pk: ${ticket.pk}`,
          );
        }
        existsCount++;
      }
    }

    console.log(
      "\n------------------------------ Summary -------------------------",
    );
    console.log(`  Total loan requests in reviewing : ${loanRequests.length}`);
    console.log(`  Found in customer_tickets_records: ${existsCount}`);
    console.log(`  NOT in customer_tickets_records  : ${notExistsCount}`);
    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
