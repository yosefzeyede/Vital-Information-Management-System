const mysql = require("mysql2");
require("dotenv").config();

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

connection.getConnection((err, conn) => {
  if (err) {
    console.error("Database connection failed:", err.message);
    return;
  }

  console.log("MySQL database connected successfully");
  conn.release();
});

module.exports = connection;
