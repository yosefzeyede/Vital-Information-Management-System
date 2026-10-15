const express = require("express");
const router = express.Router();

const {
  createBirth,
  getBirths,
  getBirthById,
  updateBirth,
  cancelBirth,
} = require("../controllers/birthController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage birth records
router.post("/", verifyToken, authorizeRoles("admin", "officer"), createBirth);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getBirths);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getBirthById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateBirth,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelBirth,
);

module.exports = router;
