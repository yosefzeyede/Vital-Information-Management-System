const connection = require("../config/db");
const bcrypt = require("bcrypt");

// Validate positive integer IDs
const isPositiveInteger = (value) => {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return false;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0;
};

// Validate user role
const isValidRole = (role) => {
  return role === "admin" || role === "officer";
};

// Normalize is_active
const normalizeActiveStatus = (value) => {
  if (value === true || value === 1 || value === "1") {
    return 1;
  }

  if (value === false || value === 0 || value === "0") {
    return 0;
  }

  return null;
};

// Create user
const createUser = async (req, res) => {
  let { username, password, role } = req.body;

  if (
    typeof username !== "string" ||
    username.trim() === "" ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  username = username.trim();

  if (username.length > 50) {
    return res.status(400).json({
      message: "Username must not exceed 50 characters",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters long",
    });
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      message: "Password must not exceed 72 bytes",
    });
  }

  if (role === undefined || role === null || role === "") {
    role = "officer";
  }

  if (!isValidRole(role)) {
    return res.status(400).json({
      message: "Role must be admin or officer",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `;

    connection.query(sql, [username, hashedPassword, role], (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            message: "Username already exists",
          });
        }

        return res.status(500).json({
          message: "Failed to create user",
        });
      }

      return res.status(201).json({
        message: "User created successfully",
        user_id: result.insertId,
      });
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to hash password",
    });
  }
};

// Get all users
const getUsers = (req, res) => {
  const sql = `
    SELECT
      user_id,
      username,
      role,
      is_active,
      created_at
    FROM users
    ORDER BY user_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get users",
      });
    }

    return res.status(200).json({
      message: "Users retrieved successfully",
      total: results.length,
      users: results,
    });
  });
};

// Get user by ID
const getUserById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid user ID",
    });
  }

  const sql = `
    SELECT
      user_id,
      username,
      role,
      is_active,
      created_at
    FROM users
    WHERE user_id = ?
  `;

  connection.query(sql, [Number(id)], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get user",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User retrieved successfully",
      user: results[0],
    });
  });
};

// Update user
const updateUser = async (req, res) => {
  const { id } = req.params;
  let { username, password, role, is_active } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid user ID",
    });
  }

  if (typeof username !== "string" || username.trim() === "") {
    return res.status(400).json({
      message: "Username is required",
    });
  }

  username = username.trim();

  if (username.length > 50) {
    return res.status(400).json({
      message: "Username must not exceed 50 characters",
    });
  }

  if (role !== undefined && !isValidRole(role)) {
    return res.status(400).json({
      message: "Role must be admin or officer",
    });
  }

  let activeValue;

  if (is_active !== undefined) {
    activeValue = normalizeActiveStatus(is_active);

    if (activeValue === null) {
      return res.status(400).json({
        message: "is_active must be 0, 1, true or false",
      });
    }
  }

  const updatePassword = password !== undefined && password !== "";

  if (updatePassword) {
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        message: "Password must not exceed 72 bytes",
      });
    }
  } else if (password !== undefined && typeof password !== "string") {
    return res.status(400).json({
      message: "Password must be a string",
    });
  }

  try {
    let sql;
    let values;

    if (updatePassword) {
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
        username,
        hashedPassword,
        role ?? null,
        activeValue ?? null,
        Number(id),
      ];
    } else {
      sql = `
        UPDATE users
        SET username = ?,
            role = COALESCE(?, role),
            is_active = COALESCE(?, is_active)
        WHERE user_id = ?
      `;

      values = [username, role ?? null, activeValue ?? null, Number(id)];
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
        });
      }

      // Check existence separately because MySQL may report
      // zero affected rows when the submitted values are unchanged.
      if (result.affectedRows === 0) {
        connection.query(
          "SELECT user_id FROM users WHERE user_id = ?",
          [Number(id)],
          (checkErr, rows) => {
            if (checkErr) {
              return res.status(500).json({
                message: "Failed to verify user",
              });
            }

            if (rows.length === 0) {
              return res.status(404).json({
                message: "User not found",
              });
            }

            return res.status(200).json({
              message: "User is already up to date",
              user_id: Number(id),
            });
          },
        );

        return;
      }

      return res.status(200).json({
        message: "User updated successfully",
        user_id: Number(id),
      });
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to hash password",
    });
  }
};

// Deactivate user instead of permanently deleting the row
const deleteUser = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid user ID",
    });
  }

  const sql = `
    UPDATE users
    SET is_active = 0
    WHERE user_id = ?
  `;

  connection.query(sql, [Number(id)], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to deactivate user",
      });
    }

    if (result.affectedRows === 0) {
      connection.query(
        "SELECT user_id FROM users WHERE user_id = ?",
        [Number(id)],
        (checkErr, rows) => {
          if (checkErr) {
            return res.status(500).json({
              message: "Failed to verify user",
            });
          }

          if (rows.length === 0) {
            return res.status(404).json({
              message: "User not found",
            });
          }

          return res.status(200).json({
            message: "User is already deactivated",
            user_id: Number(id),
          });
        },
      );

      return;
    }

    return res.status(200).json({
      message: "User deactivated successfully",
      user_id: Number(id),
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
