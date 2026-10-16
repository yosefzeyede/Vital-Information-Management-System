const jwt = require("jsonwebtoken");
const connection = require("../config/db");
require("dotenv").config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Access denied. Token is required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const sql = `
      SELECT user_id, username, role, is_active
      FROM users
      WHERE user_id = ?
    `;

    connection.query(sql, [decoded.user_id], (err, results) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to verify user",
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          message: "User account not found",
        });
      }

      const user = results[0];

      if (Number(user.is_active) !== 1) {
        return res.status(403).json({
          message: "User account is inactive",
        });
      }

      // Use the current database role, not the role in the old token
      req.user = {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
      };

      next();
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

module.exports = verifyToken;
