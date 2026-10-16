const connection = require("../config/db");

// ==========================================
// REUSABLE VALIDATION HELPERS
// ==========================================

// Validate a positive integer ID
const isValidId = (id) => {
  if (
    id === undefined ||
    id === null ||
    (typeof id === "string" && id.trim() === "")
  ) {
    return false;
  }

  const value = Number(id);

  return Number.isSafeInteger(value) && value > 0;
};

// Validate the JSON request body
const isValidBody = (body) => {
  return body !== null && typeof body === "object" && !Array.isArray(body);
};

// Validate record type
const allowedTypes = ["Birth", "Death", "Marriage", "Divorce", "Adoption"];

// Validate record status
const allowedStatuses = ["Pending", "Active", "Cancelled"];

// Validate date in YYYY-MM-DD format and reject impossible dates
const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (year < 1000 || year > 9999) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

// Validate optional ID fields.
// Null and empty values are treated as NULL.
const validateOptionalId = (value, field, errors) => {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (!isValidId(value)) {
    errors.push(`${field} must be a positive integer`);
  }
};

// Normalize optional ID fields
const normalizeOptionalId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return Number(value);
};

// Validate the vital record payload
const validateVitalRecord = (body, isUpdate = false) => {
  const errors = [];

  const {
    person_id,
    location_id,
    record_type,
    registration_date,
    cancel_reason,
    registered_by,
    status,
  } = body;

  // Required fields
  if (typeof record_type !== "string" || record_type.trim() === "") {
    errors.push("record_type is required");
  } else if (!allowedTypes.includes(record_type)) {
    errors.push(
      "record_type must be Birth, Death, Marriage, Divorce, or Adoption",
    );
  }

  if (!isValidDate(registration_date)) {
    errors.push("registration_date must be a valid date in YYYY-MM-DD format");
  }

  if (!isValidId(registered_by)) {
    errors.push("registered_by must be a positive integer");
  }

  // Status defaults to Pending on create only
  const effectiveStatus =
    status === undefined && !isUpdate ? "Pending" : status;

  if (
    typeof effectiveStatus !== "string" ||
    !allowedStatuses.includes(effectiveStatus)
  ) {
    errors.push("status must be Pending, Active, or Cancelled");
  }

  // Validate optional IDs
  validateOptionalId(person_id, "person_id", errors);
  validateOptionalId(location_id, "location_id", errors);

  // Marriage and Divorce may have NULL person_id.
  // Other record types require a valid person_id.
  if (
    allowedTypes.includes(record_type) &&
    !["Marriage", "Divorce"].includes(record_type) &&
    !isValidId(person_id)
  ) {
    errors.push(
      "person_id is required and must be a positive integer for this record type",
    );
  }

  // Validate cancellation reason
  if (
    cancel_reason !== undefined &&
    cancel_reason !== null &&
    cancel_reason !== ""
  ) {
    if (typeof cancel_reason !== "string" || cancel_reason.trim() === "") {
      errors.push("cancel_reason must be a non-empty string or null");
    } else if (cancel_reason.trim().length > 1000) {
      errors.push("cancel_reason must not exceed 1000 characters");
    }
  }

  // Cancelled records should include a reason.
  if (
    effectiveStatus === "Cancelled" &&
    (typeof cancel_reason !== "string" || cancel_reason.trim() === "")
  ) {
    errors.push("cancel_reason is required when status is Cancelled");
  }

  return {
    errors,
    effectiveStatus,
  };
};

// Safely handle database errors
const handleDatabaseError = (err, res, operation) => {
  console.error(`${operation} error:`, err.code || err.message);

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      message:
        "One or more referenced IDs do not exist. Check person_id, location_id, and registered_by",
    });
  }

  if (
    err.code === "ER_ROW_IS_REFERENCED_2" ||
    err.code === "ER_ROW_IS_REFERENCED"
  ) {
    return res.status(409).json({
      message: "Cannot complete this operation because related records exist",
    });
  }

  return res.status(500).json({
    message: `Failed to ${operation}`,
  });
};

// ==========================================
// CREATE VITAL RECORD
// ==========================================

const createVitalRecord = (req, res) => {
  if (!isValidBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const {
    person_id,
    location_id,
    record_type,
    registration_date,
    cancel_reason,
    registered_by,
  } = req.body;

  const { errors, effectiveStatus } = validateVitalRecord(req.body, false);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const sql = `
    INSERT INTO vital_records (
      person_id,
      location_id,
      record_type,
      registration_date,
      cancel_reason,
      registered_by,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    normalizeOptionalId(person_id),
    normalizeOptionalId(location_id),
    record_type,
    registration_date,
    cancel_reason?.trim() || null,
    Number(registered_by),
    effectiveStatus,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "create vital record");
    }

    return res.status(201).json({
      message: "Vital record created successfully",
      record_id: result.insertId,
    });
  });
};

// ==========================================
// GET ALL VITAL RECORDS
// ==========================================

const getVitalRecords = (req, res) => {
  const sql = `
    SELECT
      record_id,
      person_id,
      location_id,
      record_type,
      registration_date,
      cancel_reason,
      registered_by,
      status,
      created_at,
      updated_at
    FROM vital_records
    ORDER BY record_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve vital records");
    }

    return res.status(200).json({
      message: "Vital records retrieved successfully",
      count: results.length,
      records: results,
    });
  });
};

// ==========================================
// GET VITAL RECORD BY ID
// ==========================================

const getVitalRecordById = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Vital record ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      record_id,
      person_id,
      location_id,
      record_type,
      registration_date,
      cancel_reason,
      registered_by,
      status,
      created_at,
      updated_at
    FROM vital_records
    WHERE record_id = ?
  `;

  connection.query(sql, [Number(id)], (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve vital record");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Vital record not found",
      });
    }

    return res.status(200).json({
      message: "Vital record retrieved successfully",
      record: results[0],
    });
  });
};

// ==========================================
// UPDATE VITAL RECORD
// ==========================================

const updateVitalRecord = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Vital record ID must be a positive integer",
    });
  }

  if (!isValidBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const {
    person_id,
    location_id,
    record_type,
    registration_date,
    cancel_reason,
    registered_by,
  } = req.body;

  const { errors, effectiveStatus } = validateVitalRecord(req.body, true);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const sql = `
    UPDATE vital_records
    SET
      person_id = ?,
      location_id = ?,
      record_type = ?,
      registration_date = ?,
      cancel_reason = ?,
      registered_by = ?,
      status = ?
    WHERE record_id = ?
  `;

  const values = [
    normalizeOptionalId(person_id),
    normalizeOptionalId(location_id),
    record_type,
    registration_date,
    cancel_reason?.trim() || null,
    Number(registered_by),
    effectiveStatus,
    Number(id),
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "update vital record");
    }

    if (result.affectedRows === 0) {
      // Check whether the record exists even if values were unchanged.
      connection.query(
        "SELECT record_id FROM vital_records WHERE record_id = ?",
        [Number(id)],
        (checkErr, rows) => {
          if (checkErr) {
            return handleDatabaseError(checkErr, res, "verify vital record");
          }

          if (rows.length === 0) {
            return res.status(404).json({
              message: "Vital record not found",
            });
          }

          return res.status(200).json({
            message: "Vital record updated successfully",
            note: "No values changed",
          });
        },
      );

      return;
    }

    return res.status(200).json({
      message: "Vital record updated successfully",
    });
  });
};

// ==========================================
// DELETE VITAL RECORD
// ==========================================

const deleteVitalRecord = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Vital record ID must be a positive integer",
    });
  }

  const sql = `
    DELETE FROM vital_records
    WHERE record_id = ?
  `;

  connection.query(sql, [Number(id)], (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "delete vital record");
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Vital record not found",
      });
    }

    return res.status(200).json({
      message: "Vital record deleted successfully",
    });
  });
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  createVitalRecord,
  getVitalRecords,
  getVitalRecordById,
  updateVitalRecord,
  deleteVitalRecord,
};
