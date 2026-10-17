const connection = require("../config/db");

// =====================================================
// REUSABLE VALIDATION HELPERS
// =====================================================

const isPositiveInteger = (value) => {
  if (
    typeof value === "boolean" ||
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return false;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0;
};

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const allowedStatuses = ["Pending", "Active", "Cancelled"];

const handleDatabaseError = (error, res, defaultMessage) => {
  console.error(defaultMessage, error);

  if (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.code === "ER_ROW_IS_REFERENCED_2"
  ) {
    return res.status(400).json({
      message:
        "One or more referenced records do not exist or cannot be changed.",
    });
  }

  return res.status(500).json({
    message: defaultMessage,
  });
};

// =====================================================
// CREATE MARRIAGE
// =====================================================

const createMarriage = (req, res) => {
  const {
    person1_id,
    person2_id,
    location_id,
    registration_date,
    registered_by,
    marriage_date,
  } = req.body || {};

  // 1. Required fields
  if (
    person1_id == null ||
    person2_id == null ||
    registration_date == null ||
    registered_by == null ||
    marriage_date == null ||
    person1_id === "" ||
    person2_id === "" ||
    registration_date === "" ||
    registered_by === "" ||
    marriage_date === ""
  ) {
    return res.status(400).json({
      message:
        "person1_id, person2_id, registration_date, registered_by, and marriage_date are required",
    });
  }

  // 2. Validate IDs
  if (
    !isPositiveInteger(person1_id) ||
    !isPositiveInteger(person2_id) ||
    !isPositiveInteger(registered_by) ||
    (location_id != null &&
      location_id !== "" &&
      !isPositiveInteger(location_id))
  ) {
    return res.status(400).json({
      message: "IDs must be positive integers",
    });
  }

  // 3. Prevent self-marriage
  if (Number(person1_id) === Number(person2_id)) {
    return res.status(400).json({
      message: "A person cannot marry themselves",
    });
  }

  // 4. Validate dates
  if (!isValidDate(registration_date) || !isValidDate(marriage_date)) {
    return res.status(400).json({
      message: "Dates must be valid dates in YYYY-MM-DD format",
    });
  }

  // 5. Registration cannot precede marriage
  if (registration_date < marriage_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than marriage_date",
    });
  }

  // 6. Check that the referenced records exist
  const checkSql = `
    SELECT
      (SELECT COUNT(*) FROM persons WHERE person_id = ?) AS person1_exists,
      (SELECT COUNT(*) FROM persons WHERE person_id = ?) AS person2_exists,
      (SELECT COUNT(*) FROM users WHERE user_id = ?) AS user_exists,
      (SELECT COUNT(*) FROM locations WHERE location_id = ?) AS location_exists
  `;

  connection.query(
    checkSql,
    [
      Number(person1_id),
      Number(person2_id),
      Number(registered_by),
      location_id == null || location_id === "" ? null : Number(location_id),
    ],
    (checkError, rows) => {
      if (checkError) {
        return handleDatabaseError(
          checkError,
          res,
          "Failed to validate marriage references",
        );
      }

      const refs = rows[0];

      if (!Number(refs.person1_exists) || !Number(refs.person2_exists)) {
        return res.status(400).json({
          message: "Both persons must exist before creating a marriage",
        });
      }

      if (!Number(refs.user_exists)) {
        return res.status(400).json({
          message: "registered_by user does not exist",
        });
      }

      if (
        location_id != null &&
        location_id !== "" &&
        !Number(refs.location_exists)
      ) {
        return res.status(400).json({
          message: "location_id does not exist",
        });
      }

      // 7. Create both records in one transaction
      connection.beginTransaction((transactionError) => {
        if (transactionError) {
          return handleDatabaseError(
            transactionError,
            res,
            "Failed to start marriage transaction",
          );
        }

        const vitalRecordSql = `
          INSERT INTO vital_records
          (
            person_id,
            location_id,
            record_type,
            registration_date,
            registered_by,
            status
          )
          VALUES (?, ?, 'Marriage', ?, ?, 'Pending')
        `;

        connection.query(
          vitalRecordSql,
          [
            null,
            location_id == null || location_id === ""
              ? null
              : Number(location_id),
            registration_date,
            Number(registered_by),
          ],
          (recordError, recordResult) => {
            if (recordError) {
              return connection.rollback(() => {
                handleDatabaseError(
                  recordError,
                  res,
                  "Failed to create marriage vital record",
                );
              });
            }

            const record_id = recordResult.insertId;

            const marriageSql = `
              INSERT INTO marriages
              (
                record_id,
                person1_id,
                person2_id,
                marriage_date
              )
              VALUES (?, ?, ?, ?)
            `;

            connection.query(
              marriageSql,
              [
                record_id,
                Number(person1_id),
                Number(person2_id),
                marriage_date,
              ],
              (marriageError, marriageResult) => {
                if (marriageError) {
                  return connection.rollback(() => {
                    handleDatabaseError(
                      marriageError,
                      res,
                      "Failed to create marriage details",
                    );
                  });
                }

                connection.commit((commitError) => {
                  if (commitError) {
                    return connection.rollback(() => {
                      handleDatabaseError(
                        commitError,
                        res,
                        "Failed to save marriage record",
                      );
                    });
                  }

                  return res.status(201).json({
                    message: "Marriage record created successfully",
                    record_id,
                    marriage_id: marriageResult.insertId,
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

// =====================================================
// GET ALL MARRIAGES
// =====================================================

const getMarriages = (req, res) => {
  const sql = `
    SELECT
      m.marriage_id,
      vr.record_id,
      m.person1_id,
      CONCAT_WS(' ', p1.first_name, p1.middle_name, p1.last_name)
        AS person1_name,
      m.person2_id,
      CONCAT_WS(' ', p2.first_name, p2.middle_name, p2.last_name)
        AS person2_name,
      m.marriage_date,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM marriages m
    INNER JOIN vital_records vr
      ON m.record_id = vr.record_id
    INNER JOIN persons p1
      ON m.person1_id = p1.person_id
    INNER JOIN persons p2
      ON m.person2_id = p2.person_id
    WHERE vr.record_type = 'Marriage'
    ORDER BY m.marriage_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to retrieve marriage records",
      );
    }

    return res.status(200).json({
      count: results.length,
      marriages: results,
    });
  });
};

// =====================================================
// GET MARRIAGE BY ID
// =====================================================

const getMarriageById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      m.marriage_id,
      vr.record_id,
      m.person1_id,
      CONCAT_WS(' ', p1.first_name, p1.middle_name, p1.last_name)
        AS person1_name,
      m.person2_id,
      CONCAT_WS(' ', p2.first_name, p2.middle_name, p2.last_name)
        AS person2_name,
      m.marriage_date,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM marriages m
    INNER JOIN vital_records vr
      ON m.record_id = vr.record_id
    INNER JOIN persons p1
      ON m.person1_id = p1.person_id
    INNER JOIN persons p2
      ON m.person2_id = p2.person_id
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to retrieve marriage record",
      );
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Marriage record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

// =====================================================
// UPDATE MARRIAGE
// =====================================================

const updateMarriage = (req, res) => {
  const { id } = req.params;

  const {
    person1_id,
    person2_id,
    location_id,
    registration_date,
    registered_by,
    marriage_date,
    status,
    cancel_reason,
  } = req.body || {};

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  if (
    person1_id == null ||
    person2_id == null ||
    registration_date == null ||
    registered_by == null ||
    marriage_date == null ||
    status == null ||
    person1_id === "" ||
    person2_id === "" ||
    registration_date === "" ||
    registered_by === "" ||
    marriage_date === "" ||
    status === ""
  ) {
    return res.status(400).json({
      message: "All required fields must be provided",
    });
  }

  if (
    !isPositiveInteger(person1_id) ||
    !isPositiveInteger(person2_id) ||
    !isPositiveInteger(registered_by) ||
    (location_id != null &&
      location_id !== "" &&
      !isPositiveInteger(location_id))
  ) {
    return res.status(400).json({
      message: "IDs must be positive integers",
    });
  }

  if (Number(person1_id) === Number(person2_id)) {
    return res.status(400).json({
      message: "A person cannot marry themselves",
    });
  }

  if (!isValidDate(registration_date) || !isValidDate(marriage_date)) {
    return res.status(400).json({
      message: "Dates must be valid YYYY-MM-DD dates",
    });
  }

  if (registration_date < marriage_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than marriage_date",
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status. Use Pending, Active, or Cancelled",
    });
  }

  if (status === "Cancelled") {
    if (!isNonEmptyString(cancel_reason)) {
      return res.status(400).json({
        message: "cancel_reason is required when status is Cancelled",
      });
    }

    if (cancel_reason.trim().length > 500) {
      return res.status(400).json({
        message: "cancel_reason cannot exceed 500 characters",
      });
    }
  }

  if (
    status !== "Cancelled" &&
    cancel_reason != null &&
    cancel_reason !== "" &&
    typeof cancel_reason !== "string"
  ) {
    return res.status(400).json({
      message: "cancel_reason must be a string",
    });
  }

  if (
    status !== "Cancelled" &&
    typeof cancel_reason === "string" &&
    cancel_reason.length > 500
  ) {
    return res.status(400).json({
      message: "cancel_reason cannot exceed 500 characters",
    });
  }

  // Check the marriage exists before updating.
  const checkSql = `
    SELECT m.marriage_id
    FROM marriages m
    INNER JOIN vital_records vr
      ON vr.record_id = m.record_id
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
  `;

  connection.query(checkSql, [Number(id)], (checkError, existing) => {
    if (checkError) {
      return handleDatabaseError(
        checkError,
        res,
        "Failed to check marriage record",
      );
    }

    if (existing.length === 0) {
      return res.status(404).json({
        message: "Marriage record not found",
      });
    }

    const referenceSql = `
      SELECT
        (SELECT COUNT(*) FROM persons WHERE person_id = ?) AS person1_exists,
        (SELECT COUNT(*) FROM persons WHERE person_id = ?) AS person2_exists,
        (SELECT COUNT(*) FROM users WHERE user_id = ?) AS user_exists,
        (SELECT COUNT(*) FROM locations WHERE location_id = ?) AS location_exists
    `;

    connection.query(
      referenceSql,
      [
        Number(person1_id),
        Number(person2_id),
        Number(registered_by),
        location_id == null || location_id === "" ? null : Number(location_id),
      ],
      (referenceError, rows) => {
        if (referenceError) {
          return handleDatabaseError(
            referenceError,
            res,
            "Failed to validate marriage references",
          );
        }

        const refs = rows[0];

        if (!Number(refs.person1_exists) || !Number(refs.person2_exists)) {
          return res.status(400).json({
            message: "Both persons must exist",
          });
        }

        if (!Number(refs.user_exists)) {
          return res.status(400).json({
            message: "registered_by user does not exist",
          });
        }

        if (
          location_id != null &&
          location_id !== "" &&
          !Number(refs.location_exists)
        ) {
          return res.status(400).json({
            message: "location_id does not exist",
          });
        }

        const sql = `
          UPDATE vital_records vr
          INNER JOIN marriages m
            ON m.record_id = vr.record_id
          SET
            vr.person_id = NULL,
            vr.location_id = ?,
            vr.registration_date = ?,
            vr.registered_by = ?,
            vr.status = ?,
            vr.cancel_reason = ?,
            m.person1_id = ?,
            m.person2_id = ?,
            m.marriage_date = ?
          WHERE m.marriage_id = ?
            AND vr.record_type = 'Marriage'
        `;

        connection.query(
          sql,
          [
            location_id == null || location_id === ""
              ? null
              : Number(location_id),
            registration_date,
            Number(registered_by),
            status,
            status === "Cancelled" ? cancel_reason.trim() : null,
            Number(person1_id),
            Number(person2_id),
            marriage_date,
            Number(id),
          ],
          (error, result) => {
            if (error) {
              return handleDatabaseError(
                error,
                res,
                "Failed to update marriage record",
              );
            }

            // AffectedRows may be 0 when values have not changed.
            return res.status(200).json({
              message: "Marriage record updated successfully",
              marriage_id: Number(id),
            });
          },
        );
      },
    );
  });
};

// =====================================================
// CANCEL MARRIAGE
// =====================================================

const cancelMarriage = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body || {};

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  if (!isNonEmptyString(cancel_reason)) {
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
    INNER JOIN marriages m
      ON m.record_id = vr.record_id
    SET
      vr.status = 'Cancelled',
      vr.cancel_reason = ?
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
      AND vr.status != 'Cancelled'
  `;

  connection.query(sql, [cancel_reason.trim(), Number(id)], (error, result) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to cancel marriage record",
      );
    }

    if (result.affectedRows === 0) {
      const checkSql = `
          SELECT vr.status
          FROM marriages m
          INNER JOIN vital_records vr
            ON vr.record_id = m.record_id
          WHERE m.marriage_id = ?
            AND vr.record_type = 'Marriage'
        `;

      return connection.query(checkSql, [Number(id)], (checkError, rows) => {
        if (checkError) {
          return handleDatabaseError(
            checkError,
            res,
            "Failed to check marriage status",
          );
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Marriage record not found",
          });
        }

        return res.status(409).json({
          message: "Marriage record is already cancelled",
          status: rows[0].status,
        });
      });
    }

    return res.status(200).json({
      message: "Marriage record cancelled successfully",
      marriage_id: Number(id),
      status: "Cancelled",
      cancel_reason: cancel_reason.trim(),
    });
  });
};

// =====================================================
// APPROVE MARRIAGE
// =====================================================

const approveMarriage = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN marriages m
      ON m.record_id = vr.record_id
    SET
      vr.status = 'Active',
      vr.cancel_reason = NULL
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
      AND vr.status = 'Pending'
  `;

  connection.query(sql, [Number(id)], (error, result) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to approve marriage record",
      );
    }

    if (result.affectedRows === 0) {
      const checkSql = `
        SELECT vr.status
        FROM marriages m
        INNER JOIN vital_records vr
          ON vr.record_id = m.record_id
        WHERE m.marriage_id = ?
          AND vr.record_type = 'Marriage'
      `;

      return connection.query(checkSql, [Number(id)], (checkError, rows) => {
        if (checkError) {
          return handleDatabaseError(
            checkError,
            res,
            "Failed to check marriage status",
          );
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Marriage record not found",
          });
        }

        return res.status(409).json({
          message: "Only Pending marriage records can be approved",
          current_status: rows[0].status,
        });
      });
    }

    return res.status(200).json({
      message: "Marriage record approved successfully",
      marriage_id: Number(id),
      status: "Active",
    });
  });
};

// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
  createMarriage,
  getMarriages,
  getMarriageById,
  updateMarriage,
  cancelMarriage,
  approveMarriage,
};
