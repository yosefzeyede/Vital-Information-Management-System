const connection = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const loginUser = (req, res) => {
  let { username, password } = req.body || {};

  // 1. Validate required fields and data types
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.trim() === "" ||
    password.length === 0
  ) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  // 2. Normalize username
  username = username.trim();

  // Match the users table username length
  if (username.length > 50) {
    return res.status(400).json({
      message: "Username must not exceed 50 characters",
    });
  }

  // 3. Check JWT secret configuration
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured");

    return res.status(500).json({
      message: "Login service is not properly configured",
    });
  }

  // 4. Find user by username
  const sql = `
    SELECT
      user_id,
      username,
      password,
      role,
      is_active
    FROM users
    WHERE username = ?
    LIMIT 1
  `;

  connection.query(sql, [username], async (err, results) => {
    if (err) {
      console.error("Login database error:", err.code);

      return res.status(500).json({
        message: "Login failed due to a database error",
      });
    }

    // 5. Reject unknown usernames
    if (results.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const user = results[0];

    // 6. Reject inactive accounts
    if (
      user.is_active === 0 ||
      user.is_active === false ||
      user.is_active === "0"
    ) {
      return res.status(403).json({
        message: "User account is inactive",
      });
    }

    try {
      // 7. Compare the submitted password with the stored hash
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return res.status(401).json({
          message: "Invalid username or password",
        });
      }

      // 8. Validate the role stored in the database
      if (!["admin", "officer"].includes(user.role)) {
        console.error("Invalid role configured for user:", user.user_id);

        return res.status(403).json({
          message: "User account has an invalid role",
        });
      }

      // 9. Create JWT token
      const token = jwt.sign(
        {
          user_id: user.user_id,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
        },
      );

      // 10. Return token and safe user information
      return res.status(200).json({
        message: "Login successful",
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Login processing error:", error.message);

      return res.status(500).json({
        message: "Login could not be completed",
      });
    }
  });
};

module.exports = {
  loginUser,
};
