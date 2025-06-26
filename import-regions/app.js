const AWS = require("aws-sdk");
const XLSX = require("xlsx");
const { v4: uuidv4 } = require("uuid");
const R = require("ramda");

const TABLE_NAME = "geography_records";
const FILE_PATH = "regions.xlsx";
const SHEET_NAMES = ["Guatemala", "Dominicana", "Honduras", "Perú"];
const AREAS_ALLOWED = [
  "NORTE", // gt, do, HN, PE
  "ORIENTE", // gt, HN
  "CENTRAL", // gt
  "SUR", // gt, do, HN, PE
  "OESTE",
  "ESTE", // do
  "METROPOLITANA", // do
  "NORESTE",
  "SUROESTE",
  "SURESTE",
  "OCCIDENTE", // HN
  "CENTRO", // HN, PE
];

AWS.config.update({
  region: "us-east-1",
});
const docClient = new AWS.DynamoDB.DocumentClient();

function readWorkbook(filePath) {
  try {
    return XLSX.readFile(filePath);
  } catch (error) {
    console.error(`Error al leer el archivo ${filePath}:`, error);
    process.exit(1);
  }
}

function processSheet(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.warn(`La hoja "${sheetName}" no fue encontrada.`);
    return [];
  }

  let countryName = "";
  switch (sheetName) {
    case "Guatemala":
      countryName = "GT";
      break;
    case "Dominicana":
      countryName = "DO";
      break;
    case "Honduras":
      countryName = "HN";
      break;
    case "Perú":
      countryName = "PE";
      break;
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  return rows.map((row) => {
    console.log("row", JSON.stringify(row));
    let regionName = "";
    let area = "";

    switch (countryName) {
      case "GT":
        regionName = row["Departamento"];
        area = row["Región_1"];
        break;
      case "DO":
        regionName = row["Provincia"];
        area = row["Región"];
        break;
      case "HN":
        regionName = row["Departamento"];
        area = row["Región"];
        break;
      case "PE":
        regionName = row["Provincia"];
        area = row["Region"];
        break;
    }

    const country = countryName;

    const now = new Date().toISOString();

    const regionNameSanitized = sanitizedRegionName(regionName);
    const areaSanitized = sanitizedRegionName(cleanArea(area));

    console.log("countryName", countryName);
    console.log("regionName", regionName);
    console.log("regionNameSanitized", regionNameSanitized);
    console.log("areaSanitized", areaSanitized);

    return {
      pk: `REGION|${uuidv4()}`,
      sk: `COUNTRY|${country}|REGION|${regionNameSanitized.toUpperCase()}`,
      kind: "REGION",
      props: {
        area: area,
        automation_percentage: 0,
        country: country,
        modified_by: "",
        region_name: regionName,
      },
      search: `COUNTRY|${country}`,
      subsearch: `AREA|${areaSanitized.toUpperCase()}`,
      updated_at: now,
      created_at: now,
    };
  });
}

async function insertItem(item) {
  const params = {
    TableName: TABLE_NAME,
    Item: item,
  };

  try {
    console.log("item", JSON.stringify(item));
    await docClient.put(params).promise();
    console.log(`Item insertado: ${item.pk}`);
  } catch (error) {
    console.error(`Error insertando el item ${item.pk}:`, error);
  }
}

async function main() {
  const workbook = readWorkbook(FILE_PATH);
  let allItems = [];

  for (const sheetName of SHEET_NAMES) {
    console.log(`\n\n\n`);
    console.log(`Procesando hoja "${sheetName}"...`);
    const sheetItems = processSheet(workbook, sheetName);
    allItems = allItems.concat(sheetItems);
  }

  console.log(`Total de items a insertar: ${allItems.length}`);
  let c = 0;
  for (const item of allItems) {
    // if (c === 5) break;
    await insertItem(item);
    c++;
  }

  console.log("Todos los items han sido insertados.");
}

main().catch((error) => {
  console.error("Error en la ejecución:", error);
});

function replaceAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanArea(inputStr) {
  const upperInput = inputStr.toUpperCase();

  const regex = new RegExp(`\\b(${AREAS_ALLOWED.join("|")})\\b`);
  const match = upperInput.match(regex);

  return match ? match[1] : "";
}

function sanitizedRegionName(regionName) {
  return R.pipe(
    replaceAccents,
    R.toUpper,
    R.trim,
    R.replace(/\s+/g, "_")
  )(regionName);
}
