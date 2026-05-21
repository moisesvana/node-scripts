import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import axios from "axios";
import json from "big-json";
import "dotenv/config";
import fs from "fs";
import { EventBusClient } from "./event-bus-client.js";

const marshallOptions = {
  convertEmptyValues: true,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};

const unmarshallOptions = {
  wrapNumbers: false,
};

const translateConfig = { marshallOptions, unmarshallOptions };
const ddbClient = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);
const eventBusClient = new EventBusClient();
const SUBMIT_URL =
  "https://credit.api.vana-private.com/v1/users/:user_id/verifications/:verification_id/submission";
const CREATION_URL =
  "https://credit.api.vana-private.com/v1/users/:user_id/verifications"; // {{CREDIT_API_PRIVATE_HOST}}/users/me3J5KBRwHCkymUBdvNncQ/verifications
const LIST_URL =
  "https://credit.api.vana-private.com/v1/users/:user_id/verifications";

const CATEGORY_NAME = "credit-document-verification";

const readJsonFile = async (path) => {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(path);
    const parseStream = json.createParseStream();
    parseStream.on("data", resolve);
    parseStream.on("error", reject);
    readStream.pipe(parseStream);
  });
};

const submitVerification = async (userId, verificationId, data) => {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.CREDIT_PRIVATE_API_KEY,
  };
  return axios.post(
    SUBMIT_URL.replace(":user_id", userId).replace(
      ":verification_id",
      verificationId,
    ),
    data,
    { headers },
  );
};

const createVerification = async (userId, data) => {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.CREDIT_PRIVATE_API_KEY,
  };
  return axios.post(CREATION_URL.replace(":user_id", userId), data, {
    headers,
  });
};

const listVerifications = async (userId) => {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.CREDIT_PRIVATE_API_KEY,
  };
  return (await axios.get(LIST_URL.replace(":user_id", userId), { headers }))
    .data.data;
};

const getUser = async (userId) => {
  const getCommandInput = {
    TableName: "user",
    Key: {
      user_id: userId,
    },
  };
  const command = new GetCommand(getCommandInput);
  const result = await ddbDocClient.send(command);
  if (!result.Item) {
    return null;
  }
  return result.Item;
};

const getUserState = async (userId) => {
  const getCommandInput = {
    TableName: "user_state",
    Key: {
      user_id: userId,
    },
  };
  const command = new GetCommand(getCommandInput);
  const result = await ddbDocClient.send(command);
  if (!result.Item) {
    return null;
  }
  return result.Item;
};

const sleep = (delay) => {
  return new Promise((resolve) => setTimeout(resolve, delay));
};

const createVerifications = async (toCreate) => {
  for (const record of toCreate) {
    const categoryId = `${record.country.toLowerCase()}-${CATEGORY_NAME}`;
    await createVerification(record.userId, {
      data: {
        category_id: categoryId,
      },
    });
    await sleep(500);
  }
};

const submitVerificationss = async (toSubmit) => {
  for (const record of toSubmit) {
    const verifications = await listVerifications(record.userId);
    const categoryId = `${record.country.toLowerCase()}-${CATEGORY_NAME}`;
    const verification = verifications.find(
      (v) => v.category === categoryId && v.status === "required",
    );
    const [user, userState] = await Promise.all([
      getUser(record.userId),
      getUserState(record.userId),
    ]);
    const data = {
      data: {
        external_id: record.loanRequestId,
        selfie_blob_id: record.selfieBlobId,
        document_front_blob_id: record.documentFrontBlobId,
        document_back_blob_id: record.documentBackBlobId,
        id_number: userState.id_number,
        first_name: user.personal.first_name,
        last_name: user.personal.last_name,
        birthdate: user.personal.birthdate,
      },
    };
    await submitVerification(record.userId, verification.id, data);
    console.log(
      `Submitted verification for user ${record.userId} with verification id ${verification.id}`,
    );
  }
};

const main = async () => {
  const tableName = process.argv[2];
  if (!tableName) {
    throw new Error("Missing table name parameter");
  }
  const tableData = await readJsonFile(tableName);
  if (!tableData) {
    throw new Error("Error in data");
  }
  await createVerifications(tableData["toCreate"]);
  await submitVerificationss(tableData["toSubmit"]);
  //process.stdout.write(JSON.stringify(data, null, 2));
};

main();

/* 
  EXAMPLE USAGE:
  1 - node --max-old-space-size=8192 create-missing-verifications.js verifications_to_process.json
*/
