const express = require("express");
const router = express.Router();

const {
  createMarriage,
  getMarriages,
  getMarriageById,
  updateMarriage,
  cancelMarriage,
  approveMarriage,
} = require("../controllers/marriageController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage marriage records
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createMarriage,
);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getMarriages);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getMarriageById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateMarriage,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelMarriage,
);

router.patch(
  "/:id/approve",
  verifyToken,
  authorizeRoles("admin"),
  approveMarriage,
);

module.exports = router;
