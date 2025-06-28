const AWS = require("aws-sdk");
const fs = require("fs");

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = "internal_users_dev";
const JSON_FILE_PATH = "users-backup-2025-06-27T20-42-05-375Z-role-ok.json";

function loadUsersFromJson(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error leyendo el archivo JSON:", error);
    throw error;
  }
}

async function updateUserRole(user) {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      pk: user.pk,
      sk: user.sk,
    },
    UpdateExpression:
      "set #props.#role = :role, #props.#updated_at = :updated_at",
    ExpressionAttributeNames: {
      "#props": "props",
      "#role": "role",
      "#updated_at": "updated_at",
    },
    ExpressionAttributeValues: {
      ":role": user.props.role,
      ":updated_at": new Date().toISOString(),
    },
    ReturnValues: "UPDATED_NEW",
  };

  try {
    const result = await dynamodb.update(params).promise();
    return { success: true, user: user, result };
  } catch (error) {
    return { success: false, user: user, error: error.message };
  }
}

async function updateAllUserRoles(users) {
  console.log(
    `Iniciando actualización de roles para ${users.length} usuarios...`
  );

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const successes = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    console.log(
      `Procesando usuario ${i + 1}/${users.length}: ${
        user.email || user.shown_id
      }`
    );

    const result = await updateUserRole(user);

    if (result.success) {
      successCount++;
      successes.push({
        pk: user.pk,
        sk: user.sk,
        email: user.email || user.shown_id,
        role: user.props.role,
      });
      console.log(
        `✅ Actualizado: ${user.email || user.shown_id} - Rol: ${
          user.props.role
        }`
      );
    } else {
      errorCount++;
      errors.push({
        pk: user.pk,
        sk: user.sk,
        email: user.email || user.shown_id,
        error: result.error,
      });
      console.error(
        `❌ Error: ${user.email || user.shown_id} - ${result.error}`
      );
    }

    if (i % 10 === 0 && i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (successes.length > 0) {
    const successFileName = `roles-updated-success-${timestamp}.json`;
    fs.writeFileSync(successFileName, JSON.stringify(successes, null, 2));
    console.log(
      `✅ Usuarios actualizados exitosamente guardados en: ${successFileName}`
    );
  }

  if (errors.length > 0) {
    const errorFileName = `roles-updated-errors-${timestamp}.json`;
    fs.writeFileSync(errorFileName, JSON.stringify(errors, null, 2));
    console.log(`❌ Errores guardados en: ${errorFileName}`);
  }

  console.log(`\n📊 Resumen:`);
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📈 Total procesados: ${users.length}`);
}

async function main() {
  try {
    console.log(`📁 Leyendo archivo: ${JSON_FILE_PATH}`);

    if (!fs.existsSync(JSON_FILE_PATH)) {
      console.error(`❌ Error: El archivo ${JSON_FILE_PATH} no existe`);
      process.exit(1);
    }

    const users = loadUsersFromJson(JSON_FILE_PATH);

    if (!Array.isArray(users) || users.length === 0) {
      console.error(
        "❌ Error: El archivo JSON no contiene un array válido de usuarios"
      );
      process.exit(1);
    }

    console.log(`📊 Total de usuarios encontrados: ${users.length}`);

    const usersWithRole = users.filter(
      (user) => user.props && user.props.role && user.props.role.trim() !== ""
    );

    console.log(`📊 Usuarios con rol definido: ${usersWithRole.length}`);

    if (usersWithRole.length === 0) {
      console.log(
        "⚠️  No se encontraron usuarios con roles definidos para actualizar"
      );
      process.exit(0);
    }

    console.log(
      `🚀 Iniciando actualización automática de ${usersWithRole.length} usuarios en la tabla ${TABLE_NAME}...`
    );

    await updateAllUserRoles(usersWithRole);

    console.log("\n🎉 Proceso completado!");
  } catch (error) {
    console.error("❌ Error en el proceso principal:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
