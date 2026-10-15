const express = require("express");
const router = express.Router();

const {
  createVitalRecord,
  getVitalRecords,
  getVitalRecordById,
  updateVitalRecord,
  deleteVitalRecord,
} = require("../controllers/vitalRecordController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage vital records
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createVitalRecord,
);

router.get(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getVitalRecords,
);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getVitalRecordById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateVitalRecord,
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  deleteVitalRecord,
);

module.exports = router;
