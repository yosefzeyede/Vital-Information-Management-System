const express = require("express");
const router = express.Router();

const {
  createPerson,
  getPersons,
  getPersonById,
  updatePerson,
  deletePerson,
} = require("../controllers/personController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Both admin and officer can manage persons
router.get("/", verifyToken, authorizeRoles("admin", "officer"), getPersons);

router.post("/", verifyToken, authorizeRoles("admin", "officer"), createPerson);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getPersonById,
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  updatePerson,
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  deletePerson,
);

module.exports = router;
