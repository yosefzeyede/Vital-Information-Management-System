const connection = require("../config/db");

// ==========================================
// REUSABLE VALIDATION HELPERS
// ==========================================

// Validate positive integer IDs
const isValidId = (id) => {
  const value = Number(id);
  return (
    id !== undefined &&
    id !== null &&
    String(id).trim() !== "" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
};

// Validate names: English or Unicode letters, spaces,
// apostrophes, periods, and hyphens are allowed.
const isValidName = (value) => {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= 100 &&
    /^\p{L}[\p{L}\p{M} .'-]*$/u.test(value.trim())
  );
};

// Validate Ethiopian mobile numbers: 09XXXXXXXX or 07XXXXXXXX
const isValidPhone = (phone) => {
  if (phone === null || phone === undefined || phone === "") {
    return true; // Optional field
  }

  return typeof phone === "string" && /^(09|07)\d{8}$/.test(phone);
};

// Validate optional date in strict YYYY-MM-DD format.
// Future dates are not allowed.
const isValidBirthDate = (date) => {
  if (date === null || date === undefined || date === "") {
    return true; // Optional field
  }

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }

  // Compare date-only values to avoid timezone problems.
  const today = new Date().toISOString().slice(0, 10);
  return date <= today;
};

// Validate optional location ID
const isValidLocationId = (id) => {
  if (id === null || id === undefined || id === "") {
    return true;
  }

  return isValidId(id);
};

// Validate request body fields
const validatePerson = (body) => {
  const errors = [];

  const {
    first_name,
    middle_name,
    last_name,
    gender,
    date_of_birth,
    phone,
    address,
    location_id,
  } = body;

  // Required fields
  const requiredFields = {
    first_name,
    middle_name,
    last_name,
    gender,
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${field} is required`);
    }
  }

  // Validate names only when values are supplied as strings
  for (const [field, value] of Object.entries({
    first_name,
    middle_name,
    last_name,
  })) {
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      !isValidName(value)
    ) {
      errors.push(
        `${field} must contain valid letters and may include spaces, hyphens, apostrophes, or periods; maximum 100 characters`,
      );
    }
  }

  // Gender
  if (
    typeof gender === "string" &&
    gender.trim() !== "" &&
    !["Male", "Female"].includes(gender)
  ) {
    errors.push("gender must be Male or Female");
  }

  // Date of birth
  if (!isValidBirthDate(date_of_birth)) {
    errors.push(
      "date_of_birth must be a valid YYYY-MM-DD date and cannot be in the future",
    );
  }

  // Phone
  if (!isValidPhone(phone)) {
    errors.push(
      "phone must be a valid 10-digit Ethiopian mobile number starting with 09 or 07",
    );
  }

  // Address
  if (address !== null && address !== undefined) {
    if (typeof address !== "string" || address.trim().length > 255) {
      errors.push("address must be text with a maximum of 255 characters");
    }
  }

  // Location ID
  if (!isValidLocationId(location_id)) {
    errors.push("location_id must be a positive integer or null");
  }

  return errors;
};

// Safely handle common database errors
const handleDatabaseError = (err, res, operation) => {
  console.error(`${operation} error:`, err.code || err.message);

  if (
    err.code === "ER_NO_REFERENCED_ROW_2" ||
    err.code === "ER_NO_REFERENCED_ROW"
  ) {
    return res.status(400).json({
      message: "The specified location does not exist",
    });
  }

  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      message: "Cannot complete this operation because related records exist",
    });
  }

  return res.status(500).json({
    message: `Failed to ${operation}`,
  });
};

// ==========================================
// CREATE PERSON
// ==========================================

const createPerson = (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = validatePerson(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const {
    first_name,
    middle_name,
    last_name,
    gender,
    date_of_birth,
    phone,
    address,
    location_id,
  } = req.body;

  const sql = `
    INSERT INTO persons (
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      phone,
      address,
      location_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    first_name.trim(),
    middle_name.trim(),
    last_name.trim(),
    gender,
    date_of_birth || null,
    phone || null,
    address?.trim() || null,
    location_id === "" || location_id === undefined ? null : location_id,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "register person");
    }

    return res.status(201).json({
      message: "Person registered successfully",
      person_id: result.insertId,
    });
  });
};

// ==========================================
// GET ALL PERSONS
// ==========================================

const getPersons = (req, res) => {
  const sql = `
    SELECT
      person_id,
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      phone,
      address,
      location_id,
      created_at,
      updated_at
    FROM persons
    ORDER BY person_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve persons");
    }

    return res.status(200).json({
      message: "Persons retrieved successfully",
      count: results.length,
      persons: results,
    });
  });
};

// ==========================================
// GET PERSON BY ID
// ==========================================

const getPersonById = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Person ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      person_id,
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      phone,
      address,
      location_id,
      created_at,
      updated_at
    FROM persons
    WHERE person_id = ?
  `;

  connection.query(sql, [Number(id)], (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve person");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Person not found",
      });
    }

    return res.status(200).json({
      message: "Person retrieved successfully",
      person: results[0],
    });
  });
};

// ==========================================
// UPDATE PERSON
// ==========================================

const updatePerson = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Person ID must be a positive integer",
    });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = validatePerson(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const {
    first_name,
    middle_name,
    last_name,
    gender,
    date_of_birth,
    phone,
    address,
    location_id,
  } = req.body;

  const sql = `
    UPDATE persons
    SET
      first_name = ?,
      middle_name = ?,
      last_name = ?,
      gender = ?,
      date_of_birth = ?,
      phone = ?,
      address = ?,
      location_id = ?
    WHERE person_id = ?
  `;

  const values = [
    first_name.trim(),
    middle_name.trim(),
    last_name.trim(),
    gender,
    date_of_birth || null,
    phone || null,
    address?.trim() || null,
    location_id === "" || location_id === undefined ? null : location_id,
    Number(id),
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "update person");
    }

    // affectedRows may be 0 when the record exists but values are unchanged.
    if (result.affectedRows === 0) {
      connection.query(
        "SELECT person_id FROM persons WHERE person_id = ?",
        [Number(id)],
        (checkErr, rows) => {
          if (checkErr) {
            return handleDatabaseError(checkErr, res, "verify person");
          }

          if (rows.length === 0) {
            return res.status(404).json({
              message: "Person not found",
            });
          }

          return res.status(200).json({
            message: "Person updated successfully",
            note: "No values changed",
          });
        },
      );

      return;
    }

    return res.status(200).json({
      message: "Person updated successfully",
    });
  });
};

// ==========================================
// DELETE PERSON
// ==========================================

const deletePerson = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Person ID must be a positive integer",
    });
  }

  const sql = `
    DELETE FROM persons
    WHERE person_id = ?
  `;

  connection.query(sql, [Number(id)], (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "delete person");
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Person not found",
      });
    }

    return res.status(200).json({
      message: "Person deleted successfully",
    });
  });
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  createPerson,
  getPersons,
  getPersonById,
  updatePerson,
  deletePerson,
};
