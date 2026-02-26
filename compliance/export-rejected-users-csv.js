import fs from "fs";

const INPUT_FILE = "./logs/loan-requests-by-rejected-user.json";
const OUTPUT_FILE = "./logs/rejected-users-report.csv";

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));

const filtered = data.filter(
  (entry) => entry.should_reject_next_loan_request === true,
);

const rows = data.map((entry) => {
  const releasedLoan = (entry.loans || []).find(
    (loan) => loan.status === "released",
  );

  return {
    user_id: entry.user_id ?? "",
    country: entry.country ?? "",
    id_number: entry.id_number ?? "",
    reviewing: entry?.reviewing ? "SI" : "NO",
    rejection_created_at: entry.rejection_info?.created_at ?? "",
    released_loan_id: releasedLoan?.loan_id ?? "",
    principal_amount: releasedLoan?.principal_amount ?? "",
    loan_created_at: releasedLoan?.created_at ?? "",
  };
});

const headers = [
  "user_id",
  "country",
  "id_number",
  "reviewing",
  "rejection_created_at",
  "released_loan_id",
  "principal_amount",
  "loan_created_at",
];

const csvLines = [
  headers.join(","),
  ...rows.map((row) =>
    headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(","),
  ),
];

fs.writeFileSync(OUTPUT_FILE, csvLines.join("\n"), "utf-8");

console.log(`Done. ${rows.length} records exported to ${OUTPUT_FILE}`);
