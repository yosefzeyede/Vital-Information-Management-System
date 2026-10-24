const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const { dashboard } = require("../controllers/dashboardController");

router.get("/summary", verifyToken, dashboard);
module.exports = router;
