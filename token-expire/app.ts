import { jwtDecode } from "jwt-decode";

interface JWT {
  exp: number;
  iat: number;
  // Add other expected properties from your JWT here
}

function isTokenExpired(token: string): boolean {
  try {
    const decoded: JWT = jwtDecode(token);
    console.log("decoded :>> ", JSON.stringify(decoded, null, 2));
    const currentTime = Date.now() / 1000; // Current time in seconds
    return decoded.exp < currentTime;
  } catch (error) {
    console.error("Failed to decode token", error);
    return true; // Assume expired if there is an error decoding
  }
}

// Example usage
const token =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6InJQc3paVFF5R0xoZ2lhelciLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzEzNjY5ODc4LCJpYXQiOjE3MTM2NjYyNzgsImlzcyI6Imh0dHBzOi8vemVia2Rzamt0Y2Z1Y2lycm52amsuc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6Ijk4YTI2OGRiLTI4OTgtNGIwZS1hODliLTRjYTI0NzYyN2M0MyIsImVtYWlsIjoiIiwicGhvbmUiOiI0NzA3NzU3OSIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6InBob25lIiwicHJvdmlkZXJzIjpbInBob25lIl19LCJ1c2VyX21ldGFkYXRhIjp7ImFwZWxsaWRvIjoiQ2VybWXDsW8gc3RnIiwiY2l1ZGFkIjoiR3VhdGVtYWxhIiwiY29kaWdvX3Bvc3RhbCI6IjAwNzY2IiwiZGlyZWNjaW9uIjoiR3VhdGVtYWxhYWEgc3RnIiwibm9tYnJlIjoiTW9pc2VzIiwicGFpcyI6Ikd1YXRlbWFsYSIsInRlbGVmb25vIjoiNDcwNzc1NzkiLCJ1c3VhcmlvX2lkIjoiOThhMjY4ZGItMjg5OC00YjBlLWE4OWItNGNhMjQ3NjI3YzQzIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib3RwIiwidGltZXN0YW1wIjoxNzA5ODY0OTA2fV0sInNlc3Npb25faWQiOiIwZjAzZDEyMC0yYjdlLTRiN2EtYTdlNy1iMGU1M2FhOTQ1MTAiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.9VIKV1HMMmnth77mN67Kex-vtSq4qyRyOPsP-Es8ook";
if (isTokenExpired(token)) {
  console.log("Token has expired");
  // Handle token expiration, e.g., refresh the token or redirect to login
} else {
  console.log("Token is still valid");
}
