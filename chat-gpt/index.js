const axios = require("axios");
const contacts = [
  {
    firstName: "Leslie Fabiola",
    lastName: "Valdez Ramirez",
    email: "lvaldez@mineduc.gob.gt",
  },
  {
    firstName: "Heleodoro Tomas",
    lastName: "Mateo Suar",
    email: "htms205@gmail.com",
  },
  {
    firstName: "Jorge Aroldo",
    lastName: "Ortíz Gaitán",
    email: "jorgearoortiz@gmail.com",
  },
  {
    firstName: "Miguel Angel",
    lastName: "Capriel Mo",
    email: "miguelcapriel82@gmail.com",
  },
  {
    firstName: "Miriam Carina",
    lastName: "Lorenzana Diaz",
    email: "miriamlorenzana18@gmail.com",
  },
  {
    firstName: "Yasmin Edith",
    lastName: "Dávila Mejía",
    email: "yasmineditdavilamejia123@gmail.com",
  },
  {
    firstName: "Carlos",
    lastName: "Gonzales Y Gonzales",
    email: "Carlosgonzales@gmail.com",
  },
  {
    firstName: "Eduardo Luis",
    lastName: "Carpio Rodríguez",
    email: "eduardoluiscarpio@hotmail.com",
  },
  {
    firstName: "Nimcy Aracely",
    lastName: "Lemuz Tevalan",
    email: "michiteva@gmail.com",
  },
  {
    firstName: "Carlos Armando",
    lastName: "Amézquita Vargas",
    email: "carlosandroid2001@gmail.com",
  },
  {
    firstName: "Kevin Estuardo",
    lastName: "Marroquin Hernandez",
    email: "estuardoh612@gmail.com",
  },
  {
    firstName: "Carlos Enrique",
    lastName: "Caal Caal",
    email: "carloscaal2011@hotmail.es",
  },
  {
    firstName: "Diego Ivan",
    lastName: "Orellana Alvarez",
    email: "diegoorellanacaraudio@gmail.com",
  },
  {
    firstName: "Fernando",
    lastName: "Gatica Girón",
    email: "gaticafernando90@gmail.com",
  },
  { firstName: "Oswal", lastName: "Chub", email: "oswaldrehen@gmail.com" },
  {
    firstName: "Mauricio Daniel",
    lastName: "Caal Bin",
    email: "danielbin5389@gmail.com",
  },
  {
    firstName: "Vinicio Eduardo Castillo Lara",
    lastName: "Castillo Lara",
    email: "viniciocastillo905@gmail.com",
  },
  {
    firstName: "Quelvin Yovani Jiménez",
    lastName: "Jiménez",
    email: "kelvinjimenez@hotmail.es",
  },
  {
    firstName: "Uriel Ocazias",
    lastName: "Ovalle Mendoza",
    email: "aracelycamokejia123456@gmail.com",
  },
  { firstName: "Gregorio", lastName: "Xoy Cho", email: "gregorxoy@gmail.com" },
  {
    firstName: "Luis Armando",
    lastName: "Saravia Curruchich",
    email: "Mariacurruchich447@gmail.com",
  },
  {
    firstName: "Kelvin Luis",
    lastName: "Veles Veliz",
    email: "luisitoveles456@gmail.com",
  },
  {
    firstName: "Diana Mishel",
    lastName: "Lutin Gomez",
    email: "cutelutinmaryoryyuleimy@gmail.com",
  },
  {
    firstName: "Adriana Miriam Janneth",
    lastName: "Toj Ramos",
    email: "atoj620@gmail.com",
  },
  {
    firstName: "Edlin Edithza",
    lastName: "Pérez Miranda",
    email: "perezmiranda@hotmail.com",
  },
  {
    firstName: "Willson Amilcar",
    lastName: "López Orozco",
    email: "wilsonlophers@gmail.com",
  },
  {
    firstName: "Reyna Rubith",
    lastName: "Ramírez Sagastume",
    email: "jesseb10ramirez@gmail.com",
  },
  {
    firstName: "Ervin Roberto",
    lastName: "Moreno Alvarado",
    email: "ervinalvarado42@gmail.com",
  },
  {
    firstName: "Carlos Javier",
    lastName: "Díaz Amenábar",
    email: "sistemaskda@gmail.com",
  },
  {
    firstName: "Edgar Adolfo",
    lastName: "Garcia Ramos",
    email: "Eg2729369@gmail.com",
  },
  {
    firstName: "Edgar Leonardo",
    lastName: "Barrios Alvarado",
    email: "ebarrios178@gmail.com",
  },
  {
    firstName: "Jenifer Andrea",
    lastName: "Hernández Pensamiento",
    email: "andrea11.hernandez5@gmail.com",
  },
];

const sendMessage = async (message) => {
  const endpoint = `https://api.openai.com/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: ``,
  };

  const body = {
    model: "gpt-4",
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

(async () => {
  for (const person of contacts) {
    const email = person.email.split("@")[0];
    const name = `${person.firstName} ${person.lastName}`;
    const message = `When I give you an email. If the name, last name, nonDiminutiveName cannot be definitely identified return an empty string as value. Take into consideration that we are working with a latino user base: 1. If it does include a name add a key for name. If you detect the name in the email contains diminutive name or nickname, add another key with nonDiminutiveName 2. if it does include a clear last name add a key for lastName The email is: ${email} No explanations is needed just return a JSON.`;
    console.log("message", message);
    try {
      const response = await sendMessage(message);
      // console.log("response", response);
      const jsonParsed = JSON.parse(response);
      console.log("jsonParsed", jsonParsed);
    } catch (error) {
      console.log(error);
    }
    // console.log("response", JSON.stringify(response));
  }
})();
