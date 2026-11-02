const connection = require("../config/db");

// Get Promise-based pool
const pool = connection.promise();

// =========================
// Helper Functions
// =========================

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isValidDate = (value) => {
  if (!value || typeof value !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const getToday = () => new Date().toISOString().slice(0, 10);

const isValidOptionalId = (value) =>
  value === null ||
  value === undefined ||
  value === "" ||
  isPositiveInteger(value);

const validateCause = (cause) =>
  cause === null ||
  cause === undefined ||
  cause === "" ||
  (typeof cause === "string" && cause.trim().length <= 255);

// Check that referenced records exist.
// These queries use the same transaction connection.
const validateReferences = async (conn, personId, locationId, registeredBy) => {
  const [persons] = await conn.query(
    "SELECT person_id FROM persons WHERE person_id = ?",
    [personId],
  );

  if (persons.length === 0) {
    throw new Error("The selected person does not exist.");
  }

  if (locationId !== null) {
    const [locations] = await conn.query(
      "SELECT location_id FROM locations WHERE location_id = ?",
      [locationId],
    );

    if (locations.length === 0) {
      throw new Error("The selected location does not exist.");
    }
  }

  const [users] = await conn.query(
    "SELECT user_id FROM users WHERE user_id = ?",
    [registeredBy],
  );

  if (users.length === 0) {
    throw new Error("The selected registered user does not exist.");
  }
};

// =========================
// CREATE DEATH RECORD
// =========================

const createDeath = async (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    death_date,
    cause_of_death,
  } = req.body;

  // Validate required fields
  if (!person_id || !registration_date || !registered_by || !death_date) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, and death date are required.",
    });
  }

  // Validate IDs
  if (
    !isPositiveInteger(person_id) ||
    !isPositiveInteger(registered_by) ||
    !isValidOptionalId(location_id)
  ) {
    return res.status(400).json({
      message: "Invalid person, location, or registered user ID.",
    });
  }

  // Validate dates
  if (!isValidDate(death_date) || !isValidDate(registration_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format.",
    });
  }

  if (death_date > getToday()) {
    return res.status(400).json({
      message: "Death date cannot be in the future.",
    });
  }

  if (registration_date < death_date) {
    return res.status(400).json({
      message: "Registration date cannot be before death date.",
    });
  }

  if (!validateCause(cause_of_death)) {
    return res.status(400).json({
      message: "Cause of death must not exceed 255 characters.",
    });
  }

  let conn;

  try {
    // Get a dedicated connection from the pool
    conn = await pool.getConnection();

    // Start transaction
    await conn.beginTransaction();

    const personId = Number(person_id);
    const registeredBy = Number(registered_by);
    const locationId =
      location_id === "" || location_id === undefined || location_id === null
        ? null
        : Number(location_id);

    // Validate foreign key references using this connection
    await validateReferences(conn, personId, locationId, registeredBy);

    // Insert into vital_records
    const [recordResult] = await conn.query(
      `INSERT INTO vital_records
        (record_type, person_id, location_id, registration_date, registered_by, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        "Death",
        personId,
        locationId,
        registration_date,
        registeredBy,
        "Pending",
      ],
    );

    const recordId = recordResult.insertId;

    // Insert into deaths
    const [deathResult] = await conn.query(
      `INSERT INTO deaths
        (record_id, death_date, cause_of_death)
       VALUES (?, ?, ?)`,
      [recordId, death_date, cause_of_death ? cause_of_death.trim() : null],
    );

    // Commit transaction
    await conn.commit();

    return res.status(201).json({
      message: "Death record created successfully.",
      record_id: recordId,
      death_id: deathResult.insertId,
      status: "Pending",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Create Death Error:", error);

    if (
      error.message === "The selected person does not exist." ||
      error.message === "The selected location does not exist." ||
      error.message === "The selected registered user does not exist."
    ) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to create death record.",
      error: error.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// =========================
// GET ALL DEATH RECORDS
// =========================

const getDeaths = async (req, res) => {
  try {
    const [results] = await pool.query(
      `SELECT
          d.death_id,
          vr.record_id,
          vr.person_id,
          p.first_name,
          p.middle_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          d.death_date,
          d.cause_of_death,
          vr.location_id,
          vr.registration_date,
          vr.registered_by,
          vr.status,
          vr.cancel_reason,
          vr.created_at,
          vr.updated_at,
          l.region,
          l.zone,
          l.city,
          l.woreda,
          l.kebele,
          l.got
       FROM deaths d
       INNER JOIN vital_records vr ON d.record_id = vr.record_id
       INNER JOIN persons p ON vr.person_id = p.person_id
       LEFT JOIN locations l ON vr.location_id = l.location_id
       ORDER BY d.death_id DESC`,
    );

    return res.status(200).json({
      count: results.length,
      deaths: results,
    });
  } catch (error) {
    console.error("Get Deaths Error:", error);

    return res.status(500).json({
      message: "Failed to retrieve death records.",
      error: error.message,
    });
  }
};

// =========================
// GET DEATH RECORD BY ID
// =========================

const getDeathById = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid death ID.",
    });
  }

  try {
    const [results] = await pool.query(
      `SELECT
          d.death_id,
          vr.record_id,
          vr.person_id,
          p.first_name,
          p.middle_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          d.death_date,
          d.cause_of_death,
          vr.location_id,
          vr.registration_date,
          vr.registered_by,
          vr.status,
          vr.cancel_reason,
          vr.created_at,
          vr.updated_at,
          l.region,
          l.zone,
          l.city,
          l.woreda,
          l.kebele,
          l.got
       FROM deaths d
       INNER JOIN vital_records vr ON d.record_id = vr.record_id
       INNER JOIN persons p ON vr.person_id = p.person_id
       LEFT JOIN locations l ON vr.location_id = l.location_id
       WHERE d.death_id = ?`,
      [id],
    );

    if (results.length === 0) {
      return res.status(404).json({
        message: "Death record not found.",
      });
    }

    return res.status(200).json(results[0]);
  } catch (error) {
    console.error("Get Death By ID Error:", error);

    return res.status(500).json({
      message: "Failed to retrieve death record.",
      error: error.message,
    });
  }
};

// =========================
// UPDATE DEATH RECORD
// =========================

const updateDeath = async (req, res) => {
  const { id } = req.params;

  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    death_date,
    cause_of_death,
    status,
  } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid death ID.",
    });
  }

  if (
    !person_id ||
    !registration_date ||
    !registered_by ||
    !death_date ||
    !status
  ) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, death date, and status are required.",
    });
  }

  if (
    !isPositiveInteger(person_id) ||
    !isPositiveInteger(registered_by) ||
    !isValidOptionalId(location_id)
  ) {
    return res.status(400).json({
      message: "Invalid person, location, or registered user ID.",
    });
  }

  if (!isValidDate(death_date) || !isValidDate(registration_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format.",
    });
  }

  if (death_date > getToday()) {
    return res.status(400).json({
      message: "Death date cannot be in the future.",
    });
  }

  if (registration_date < death_date) {
    return res.status(400).json({
      message: "Registration date cannot be before death date.",
    });
  }

  if (!["Pending", "Active"].includes(status)) {
    return res.status(400).json({
      message: "Status must be Pending or Active.",
    });
  }

  if (!validateCause(cause_of_death)) {
    return res.status(400).json({
      message: "Cause of death must not exceed 255 characters.",
    });
  }

  let conn;

  try {
    conn = await pool.getConnection();

    await conn.beginTransaction();

    const deathId = Number(id);
    const personId = Number(person_id);
    const registeredBy = Number(registered_by);
    const locationId =
      location_id === "" || location_id === undefined || location_id === null
        ? null
        : Number(location_id);

    // Lock the selected record while updating it
    const [existingRecords] = await conn.query(
      `SELECT
          d.death_id,
          vr.record_id,
          vr.status
       FROM deaths d
       INNER JOIN vital_records vr ON d.record_id = vr.record_id
       WHERE d.death_id = ?
       FOR UPDATE`,
      [deathId],
    );

    if (existingRecords.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Death record not found.",
      });
    }

    if (existingRecords[0].status === "Cancelled") {
      await conn.rollback();

      return res.status(400).json({
        message: "Cancelled death records cannot be updated.",
      });
    }

    // Validate references using the transaction connection
    await validateReferences(conn, personId, locationId, registeredBy);

    const recordId = existingRecords[0].record_id;

    // Update vital_records and deaths together
    await conn.query(
      `UPDATE vital_records vr
       INNER JOIN deaths d ON vr.record_id = d.record_id
       SET
          vr.person_id = ?,
          vr.location_id = ?,
          vr.registration_date = ?,
          vr.registered_by = ?,
          vr.status = ?,
          d.death_date = ?,
          d.cause_of_death = ?
       WHERE d.death_id = ?`,
      [
        personId,
        locationId,
        registration_date,
        registeredBy,
        status,
        death_date,
        cause_of_death ? cause_of_death.trim() : null,
        deathId,
      ],
    );

    await conn.commit();

    return res.status(200).json({
      message: "Death record updated successfully.",
      death_id: deathId,
      record_id: recordId,
      status,
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Update Death Error:", error);

    if (
      error.message === "The selected person does not exist." ||
      error.message === "The selected location does not exist." ||
      error.message === "The selected registered user does not exist."
    ) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to update death record.",
      error: error.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// =========================
// CANCEL DEATH RECORD
// =========================

const cancelDeath = async (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid death ID.",
    });
  }

  if (
    !cancel_reason ||
    typeof cancel_reason !== "string" ||
    !cancel_reason.trim()
  ) {
    return res.status(400).json({
      message: "Cancellation reason is required.",
    });
  }

  if (cancel_reason.trim().length > 500) {
    return res.status(400).json({
      message: "Cancellation reason must not exceed 500 characters.",
    });
  }

  let conn;

  try {
    conn = await pool.getConnection();

    await conn.beginTransaction();

    const [records] = await conn.query(
      `SELECT
          d.death_id,
          vr.record_id,
          vr.status
       FROM deaths d
       INNER JOIN vital_records vr ON d.record_id = vr.record_id
       WHERE d.death_id = ?
       FOR UPDATE`,
      [id],
    );

    if (records.length === 0) {
      await conn.rollback();

      return res.status(404).json({
        message: "Death record not found.",
      });
    }

    if (records[0].status === "Cancelled") {
      await conn.rollback();

      return res.status(400).json({
        message: "Death record is already cancelled.",
      });
    }

    await conn.query(
      `UPDATE vital_records
       SET status = ?, cancel_reason = ?
       WHERE record_id = ?`,
      ["Cancelled", cancel_reason.trim(), records[0].record_id],
    );

    await conn.commit();

    return res.status(200).json({
      message: "Death record cancelled successfully.",
      death_id: Number(id),
      status: "Cancelled",
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Cancel Death Error:", error);

    return res.status(500).json({
      message: "Failed to cancel death record.",
      error: error.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// =========================
// EXPORT CONTROLLERS
// =========================

module.exports = {
  createDeath,
  getDeaths,
  getDeathById,
  updateDeath,
  cancelDeath,
};
