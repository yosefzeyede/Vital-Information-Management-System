const express = require("express");
const router = express.Router();

const {
  createDivorce,
  getDivorces,
  getDivorceById,
  updateDivorce,
  approveDivorce,
  cancelDivorce,
} = require("../controllers/divorceController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage divorce records
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createDivorce,
);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getDivorces);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getDivorceById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateDivorce,
);

// Only Admin can approve divorce records
router.patch(
  "/:id/approve",
  verifyToken,
  authorizeRoles("admin"),
  approveDivorce,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelDivorce,
);

module.exports = router;
