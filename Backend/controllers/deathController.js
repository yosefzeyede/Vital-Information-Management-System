const connection = require("../config/db");

// Create a death record
const createDeath = (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    death_date,
    cause_of_death,
  } = req.body;

  // Validate required fields
  if (
    person_id == null ||
    !registration_date ||
    registered_by == null ||
    !death_date
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, and death_date are required",
    });
  }

  // Validate date format
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(registration_date) || !datePattern.test(death_date)) {
    return res.status(400).json({
      message: "Dates must use YYYY-MM-DD format",
    });
  }

  // Death date cannot be in the future
  const today = new Date().toISOString().slice(0, 10);

  if (death_date > today) {
    return res.status(400).json({
      message: "death_date cannot be in the future",
    });
  }

  // Validate cause_of_death
  if (
    cause_of_death != null &&
    (typeof cause_of_death !== "string" || cause_of_death.trim().length > 255)
  ) {
    return res.status(400).json({
      message: "cause_of_death must not exceed 255 characters",
    });
  }

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      return res.status(500).json({
        message: "Failed to start transaction",
      });
    }

    const recordSql = `
      INSERT INTO vital_records
        (person_id, location_id, record_type,
         registration_date, registered_by, status)
      VALUES (?, ?, 'Death', ?, ?, 'Pending')
    `;

    const recordValues = [
      person_id,
      location_id ?? null,
      registration_date,
      registered_by,
    ];

    connection.query(recordSql, recordValues, (recordError, result) => {
      if (recordError) {
        return connection.rollback(() => {
          console.error("Create death record error:", recordError);

          res.status(400).json({
            message:
              "Failed to create vital record. Check person_id, location_id, and registered_by.",
          });
        });
      }

      const recordId = result.insertId;

      const deathSql = `
        INSERT INTO deaths
          (record_id, death_date, cause_of_death)
        VALUES (?, ?, ?)
      `;

      connection.query(
        deathSql,
        [recordId, death_date, cause_of_death?.trim() || null],
        (deathError, deathResult) => {
          if (deathError) {
            return connection.rollback(() => {
              console.error("Create death details error:", deathError);

              res.status(400).json({
                message: "Failed to save death details",
              });
            });
          }

          connection.commit((commitError) => {
            if (commitError) {
              return connection.rollback(() => {
                res.status(500).json({
                  message: "Failed to save death record",
                });
              });
            }

            return res.status(201).json({
              message: "Death record created successfully",
              record_id: recordId,
              death_id: deathResult.insertId,
            });
          });
        },
      );
    });
  });
};

const getDeaths = (req, res) => {
  const sql = `
    SELECT
      d.death_id,
      vr.record_id,
      vr.person_id,
      p.first_name,
      p.middle_name,
      p.last_name,
      p.gender,
      d.death_date,
      d.cause_of_death,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM deaths d
    INNER JOIN vital_records vr
      ON d.record_id = vr.record_id
    INNER JOIN persons p
      ON vr.person_id = p.person_id
    WHERE vr.record_type = 'Death'
    ORDER BY d.death_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Get deaths error:", error);

      return res.status(500).json({
        message: "Failed to retrieve death records",
      });
    }

    return res.status(200).json(results);
  });
};

const getDeathById = (req, res) => {
  const { id } = req.params;

  // Validate death ID
  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid death ID",
    });
  }

  const sql = `
    SELECT
      d.death_id,
      vr.record_id,
      vr.person_id,
      p.first_name,
      p.middle_name,
      p.last_name,
      p.gender,
      d.death_date,
      d.cause_of_death,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM deaths d
    INNER JOIN vital_records vr
      ON d.record_id = vr.record_id
    INNER JOIN persons p
      ON vr.person_id = p.person_id
    WHERE d.death_id = ?
      AND vr.record_type = 'Death'
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      console.error("Get death by ID error:", error);

      return res.status(500).json({
        message: "Failed to retrieve death record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Death record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

const updateDeath = (req, res) => {
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

  // Validate death ID
  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid death ID",
    });
  }

  // Validate required fields
  if (
    person_id == null ||
    !registration_date ||
    registered_by == null ||
    !death_date ||
    !status
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, death_date, and status are required",
    });
  }

  // Validate date format
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(registration_date) || !datePattern.test(death_date)) {
    return res.status(400).json({
      message: "Dates must use YYYY-MM-DD format",
    });
  }

  // Validate status
  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status",
    });
  }

  // Validate cause of death
  if (
    cause_of_death != null &&
    (typeof cause_of_death !== "string" || cause_of_death.trim().length > 255)
  ) {
    return res.status(400).json({
      message: "cause_of_death must not exceed 255 characters",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN deaths d
      ON d.record_id = vr.record_id
    SET vr.person_id = ?,
        vr.location_id = ?,
        vr.registration_date = ?,
        vr.registered_by = ?,
        vr.status = ?,
        d.death_date = ?,
        d.cause_of_death = ?
    WHERE d.death_id = ?
      AND vr.record_type = 'Death'
  `;

  const values = [
    person_id,
    location_id ?? null,
    registration_date,
    registered_by,
    status,
    death_date,
    cause_of_death?.trim() || null,
    Number(id),
  ];

  connection.query(sql, values, (error, result) => {
    if (error) {
      console.error("Update death error:", error);

      return res.status(400).json({
        message:
          "Failed to update death record. Check supplied IDs and values.",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Death record not found or no changes were made",
      });
    }

    return res.status(200).json({
      message: "Death record updated successfully",
      death_id: Number(id),
    });
  });
};

const cancelDeath = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  // Validate death ID
  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid death ID",
    });
  }

  // Validate cancellation reason
  if (typeof cancel_reason !== "string" || cancel_reason.trim() === "") {
    return res.status(400).json({
      message: "Cancellation reason is required",
    });
  }

  if (cancel_reason.trim().length > 500) {
    return res.status(400).json({
      message: "Cancellation reason cannot exceed 500 characters",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN deaths d
      ON d.record_id = vr.record_id
    SET vr.status = 'Cancelled',
        vr.cancel_reason = ?
    WHERE d.death_id = ?
      AND vr.record_type = 'Death'
      AND vr.status <> 'Cancelled'
  `;

  connection.query(sql, [cancel_reason.trim(), Number(id)], (error, result) => {
    if (error) {
      console.error("Cancel death error:", error);

      return res.status(500).json({
        message: "Failed to cancel death record",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Death record not found or already cancelled",
      });
    }

    return res.status(200).json({
      message: "Death record cancelled successfully",
      death_id: Number(id),
      status: "Cancelled",
      cancel_reason: cancel_reason.trim(),
    });
  });
};
module.exports = {
  createDeath,
  getDeaths,
  getDeathById,
  updateDeath,
  cancelDeath,
};
