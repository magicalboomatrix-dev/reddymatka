require("dotenv").config();
const fs = require("fs");
const mysql = require("mysql2/promise");

async function generateSchema() {

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "your_database_name"
});

const [tables] = await connection.query(`
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = DATABASE()
ORDER BY table_name
`);

let output = `# Database Schema\n\n`;

for (const table of tables) {

  const tableName = table.TABLE_NAME;

  output += `## ${tableName}\n\n`;

  const [columns] = await connection.query(`
  SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_DEFAULT,
    EXTRA
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
  AND table_name = ?
  ORDER BY ORDINAL_POSITION
  `,[tableName]);

  output += `| Column | Type | Nullable | Key | Default | Extra |\n`;
  output += `|-------|------|----------|-----|---------|-------|\n`;

  for (const col of columns) {

    output += `| ${col.COLUMN_NAME} | ${col.COLUMN_TYPE} | ${col.IS_NULLABLE} | ${col.COLUMN_KEY} | ${col.COLUMN_DEFAULT ?? ""} | ${col.EXTRA} |\n`;

  }

  output += `\n\n`;
}

fs.writeFileSync("dbschema.md", output);

console.log("✅ dbschema.md generated successfully");

await connection.end();
}

generateSchema();