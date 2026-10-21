const express = require("express");
const router = express.Router();

const connection = require("../config/db");
const verifyToken = require("../middleware/authMiddleware");

router.get("/summary", verifyToken, async (req, res) => {
  try {
    const db = connection.promise();

    const sql = `
      SELECT
        (SELECT COUNT(*) FROM persons) AS total_persons,

        (SELECT COUNT(*) FROM vital_records)
          AS total_records,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE status = 'Pending')
          AS pending_records,

        (SELECT COUNT(*)
         FROM certificates
         WHERE status = 'Active')
          AS active_certificates,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE record_type = 'Birth')
          AS total_births,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE record_type = 'Death')
          AS total_deaths,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE record_type = 'Marriage')
          AS total_marriages,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE record_type = 'Divorce')
          AS total_divorces,

        (SELECT COUNT(*)
         FROM vital_records
         WHERE record_type = 'Adoption')
          AS total_adoptions
    `;

    const [rows] = await db.query(sql);

    res.status(200).json({
      message: "Dashboard summary retrieved successfully",
      summary: rows[0],
    });
  } catch (error) {
    console.error("Dashboard summary error:", error.message);

    res.status(500).json({
      message: "Failed to retrieve dashboard summary",
    });
  }
});

module.exports = router;
