const express = require("express");
const router = express.Router();

const {
  createAdoption,
  getAdoptions,
  getAdoptionById,
  updateAdoption,
  approveAdoption,
  cancelAdoption,
} = require("../controllers/adoptionController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage adoption records
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createAdoption,
);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getAdoptions);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getAdoptionById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateAdoption,
);

// Only Admin can approve adoption records
router.patch(
  "/:id/approve",
  verifyToken,
  authorizeRoles("admin"),
  approveAdoption,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelAdoption,
);

module.exports = router;
