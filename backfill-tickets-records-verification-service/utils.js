const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB.DocumentClient();

function getQueryParams(loanRequestId, typeValue) {
  return {
    TableName: TABLE_NAME,
    IndexName: TYPE_INDEX,
    KeyConditionExpression:
      "#type = :typeValue AND begins_with(#sk, :skPrefix)",
    ExpressionAttributeNames: {
      "#type": "type",
      "#sk": "sk",
    },
    ExpressionAttributeValues: {
      ":typeValue": typeValue,
      ":skPrefix": `TICKET_REQUEST|${loanRequestId}`,
    },
  };
}

const query = async (params) => dynamodb.query(params).promise();

module.exports = {
  getQueryParams,
  query,
};
