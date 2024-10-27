const axios = require("axios");
const fs = require("fs");
const path = require("path");
const writeXlsxFile = require("write-excel-file/node");
require("dotenv").config();

const HEADER_ROW = [
  {
    value: "Email",
    fontWeight: "bold",
  },
  {
    value: "has_valid_first_name",
    fontWeight: "bold",
  },
  {
    value: "has_valid_last_name",
    fontWeight: "bold",
  },
  {
    value: "response",
    fontWeight: "bold",
  },
];

const HEADER_ROW_2 = [
  {
    value: "total analyzed",
    fontWeight: "bold",
  },
  {
    value: "success %",
    fontWeight: "bold",
  },
];

const excelData = [HEADER_ROW];
const excelDataTwo = [HEADER_ROW_2];

const usersPath = path.join(__dirname, "users.json");
const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
// const contacts = [
//   {
//     firstName: "Leslie Fabiola",
//     lastName: "Valdez Ramirez",
//     email: "lvaldez@mineduc.gob.gt",
//   },
//   {
//     firstName: "Heleodoro Tomas",
//     lastName: "Mateo Suar",
//     email: "htms205@gmail.com",
//   },
//   {
//     firstName: "Jorge Aroldo",
//     lastName: "Ortíz Gaitán",
//     email: "jorgearoortiz@gmail.com",
//   },
//   {
//     firstName: "Miguel Angel",
//     lastName: "Capriel Mo",
//     email: "miguelcapriel82@gmail.com",
//   },
//   {
//     firstName: "Miriam Carina",
//     lastName: "Lorenzana Diaz",
//     email: "miriamlorenzana18@gmail.com",
//   },
//   {
//     firstName: "Yasmin Edith",
//     lastName: "Dávila Mejía",
//     email: "yasmineditdavilamejia123@gmail.com",
//   },
//   {
//     firstName: "Carlos",
//     lastName: "Gonzales Y Gonzales",
//     email: "Carlosgonzales@gmail.com",
//   },
//   {
//     firstName: "Eduardo Luis",
//     lastName: "Carpio Rodríguez",
//     email: "eduardoluiscarpio@hotmail.com",
//   },
//   {
//     firstName: "Nimcy Aracely",
//     lastName: "Lemuz Tevalan",
//     email: "michiteva@gmail.com",
//   },
//   {
//     firstName: "Carlos Armando",
//     lastName: "Amézquita Vargas",
//     email: "carlosandroid2001@gmail.com",
//   },
//   {
//     firstName: "Kevin Estuardo",
//     lastName: "Marroquin Hernandez",
//     email: "estuardoh612@gmail.com",
//   },
//   {
//     firstName: "Carlos Enrique",
//     lastName: "Caal Caal",
//     email: "carloscaal2011@hotmail.es",
//   },
//   {
//     firstName: "Diego Ivan",
//     lastName: "Orellana Alvarez",
//     email: "diegoorellanacaraudio@gmail.com",
//   },
//   {
//     firstName: "Fernando",
//     lastName: "Gatica Girón",
//     email: "gaticafernando90@gmail.com",
//   },
//   { firstName: "Oswal", lastName: "Chub", email: "oswaldrehen@gmail.com" },
//   {
//     firstName: "Mauricio Daniel",
//     lastName: "Caal Bin",
//     email: "danielbin5389@gmail.com",
//   },
//   {
//     firstName: "Vinicio Eduardo Castillo Lara",
//     lastName: "Castillo Lara",
//     email: "viniciocastillo905@gmail.com",
//   },
//   {
//     firstName: "Quelvin Yovani Jiménez",
//     lastName: "Jiménez",
//     email: "kelvinjimenez@hotmail.es",
//   },
//   {
//     firstName: "Uriel Ocazias",
//     lastName: "Ovalle Mendoza",
//     email: "aracelycamokejia123456@gmail.com",
//   },
//   { firstName: "Gregorio", lastName: "Xoy Cho", email: "gregorxoy@gmail.com" },
//   {
//     firstName: "Luis Armando",
//     lastName: "Saravia Curruchich",
//     email: "Mariacurruchich447@gmail.com",
//   },
//   {
//     firstName: "Kelvin Luis",
//     lastName: "Veles Veliz",
//     email: "luisitoveles456@gmail.com",
//   },
//   {
//     firstName: "Diana Mishel",
//     lastName: "Lutin Gomez",
//     email: "cutelutinmaryoryyuleimy@gmail.com",
//   },
//   {
//     firstName: "Adriana Miriam Janneth",
//     lastName: "Toj Ramos",
//     email: "atoj620@gmail.com",
//   },
//   {
//     firstName: "Edlin Edithza",
//     lastName: "Pérez Miranda",
//     email: "perezmiranda@hotmail.com",
//   },
//   {
//     firstName: "Willson Amilcar",
//     lastName: "López Orozco",
//     email: "wilsonlophers@gmail.com",
//   },
//   {
//     firstName: "Reyna Rubith",
//     lastName: "Ramírez Sagastume",
//     email: "jesseb10ramirez@gmail.com",
//   },
//   {
//     firstName: "Ervin Roberto",
//     lastName: "Moreno Alvarado",
//     email: "ervinalvarado42@gmail.com",
//   },
//   {
//     firstName: "Carlos Javier",
//     lastName: "Díaz Amenábar",
//     email: "sistemaskda@gmail.com",
//   },
//   {
//     firstName: "Edgar Adolfo",
//     lastName: "Garcia Ramos",
//     email: "Eg2729369@gmail.com",
//   },
//   {
//     firstName: "Edgar Leonardo",
//     lastName: "Barrios Alvarado",
//     email: "ebarrios178@gmail.com",
//   },
//   {
//     firstName: "Jenifer Andrea",
//     lastName: "Hernández Pensamiento",
//     email: "andrea11.hernandez5@gmail.com",
//   },
// ];
const contacts = users.slice(0, 100);

const prompt =
  "Provide me, if this email has any latin america firstname or lastname. Email: [[EMAIL]]. Returns the information as a valid JSON and ONLY THE JSON, so i can parse it, with this keys: 'first_name', 'last_name', 'has_valid_first_name', 'has_valid_last_name', 'first_name_details', 'last_name_details'";

const MODEL = "gpt-4";
console.log("MODEL :>> ", MODEL);
const token = process.env.TOKEN_API;
const fileName = `report-v2-${MODEL}`;
const sendMessage = async (message) => {
  const endpoint = `https://api.openai.com/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const body = {
    model: MODEL,
    messages: [{ role: "user", content: message }],
  };

  try {
    const response = await axios.post(endpoint, body, {
      headers,
      timeout: 30000,
    });
    return response?.data?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error("Error OPEN AI:", String(error));
    throw error;
  }
};
let success = 0;
(async () => {
  for (const person of contacts) {
    const email = person.personal_email;

    //const message = `When I give you an email. If the name, last name, nonDiminutiveName cannot be definitely identified return an empty string as value. Take into consideration that we are working with a latino user base: 1. If it does include a name add a key for name. If you detect the name in the email contains diminutive name or nickname, add another key with nonDiminutiveName 2. if it does include a clear last name add a key for lastName The email is: ${email} No explanations is needed just return a JSON.`;
    const message = prompt.replace("[[EMAIL]]", email);

    try {
      //console.log(message);
      const response = await sendMessage(message);
      console.log("response :>> ", response);
      const cleanJson = response.replace(/```json|```/gi, "");
      const jsonParsed = JSON.parse(cleanJson);
      console.log("jsonParsed", jsonParsed);

      console.log(
        "has_valid_first_name :>> ",
        jsonParsed?.has_valid_first_name
      );
      console.log("has_valid_last_name :>> ", jsonParsed?.has_valid_last_name);
      if (jsonParsed?.has_valid_first_name && jsonParsed?.has_valid_last_name) {
        success++;
        console.log("success");
      }
      const row = [
        { type: String, value: email },
        { type: String, value: String(jsonParsed?.has_valid_first_name) },
        { type: String, value: String(jsonParsed?.has_valid_last_name) },
        { type: String, value: cleanJson },
      ];

      excelData.push(row);
    } catch (error) {
      console.log(error);
      fs.appendFileSync(
        `${fileName}.log`,
        `Error processing email ${email}: ${String(error)}\n`
      );
    }

    // console.log("response", JSON.stringify(response));
  }

  const totalAnalyzed = contacts.length;
  const totalSuccess = (success / contacts.length) * 100;
  const row2 = [
    { type: String, value: String(totalAnalyzed) },
    { type: String, value: String(totalSuccess) },
  ];

  excelDataTwo.push(row2);
  await writeXlsxFile([excelData, excelDataTwo], {
    sheets: ["Sheet 1", "Sheet 2"],
    filePath: `${fileName}.xlsx`,
  });
  console.log("Total analyzed :>> ", totalAnalyzed);
  console.log("Success % ", totalSuccess);
})();
