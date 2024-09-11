import { DOMParser } from "xmldom";
import axios from "axios";
import https from "https";
// w564aYBASp2TJwDcXaM7UB user id

// cfphyqtjdz377xxk4rxrYV - VV user duplicado
/*
1/ cambiar resend por login
2. verificar phone number en incognito
3. cambiar a solo Saldo: Q.123
*/


// cambiar status process


// Error getting user information: Error getting DNI information connect ECONNREFUSED 181.210.13.83:443
// "error": "Error getting user information: Error getting DNI information connect EHOSTUNREACH 179.49.112.205:443"

// 0601199402033
// 0318199501184 -- sufix 5
// 0801199009308 -- sufix 1
// 0801197302222 -- sufix 1
// Lidia Cerrato 0615199600440
// Javier Rojas 0101199203995
// Allan Casco 0825199900040
// Karen Alvarado 0801199116486
// Diana Laínez 0801198914090
export class GetRTNInformation {
  API_URL = "https://consultareclasificacionrtn.sar.gob.hn/";

  AGENT = new https.Agent({
    rejectUnauthorized: false,
  });

  //Request to get fields for the POst Request
  async getHtmlPostValues() {
    try {
      const response = await axios.get(this.API_URL, {
        httpsAgent: this.AGENT,
      });
      const doc = new DOMParser().parseFromString(String(response.data));
      const viewStateGenerator = doc
        .getElementById("__VIEWSTATEGENERATOR")
        .getAttribute("value");
      const eventValidation = doc
        .getElementById("__EVENTVALIDATION")
        .getAttribute("value");
      const viewState = doc.getElementById("__VIEWSTATE").getAttribute("value");
      const postValues = {
        __VIEWSTATE: viewState,
        __VIEWSTATEGENERATOR: viewStateGenerator,
        __EVENTVALIDATION: eventValidation,
        __LASTFOCUS: "",
        __EVENTTARGET: "",
        __EVENTARGUMENT: "",
      };
      return postValues;
    } catch (error) {
      console.log(error);
      console.error(`Error in axios: ${error.message}`);
    }
  }

  async getRtnUserInformation(idNumber) {
    const postData = await this.getHtmlPostValues();
    postData.txtCriterio = idNumber;
    postData.btnBuscar = "buscar";

    const config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      httpsAgent: this.AGENT,
    };

    const response = await axios.post(this.API_URL, postData, config);
    const doc = new DOMParser().parseFromString(String(response.data));
    const name = doc.getElementById("LblNombre")?.textContent ?? null;
    const previousSize = doc.getElementById("LblAnteriorTamano").textContent;
    const previousRegionalAddress = doc.getElementById(
      "LblAnteriorRegional"
    ).textContent;
    const currentSize = doc.getElementById("LblNuevoTamano").textContent;
    const currentRegionalAddress =
      doc.getElementById("LblNuevaRegional").textContent;

    const jsonResponse = {
      name: name,
      previous_size: previousSize,
      previous_regional_address: previousRegionalAddress,
      current_size: currentSize,
      current_regional_address: currentRegionalAddress,
    };
    console.log("jsonResponse :>> ", jsonResponse);
    return jsonResponse;
  }
}

const t = new GetRTNInformation();
const idNumber = "08011973022221";
t.getRtnUserInformation(idNumber);
export default GetRTNInformation;
