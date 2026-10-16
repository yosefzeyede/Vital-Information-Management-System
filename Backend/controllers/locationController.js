const connection = require("../config/db");

// ==========================================
// REUSABLE VALIDATION HELPERS
// ==========================================

// Validate positive integer IDs
const isValidId = (id) => {
  if (id === undefined || id === null || String(id).trim() === "") {
    return false;
  }

  const value = Number(id);

  return Number.isSafeInteger(value) && value > 0;
};

// Validate required location text fields
const isValidRequiredText = (value, maxLength = 100) => {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
};

// Validate optional location text fields
const isValidOptionalText = (value, maxLength = 100) => {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  return typeof value === "string" && value.trim().length <= maxLength;
};

// Validate request body
const validateLocation = (body) => {
  const errors = [];

  const { region, zone, city, woreda, kebele, got } = body;

  // Required fields
  const requiredFields = {
    region,
    zone,
    woreda,
    kebele,
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${field} is required and must be a non-empty string`);
    } else if (value.trim().length > 100) {
      errors.push(`${field} must not exceed 100 characters`);
    }
  }

  // Optional fields
  if (!isValidOptionalText(city, 100)) {
    errors.push("city must be text with a maximum of 100 characters");
  }

  if (!isValidOptionalText(got, 100)) {
    errors.push("got must be text with a maximum of 100 characters");
  }

  return errors;
};

// Normalize optional fields
const normalizeOptionalText = (value) => {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  return value.trim();
};

// Handle database errors without exposing internal details
const handleDatabaseError = (err, res, operation) => {
  console.error(`${operation} error:`, err.code || err.message);

  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      message: "Cannot delete this location because related records exist",
    });
  }

  return res.status(500).json({
    message: `Failed to ${operation}`,
  });
};

// Validate JSON request body
const isValidBody = (body) => {
  return body !== null && typeof body === "object" && !Array.isArray(body);
};

// ==========================================
// CREATE LOCATION
// ==========================================

const createLocation = (req, res) => {
  if (!isValidBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = validateLocation(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const { region, zone, city, woreda, kebele, got } = req.body;

  const sql = `
    INSERT INTO locations (
      region,
      zone,
      city,
      woreda,
      kebele,
      got
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    region.trim(),
    zone.trim(),
    normalizeOptionalText(city),
    woreda.trim(),
    kebele.trim(),
    normalizeOptionalText(got),
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "create location");
    }

    return res.status(201).json({
      message: "Location created successfully",
      location_id: result.insertId,
    });
  });
};

// ==========================================
// GET ALL LOCATIONS
// ==========================================

const getLocations = (req, res) => {
  const sql = `
    SELECT
      location_id,
      region,
      zone,
      city,
      woreda,
      kebele,
      got
    FROM locations
    ORDER BY location_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve locations");
    }

    return res.status(200).json({
      message: "Locations retrieved successfully",
      count: results.length,
      locations: results,
    });
  });
};

// ==========================================
// GET LOCATION BY ID
// ==========================================

const getLocationById = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Location ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      location_id,
      region,
      zone,
      city,
      woreda,
      kebele,
      got
    FROM locations
    WHERE location_id = ?
  `;

  connection.query(sql, [Number(id)], (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "retrieve location");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json({
      message: "Location retrieved successfully",
      location: results[0],
    });
  });
};

// ==========================================
// UPDATE LOCATION
// ==========================================

const updateLocation = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Location ID must be a positive integer",
    });
  }

  if (!isValidBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = validateLocation(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const { region, zone, city, woreda, kebele, got } = req.body;

  const sql = `
    UPDATE locations
    SET
      region = ?,
      zone = ?,
      city = ?,
      woreda = ?,
      kebele = ?,
      got = ?
    WHERE location_id = ?
  `;

  const values = [
    region.trim(),
    zone.trim(),
    normalizeOptionalText(city),
    woreda.trim(),
    kebele.trim(),
    normalizeOptionalText(got),
    Number(id),
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "update location");
    }

    if (result.affectedRows === 0) {
      // A valid row may exist even when the values are unchanged.
      connection.query(
        "SELECT location_id FROM locations WHERE location_id = ?",
        [Number(id)],
        (checkErr, rows) => {
          if (checkErr) {
            return handleDatabaseError(checkErr, res, "verify location");
          }

          if (rows.length === 0) {
            return res.status(404).json({
              message: "Location not found",
            });
          }

          return res.status(200).json({
            message: "Location updated successfully",
            note: "No values changed",
          });
        },
      );

      return;
    }

    return res.status(200).json({
      message: "Location updated successfully",
    });
  });
};

// ==========================================
// DELETE LOCATION
// ==========================================

const deleteLocation = (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Location ID must be a positive integer",
    });
  }

  const sql = `
    DELETE FROM locations
    WHERE location_id = ?
  `;

  connection.query(sql, [Number(id)], (err, result) => {
    if (err) {
      return handleDatabaseError(err, res, "delete location");
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json({
      message: "Location deleted successfully",
    });
  });
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
