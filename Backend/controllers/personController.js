const connection = require("../config/db");

// ==========================================
// VALIDATION HELPERS
// ==========================================

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

const isValidName = (value) =>
  typeof value === "string" &&
  value.trim().length >= 1 &&
  value.trim().length <= 100 &&
  /^\p{L}[\p{L}\p{M} .'-]*$/u.test(value.trim());

const isValidPhone = (phone) => {
  if (phone === null || phone === undefined || phone === "") {
    return true;
  }

  return typeof phone === "string" && /^(09|07)\d{8}$/.test(phone);
};

const isValidBirthDate = (date) => {
  if (date === null || date === undefined || date === "") {
    return true;
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

  return date <= new Date().toISOString().slice(0, 10);
};

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
  } = body;

  for (const [field, value] of Object.entries({
    first_name,
    middle_name,
    last_name,
  })) {
    if (!isValidName(value)) {
      errors.push(`${field} is required and must be a valid name`);
    }
  }

  if (!["Male", "Female"].includes(gender)) {
    errors.push("gender must be Male or Female");
  }

  if (!isValidBirthDate(date_of_birth)) {
    errors.push(
      "date_of_birth must be a valid YYYY-MM-DD date and cannot be in the future",
    );
  }

  if (!isValidPhone(phone)) {
    errors.push(
      "phone must be a valid 10-digit Ethiopian number starting with 09 or 07",
    );
  }

  if (
    address !== null &&
    address !== undefined &&
    (typeof address !== "string" || address.trim().length > 255)
  ) {
    errors.push("address must be text with a maximum of 255 characters");
  }

  return errors;
};

const validateLocation = (body) => {
  const errors = [];

  const requiredFields = ["region", "zone", "woreda", "kebele"];

  for (const field of requiredFields) {
    const value = body[field];

    if (
      typeof value !== "string" ||
      value.trim() === "" ||
      value.trim().length > 100
    ) {
      errors.push(`${field} is required and must not exceed 100 characters`);
    }
  }

  for (const field of ["city", "got"]) {
    const value = body[field];

    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || value.trim().length > 100)
    ) {
      errors.push(`${field} must be text with a maximum of 100 characters`);
    }
  }

  return errors;
};

const hasLocationFields = (body) =>
  ["region", "zone", "city", "woreda", "kebele", "got"].some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );

const isValidRequestBody = (body) =>
  body && typeof body === "object" && !Array.isArray(body);

const handleDatabaseError = (err, res, operation) => {
  console.error(`${operation} error:`, err.code || err.message);

  if (
    err.code === "ER_NO_REFERENCED_ROW_2" ||
    err.code === "ER_NO_REFERENCED_ROW"
  ) {
    return res.status(400).json({
      message: "A referenced record does not exist",
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
// CREATE PERSON AND LOCATION
// ==========================================

const createPerson = async (req, res) => {
  if (!isValidRequestBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = [...validatePerson(req.body), ...validateLocation(req.body)];

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
    region,
    zone,
    city,
    woreda,
    kebele,
    got,
  } = req.body;

  let db;

  try {
    // Get a dedicated connection for the transaction.
    db = await connection.promise().getConnection();

    await db.beginTransaction();

    // 1. Insert the person's location.
    const [locationResult] = await db.execute(
      `INSERT INTO locations
       (region, zone, city, woreda, kebele, got)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        region.trim(),
        zone.trim(),
        city?.trim() || null,
        woreda.trim(),
        kebele.trim(),
        got?.trim() || null,
      ],
    );

    const locationId = locationResult.insertId;

    // 2. Insert the person using the new location_id.
    const [personResult] = await db.execute(
      `INSERT INTO persons
       (first_name, middle_name, last_name, gender,
        date_of_birth, phone, address, location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        first_name.trim(),
        middle_name.trim(),
        last_name.trim(),
        gender,
        date_of_birth || null,
        phone || null,
        address?.trim() || null,
        locationId,
      ],
    );

    // Both inserts succeeded.
    await db.commit();

    return res.status(201).json({
      message: "Person and location registered successfully",
      person_id: personResult.insertId,
      location_id: locationId,
    });
  } catch (err) {
    if (db) {
      try {
        await db.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError.message);
      }
    }

    return handleDatabaseError(err, res, "register person and location");
  } finally {
    if (db) db.release();
  }
};

// ==========================================
// GET ALL PERSONS WITH THEIR LOCATIONS
// ==========================================

const getPersons = (req, res) => {
  const sql = `
    SELECT
      p.person_id,
      p.first_name,
      p.middle_name,
      p.last_name,
      p.gender,
      p.date_of_birth,
      p.phone,
      p.address,
      p.location_id,
      p.created_at,
      p.updated_at,
      l.region,
      l.zone,
      l.city,
      l.woreda,
      l.kebele,
      l.got
    FROM persons p
    LEFT JOIN locations l ON p.location_id = l.location_id
    ORDER BY p.person_id DESC
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
      p.person_id,
      p.first_name,
      p.middle_name,
      p.last_name,
      p.gender,
      p.date_of_birth,
      p.phone,
      p.address,
      p.location_id,
      p.created_at,
      p.updated_at,
      l.region,
      l.zone,
      l.city,
      l.woreda,
      l.kebele,
      l.got
    FROM persons p
    LEFT JOIN locations l ON p.location_id = l.location_id
    WHERE p.person_id = ?
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
// UPDATE PERSON AND LOCATION
// ==========================================

const updatePerson = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      message: "Person ID must be a positive integer",
    });
  }

  if (!isValidRequestBody(req.body)) {
    return res.status(400).json({
      message: "A valid JSON request body is required",
    });
  }

  const errors = validatePerson(req.body);

  if (hasLocationFields(req.body)) {
    errors.push(...validateLocation(req.body));
  } else if (!isValidId(req.body.location_id)) {
    errors.push("A valid location_id or location fields are required");
  }

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
    region,
    zone,
    city,
    woreda,
    kebele,
    got,
    location_id,
  } = req.body;

  let db;

  try {
    db = await connection.promise().getConnection();
    await db.beginTransaction();

    // Confirm the person exists.
    const [existingPersons] = await db.execute(
      "SELECT person_id FROM persons WHERE person_id = ?",
      [Number(id)],
    );

    if (existingPersons.length === 0) {
      await db.rollback();

      return res.status(404).json({
        message: "Person not found",
      });
    }

    let finalLocationId = location_id;

    if (hasLocationFields(req.body)) {
      // Create a new location rather than changing a location
      // that might also be used by other persons.
      const [locationResult] = await db.execute(
        `INSERT INTO locations
         (region, zone, city, woreda, kebele, got)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          region.trim(),
          zone.trim(),
          city?.trim() || null,
          woreda.trim(),
          kebele.trim(),
          got?.trim() || null,
        ],
      );

      finalLocationId = locationResult.insertId;
    } else {
      // Confirm the selected existing location exists.
      const [locations] = await db.execute(
        "SELECT location_id FROM locations WHERE location_id = ?",
        [Number(location_id)],
      );

      if (locations.length === 0) {
        await db.rollback();

        return res.status(400).json({
          message: "The specified location does not exist",
        });
      }

      finalLocationId = Number(location_id);
    }

    const [result] = await db.execute(
      `UPDATE persons
       SET first_name = ?,
           middle_name = ?,
           last_name = ?,
           gender = ?,
           date_of_birth = ?,
           phone = ?,
           address = ?,
           location_id = ?
       WHERE person_id = ?`,
      [
        first_name.trim(),
        middle_name.trim(),
        last_name.trim(),
        gender,
        date_of_birth || null,
        phone || null,
        address?.trim() || null,
        finalLocationId,
        Number(id),
      ],
    );

    await db.commit();

    return res.status(200).json({
      message: "Person updated successfully",
      location_id: finalLocationId,
      changed: result.affectedRows > 0,
    });
  } catch (err) {
    if (db) {
      try {
        await db.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError.message);
      }
    }

    return handleDatabaseError(err, res, "update person");
  } finally {
    if (db) db.release();
  }
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

  connection.query(
    "DELETE FROM persons WHERE person_id = ?",
    [Number(id)],
    (err, result) => {
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
    },
  );
};

// ==========================================
// SEARCH PERSON BY NAME OR ID
// ==========================================

const searchPersons = (req, res) => {
  const query = String(req.query.query || "").trim();

  if (!query) {
    return res.status(400).json({
      message: "Please enter a first name or person ID",
    });
  }

  const isNumericId = /^\d+$/.test(query);

  const sql = `
    SELECT
      p.person_id,
      p.first_name,
      p.middle_name,
      p.last_name,
      p.gender,
      p.date_of_birth,
      p.phone,
      p.address,
      p.location_id,
      p.created_at,
      p.updated_at,
      l.region,
      l.zone,
      l.city,
      l.woreda,
      l.kebele,
      l.got
    FROM persons p
    LEFT JOIN locations l ON p.location_id = l.location_id
    WHERE
      ${isNumericId ? "p.person_id = ? OR" : ""}
      LOWER(p.first_name) LIKE LOWER(?)
    ORDER BY p.person_id DESC
    LIMIT 50
  `;

  const searchValue = `%${query}%`;

  const params = isNumericId ? [Number(query), searchValue] : [searchValue];

  connection.query(sql, params, (err, results) => {
    if (err) {
      return handleDatabaseError(err, res, "search persons");
    }

    return res.status(200).json({
      message: "Person search completed successfully",
      count: results.length,
      persons: results,
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
  searchPersons,
};
