import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;
const CUSTOMER_TICKETS_TABLE = process.env.CUSTOMER_TICKETS_TABLE;

/**
 *
 * 1. validar falsos positivos por proceso automatico - document_sent y ticket created
 * 2. validar falsos positivos cuando estan en document_sent pero el ticket ya esta en completed y envia otro ticket durante el proceso de ejecucion.
 */

async function getLoanRequestIdsInDocumentSent() {
  console.log(
    "\n------------------------------ Getting loan requests in document_sent -------------------------",
  );

  const loanRequestIds = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: LOAN_REQUEST_STATE_TABLE,
      IndexName: "status_index",
      KeyConditionExpression: "#status = :statusValue",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":statusValue": "document_sent" },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await dynamodb.query(params).promise();

    for (const item of response.Items) {
      if (item.loan_request_id) {
        loanRequestIds.push(item.loan_request_id);
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(
    `Found ${loanRequestIds.length} loan_request_id in document_sent`,
  );
  return loanRequestIds;
}

async function checkIfTicketIsCompleted(loanRequestIds) {
  console.log(
    "\n------------------------------ Check which tickets are with status completed -------------------------",
  );

  const ticketsToReview = [];

  for (const loanRequestId of loanRequestIds) {
    const searchKey = `IDENT|${loanRequestId}`;

    const params = {
      TableName: CUSTOMER_TICKETS_TABLE,
      IndexName: "search_index",
      KeyConditionExpression: "#search = :searchValue",
      ExpressionAttributeNames: { "#search": "search" },
      ExpressionAttributeValues: { ":searchValue": searchKey },
      //Limit: 1,
      //ScanIndexForward: false,
    };

    const response = await dynamodb.query(params).promise();
    const ticketsByIdent = response.Items;
    const ticketsCounter = ticketsByIdent.length;

    const tickets = [];
    let ticketToReview = false;
    let ticketCompletedToReview;
    for (const ticket of ticketsByIdent) {
      ticketCompletedToReview = null;
      const ticketPk = ticket.pk;
      const ticketStatus = ticket.status;

      tickets.push({
        ticket_pk: ticketPk,
        ticket_status: ticketStatus,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      });

      if (ticketStatus === "pending" || ticketStatus === "assigned") {
        ticketToReview = false;
        break;
      } else if (ticketStatus === "completed" || ticketStatus === "created") {
        ticketToReview = true;
        ticketCompletedToReview = ticket;
      }
    }

    if (ticketToReview) {
      ticketsToReview.push({
        loan_request_id: loanRequestId,
        tickets_counter: ticketsCounter,
        user_id: ticketCompletedToReview?.props?.user_id || null,
        type: ticketCompletedToReview?.props?.type || null,
        user: ticketCompletedToReview?.user || null,
        status: ticketCompletedToReview?.status || null,
        verification_id:
          ticketCompletedToReview?.props?.verification_id || null,
        tickets,
        create_at: ticketCompletedToReview.created_at,
        updated_at: ticketCompletedToReview.updated_at,
      });
    }
  }

  console.log(`Found ${ticketsToReview.length} to fix`);
  return ticketsToReview;
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
    const loanRequestsInDocumentSent = await getLoanRequestIdsInDocumentSent();
    const ticketsToReview = await checkIfTicketIsCompleted(
      loanRequestsInDocumentSent,
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    saveResultsToFile(ticketsToReview, `ticket_to_review-${timestamp}.json`);

    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error in main process:", err);
    process.exit(1);
  }
})();
