const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = "internal_users_dev";
const TYPE_INDEX = "type_index";
const TYPE_VALUE = "ROLE";
const COUNTRIES = ["GT", "DO", "HN", "PE"];

async function scanRoles() {
  let lastEvaluatedKey = undefined;
  const allRoles = [];

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: TYPE_INDEX,
      KeyConditionExpression: "#type = :typeValue",
      ExpressionAttributeNames: {
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":typeValue": TYPE_VALUE,
      },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100,
    };
    try {
      const data = await dynamodb.query(params).promise();
      allRoles.push(...data.Items);
      lastEvaluatedKey = data.LastEvaluatedKey;
    } catch (err) {
      console.error("Error consultando DynamoDB:", err);
      break;
    }
  } while (lastEvaluatedKey);
  return allRoles;
}

async function updateRoleCountryPermissions(role) {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      pk: role.pk,
      sk: role.sk,
    },
    UpdateExpression:
      "set #props.#permissions.#country_permissions = :countries, #props.#updated_at = :updated_at",
    ExpressionAttributeNames: {
      "#props": "props",
      "#permissions": "permissions",
      "#country_permissions": "country_permissions",
      "#updated_at": "updated_at",
    },
    ExpressionAttributeValues: {
      ":countries": COUNTRIES,
      ":updated_at": new Date().toISOString(),
    },
    ReturnValues: "UPDATED_NEW",
  };
  try {
    await dynamodb.update(params).promise();
    console.log(`  ----------- Actualizado: ${role.pk}`);
  } catch (err) {
    console.error(`Error actualizando ${role.pk}:`, err);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const roles = await scanRoles();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = path.join(
    __dirname,
    "back-ups",
    `roles-backup-before-country-update-${timestamp}.json`
  );
  fs.writeFileSync(backupFileName, JSON.stringify(roles, null, 2));
  console.log(`Backup guardado en ${backupFileName}`);

  for (const role of roles) {
    try {
      console.log("Current role:", role.pk);
      const countryPerms = role.props.permissions.country_permissions;
      const hasAnyCountry = countryPerms.some((c) => COUNTRIES.includes(c));
      if (!hasAnyCountry) {
        await updateRoleCountryPermissions(role);
        await sleep(1000);
      }
    } catch (error) {
      console.error(`Error actualizando ${role.pk}:`, error);
    }
  }
  console.log("Fin del proceso, total de roles:", roles.length);
})();
