const express = require("express");
const router = express.Router();

const {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} = require("../controllers/locationController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Admin and Officer can manage locations
router.post(
  "/",
  verifyToken,
  authorizeRoles("admin", "officer"),
  createLocation,
);

router.get("/", verifyToken, authorizeRoles("admin", "officer"), getLocations);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getLocationById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updateLocation,
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  deleteLocation,
);

module.exports = router;
