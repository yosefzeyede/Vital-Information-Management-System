const express = require("express");
const router = express.Router();

const {
  createDeath,
  getDeaths,
  getDeathById,
  updateDeath,
  cancelDeath,
} = require("../controllers/deathController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage death records
router.post("/", verifyToken, authorizeRoles("admin", "officer"), createDeath);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getDeaths);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getDeathById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateDeath,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelDeath,
);

module.exports = router;
