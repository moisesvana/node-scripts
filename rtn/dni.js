import axios from "axios";
import https from 'https';

export class GetDNIInformation {

    API_URL = 'https://citaconsular.sreci.gob.hn/citaconsular/pages/layout/censoRNP.php';

    // API_URL = 'https://181.210.13.83:443/citaconsular/pages/layout/censoRNP.php'; 

    AGENT = new https.Agent({
        rejectUnauthorized: false
    });


    async getDniInformation(idNumber){
        const postData = 'identidad='+idNumber
        const config = {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            httpsAgent: this.AGENT
          };

          console.log("url " + this.API_URL);

        const response = await  axios.post(this.API_URL,postData, config)
        const responseData = response.data;
        const regexPattern = /^(.*?) (\d{4}-\d{2}-\d{2}) (\w+)$/;
        const matchResult = responseData.match(regexPattern);
        let jsonResponse = {}
        if (matchResult) {
          const [, name, birthday, gender] = matchResult;
          jsonResponse = {
            name,
            birthday,
            gender,
          };
        }
        return jsonResponse;
    }
}


const t = new GetDNIInformation();
// 0801198418841
// 0509199800723
// 0501199600230
const idNumber = '0501199600230'
const jsonResponse =  await t.getDniInformation(idNumber);
console.log(jsonResponse)

export default GetDNIInformation;