const connection = require("../config/db");

// ==================== HELPER FUNCTIONS ====================

// Validate positive integer IDs
const isPositiveInteger = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return false;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0;
};

// Validate a real date in YYYY-MM-DD format
const isValidDate = (value) => {
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1000 || year > 9999) return false;

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

// Get today's date in local YYYY-MM-DD format
const getToday = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// Validate optional foreign key IDs
const isValidOptionalId = (value) =>
  value === null || value === undefined || isPositiveInteger(value);

// Roll back transaction safely
const rollback = (res, statusCode, message) => {
  connection.rollback((error) => {
    if (error) {
      console.error("Transaction rollback error:", error);
    }

    if (!res.headersSent) {
      return res.status(statusCode).json({ message });
    }
  });
};

// Check whether a referenced record exists
const checkExists = (table, column, value, callback) => {
  // These table and column names are internal constants,
  // not values supplied by the client.
  const sql = `SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`;

  connection.query(sql, [value], (error, results) => {
    if (error) return callback(error);

    callback(null, results.length > 0);
  });
};

// Validate references used by a death record
const validateReferences = (personId, locationId, registeredBy, callback) => {
  checkExists("persons", "person_id", personId, (error, personExists) => {
    if (error) return callback(error);

    if (!personExists) {
      return callback(null, {
        status: 404,
        message: "Person not found",
      });
    }

    const checkLocation = (next) => {
      if (locationId == null) return next(null, null);

      checkExists(
        "locations",
        "location_id",
        locationId,
        (locationError, locationExists) => {
          if (locationError) return next(locationError);

          if (!locationExists) {
            return next(null, {
              status: 404,
              message: "Location not found",
            });
          }

          next(null, null);
        },
      );
    };

    checkLocation((locationError, locationProblem) => {
      if (locationError) return callback(locationError);
      if (locationProblem) return callback(null, locationProblem);

      checkExists("users", "user_id", registeredBy, (userError, userExists) => {
        if (userError) return callback(userError);

        if (!userExists) {
          return callback(null, {
            status: 404,
            message: "Registered-by user not found",
          });
        }

        callback(null, null);
      });
    });
  });
};

// Validate optional cause of death
const validateCause = (cause) => {
  if (cause == null) return true;

  return typeof cause === "string" && cause.trim().length <= 255;
};

// ==================== CREATE DEATH ====================

const createDeath = (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    death_date,
    cause_of_death,
  } = req.body;

  // Required fields
  if (
    person_id == null ||
    registration_date == null ||
    registered_by == null ||
    death_date == null ||
    registration_date === "" ||
    death_date === ""
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, and death_date are required",
    });
  }

  // Validate IDs
  if (
    !isPositiveInteger(person_id) ||
    !isPositiveInteger(registered_by) ||
    !isValidOptionalId(location_id)
  ) {
    return res.status(400).json({
      message:
        "person_id and registered_by must be positive integers; location_id must be a positive integer or null",
    });
  }

  // Validate dates
  if (!isValidDate(registration_date) || !isValidDate(death_date)) {
    return res.status(400).json({
      message: "Dates must be valid dates in YYYY-MM-DD format",
    });
  }

  if (death_date > getToday()) {
    return res.status(400).json({
      message: "death_date cannot be in the future",
    });
  }

  // A death should not be registered before it occurred
  if (registration_date < death_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than death_date",
    });
  }

  if (!validateCause(cause_of_death)) {
    return res.status(400).json({
      message: "cause_of_death must be a string not exceeding 255 characters",
    });
  }

  // Check foreign key references before starting the transaction
  validateReferences(
    Number(person_id),
    location_id == null ? null : Number(location_id),
    Number(registered_by),
    (validationError, problem) => {
      if (validationError) {
        console.error("Death reference validation error:", validationError);

        return res.status(500).json({
          message: "Failed to validate death record references",
        });
      }

      if (problem) {
        return res.status(problem.status).json({
          message: problem.message,
        });
      }

      connection.beginTransaction((transactionError) => {
        if (transactionError) {
          console.error("Begin death transaction error:", transactionError);

          return res.status(500).json({
            message: "Failed to start transaction",
          });
        }

        const recordSql = `
          INSERT INTO vital_records (
            person_id,
            location_id,
            record_type,
            registration_date,
            registered_by,
            status
          )
          VALUES (?, ?, 'Death', ?, ?, 'Pending')
        `;

        const recordValues = [
          Number(person_id),
          location_id == null ? null : Number(location_id),
          registration_date,
          Number(registered_by),
        ];

        connection.query(
          recordSql,
          recordValues,
          (recordError, recordResult) => {
            if (recordError) {
              console.error("Create vital record error:", recordError);

              return rollback(res, 500, "Failed to create vital record");
            }

            const recordId = recordResult.insertId;

            const deathSql = `
              INSERT INTO deaths (
                record_id,
                death_date,
                cause_of_death
              )
              VALUES (?, ?, ?)
            `;

            connection.query(
              deathSql,
              [
                recordId,
                death_date,
                cause_of_death == null ? null : cause_of_death.trim() || null,
              ],
              (deathError, deathResult) => {
                if (deathError) {
                  console.error("Create death details error:", deathError);

                  return rollback(res, 500, "Failed to save death details");
                }

                connection.commit((commitError) => {
                  if (commitError) {
                    console.error("Death commit error:", commitError);

                    return rollback(res, 500, "Failed to save death record");
                  }

                  return res.status(201).json({
                    message: "Death record created successfully",
                    record_id: recordId,
                    death_id: deathResult.insertId,
                    status: "Pending",
                  });
                });
              },
            );
          },
        );
      });
    },
  );
};

// ==================== GET ALL DEATHS ====================

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
      p.date_of_birth,
      d.death_date,
      d.cause_of_death,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
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

    return res.status(200).json({
      count: results.length,
      deaths: results,
    });
  });
};

// ==================== GET DEATH BY ID ====================

const getDeathById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
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
      p.date_of_birth,
      d.death_date,
      d.cause_of_death,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
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

// ==================== UPDATE DEATH ====================

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

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid death ID",
    });
  }

  if (
    person_id == null ||
    registration_date == null ||
    registered_by == null ||
    death_date == null ||
    status == null ||
    registration_date === "" ||
    death_date === "" ||
    status === ""
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, death_date, and status are required",
    });
  }

  if (
    !isPositiveInteger(person_id) ||
    !isPositiveInteger(registered_by) ||
    !isValidOptionalId(location_id)
  ) {
    return res.status(400).json({
      message:
        "person_id and registered_by must be positive integers; location_id must be a positive integer or null",
    });
  }

  if (!isValidDate(registration_date) || !isValidDate(death_date)) {
    return res.status(400).json({
      message: "Dates must be valid dates in YYYY-MM-DD format",
    });
  }

  if (death_date > getToday()) {
    return res.status(400).json({
      message: "death_date cannot be in the future",
    });
  }

  if (registration_date < death_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than death_date",
    });
  }

  const allowedStatuses = ["Pending", "Active"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message:
        "Invalid status. Use Pending or Active; use the cancel endpoint to cancel a record",
    });
  }

  if (!validateCause(cause_of_death)) {
    return res.status(400).json({
      message: "cause_of_death must be a string not exceeding 255 characters",
    });
  }

  validateReferences(
    Number(person_id),
    location_id == null ? null : Number(location_id),
    Number(registered_by),
    (validationError, problem) => {
      if (validationError) {
        console.error(
          "Update death reference validation error:",
          validationError,
        );

        return res.status(500).json({
          message: "Failed to validate death record references",
        });
      }

      if (problem) {
        return res.status(problem.status).json({
          message: problem.message,
        });
      }

      connection.beginTransaction((transactionError) => {
        if (transactionError) {
          console.error("Begin update transaction error:", transactionError);

          return res.status(500).json({
            message: "Failed to start update transaction",
          });
        }

        const findSql = `
          SELECT vr.record_id, vr.status
          FROM deaths d
          INNER JOIN vital_records vr
            ON d.record_id = vr.record_id
          WHERE d.death_id = ?
            AND vr.record_type = 'Death'
          FOR UPDATE
        `;

        connection.query(findSql, [Number(id)], (findError, results) => {
          if (findError) {
            console.error("Find death for update error:", findError);

            return rollback(
              res,
              500,
              "Failed to retrieve death record for update",
            );
          }

          if (results.length === 0) {
            return rollback(res, 404, "Death record not found");
          }

          if (results[0].status === "Cancelled") {
            return rollback(
              res,
              409,
              "Cancelled death records cannot be updated",
            );
          }

          const updateSql = `
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
            Number(person_id),
            location_id == null ? null : Number(location_id),
            registration_date,
            Number(registered_by),
            status,
            death_date,
            cause_of_death == null ? null : cause_of_death.trim() || null,
            Number(id),
          ];

          connection.query(updateSql, values, (updateError) => {
            if (updateError) {
              console.error("Update death error:", updateError);

              return rollback(res, 500, "Failed to update death record");
            }

            connection.commit((commitError) => {
              if (commitError) {
                console.error("Update death commit error:", commitError);

                return rollback(
                  res,
                  500,
                  "Failed to save death record changes",
                );
              }

              return res.status(200).json({
                message: "Death record updated successfully",
                death_id: Number(id),
                status,
              });
            });
          });
        });
      });
    },
  );
};

// ==================== CANCEL DEATH ====================

const cancelDeath = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid death ID",
    });
  }

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

  const findSql = `
    SELECT vr.status
    FROM deaths d
    INNER JOIN vital_records vr
      ON d.record_id = vr.record_id
    WHERE d.death_id = ?
      AND vr.record_type = 'Death'
  `;

  connection.query(findSql, [Number(id)], (findError, results) => {
    if (findError) {
      console.error("Find death for cancellation error:", findError);

      return res.status(500).json({
        message: "Failed to retrieve death record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Death record not found",
      });
    }

    if (results[0].status === "Cancelled") {
      return res.status(409).json({
        message: "Death record is already cancelled",
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
        AND vr.status IN ('Pending', 'Active')
    `;

    connection.query(
      sql,
      [cancel_reason.trim(), Number(id)],
      (error, result) => {
        if (error) {
          console.error("Cancel death error:", error);

          return res.status(500).json({
            message: "Failed to cancel death record",
          });
        }

        if (result.affectedRows === 0) {
          return res.status(409).json({
            message: "Death record could not be cancelled",
          });
        }

        return res.status(200).json({
          message: "Death record cancelled successfully",
          death_id: Number(id),
          status: "Cancelled",
          cancel_reason: cancel_reason.trim(),
        });
      },
    );
  });
};

// ==================== EXPORT FUNCTIONS ====================

module.exports = {
  createDeath,
  getDeaths,
  getDeathById,
  updateDeath,
  cancelDeath,
};
