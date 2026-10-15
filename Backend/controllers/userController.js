const connection = require("../config/db");
const bcrypt = require("bcrypt");

const createUser = async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  if (role && role !== "admin" && role !== "officer") {
    return res.status(400).json({
      message: "Role must be admin or officer",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userinsertion = `
            INSERT INTO users
            (
                username,
                password,
                role
            )
            VALUES (?, ?, ?)
        `;

    const values = [username, hashedPassword, role || "officer"];

    connection.query(userinsertion, values, (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            message: "Username already exists",
          });
        }

        return res.status(500).json({
          message: "Failed to create user",
          error: err.message,
        });
      }

      res.status(201).json({
        message: "User created successfully",
        user_id: result.insertId,
      });
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to hash password",
      error: error.message,
    });
  }
};
const getUsers = (req, res) => {
  const userselection = `
        SELECT
            user_id,
            username,
            role,
            is_active,
            created_at
        FROM users
        ORDER BY user_id DESC
    `;

  connection.query(userselection, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get users",
        error: err.message,
      });
    }

    res.status(200).json({
      message: "Users retrieved successfully",
      users: results,
    });
  });
};
const getUserById = (req, res) => {
  const { id } = req.params;

  const getuserbyId = `
        SELECT
            user_id,
            username,
            role,
            is_active,
            created_at
        FROM users
        WHERE user_id = ?
    `;

  connection.query(getuserbyId, [id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get user",
        error: err.message,
      });
    }

    // User not found
    if (results.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User retrieved successfully",
      user: results[0],
    });
  });
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, password, role, is_active } = req.body;

  // Username is required
  if (!username || !username.trim()) {
    return res.status(400).json({
      message: "Username is required",
    });
  }

  // Validate role
  if (role !== undefined && role !== "admin" && role !== "officer") {
    return res.status(400).json({
      message: "Role must be admin or officer",
    });
  }

  // Validate is_active
  if (
    is_active !== undefined &&
    is_active !== true &&
    is_active !== false &&
    is_active !== 0 &&
    is_active !== 1
  ) {
    return res.status(400).json({
      message: "is_active must be 0, 1, true or false",
    });
  }

  try {
    // Hash password only when a new password is provided
    let sql;
    let values;

    if (password !== undefined && password !== "") {
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters long",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      sql = `
        UPDATE users
        SET username = ?,
            password = ?,
            role = COALESCE(?, role),
            is_active = COALESCE(?, is_active)
        WHERE user_id = ?
      `;

      values = [
        username.trim(),
        hashedPassword,
        role ?? null,
        is_active === undefined ? null : Number(is_active),
        id,
      ];
    } else {
      // Keep the existing password if no new password is provided
      sql = `
        UPDATE users
        SET username = ?,
            role = COALESCE(?, role),
            is_active = COALESCE(?, is_active)
        WHERE user_id = ?
      `;

      values = [
        username.trim(),
        role ?? null,
        is_active === undefined ? null : Number(is_active),
        id,
      ];
    }

    connection.query(sql, values, (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            message: "Username already exists",
          });
        }

        return res.status(500).json({
          message: "Failed to update user",
          error: err.message,
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "User not found or no changes made",
        });
      }

      return res.status(200).json({
        message: "User updated successfully",
        user_id: id,
      });
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to hash password",
    });
  }
};

const deleteUser = (req, res) => {
  const { id } = req.params;

  const deactivateuser = `
        UPDATE users
        SET is_active = 0
        WHERE user_id = ?
    `;

  connection.query(deactivateuser, [id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to deactivate user",
        error: err.message,
      });
    }

    // User not found
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User deactivated successfully",
      user_id: id,
    });
  });
};
module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
};
