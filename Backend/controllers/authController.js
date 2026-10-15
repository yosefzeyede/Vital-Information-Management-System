const connection = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const loginUser = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  const sql = `
        SELECT
            user_id,
            username,
            password,
            role,
            is_active
        FROM users
        WHERE username = ?
    `;

  connection.query(sql, [username], async (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Login failed",
        error: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const user = results[0];

    if (!user.is_active) {
      return res.status(403).json({
        message: "User account is inactive",
      });
    }

    try {
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return res.status(401).json({
          message: "Invalid username or password",
        });
      }
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

      res.status(200).json({
        message: "Login successful",
        token: token,
        user: {
          user_id: user.user_id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Password comparison failed",
        error: error.message,
      });
    }
  });
};

module.exports = {
  loginUser,
};
