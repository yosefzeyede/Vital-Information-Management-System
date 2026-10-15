const express = require("express");
const router = express.Router();

const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/userController");

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Only authenticated admins can manage user accounts
router.post("/", verifyToken, authorizeRoles("admin", "officer"), createUser);
router.get("/", verifyToken, authorizeRoles("admin", "officer"), getUsers);
router.get(
  "/:id",
  verifyToken,
  authorizeRoles("admin", "officer"),
  getUserById,
);
router.put("/:id", verifyToken, authorizeRoles("admin"), updateUser);
router.delete("/:id", verifyToken, authorizeRoles("admin"), deleteUser);

module.exports = router;
