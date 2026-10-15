const express = require("express");
const router = express.Router();

const {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  cancelCertificate,
} = require("../controllers/certificateController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage certificates
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createCertificate,
);

router.get(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getAllCertificates,
);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getCertificateById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateCertificate,
);

router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRoles("admin", "officer"),
  cancelCertificate,
);

module.exports = router;
