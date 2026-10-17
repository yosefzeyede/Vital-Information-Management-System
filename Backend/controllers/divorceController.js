const connection = require("../config/db");

// =====================================================
// REUSABLE VALIDATION HELPERS
// =====================================================

const isPositiveInteger = (value) => {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
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

const isOptionalText = (value, maxLength) =>
  value == null ||
  value === "" ||
  (typeof value === "string" && value.length <= maxLength);

const normalizeOptionalText = (value) =>
  value == null || value === "" ? null : value.trim();

const handleDatabaseError = (error, res, message) => {
  console.error(message, error);

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      message: "One or more referenced records do not exist",
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "A divorce record already exists for this marriage",
    });
  }

  return res.status(500).json({ message });
};

// =====================================================
// CREATE DIVORCE
// =====================================================

const createDivorce = (req, res) => {
  const {
    marriage_id,
    location_id,
    registration_date,
    registered_by,
    divorce_date,
    reason,
    court_reference,
  } = req.body || {};

  // 1. Required fields
  if (
    marriage_id == null ||
    marriage_id === "" ||
    registration_date == null ||
    registration_date === "" ||
    registered_by == null ||
    registered_by === "" ||
    divorce_date == null ||
    divorce_date === ""
  ) {
    return res.status(400).json({
      message:
        "marriage_id, registration_date, registered_by, and divorce_date are required",
    });
  }

  // 2. Validate IDs
  if (
    !isPositiveInteger(marriage_id) ||
    !isPositiveInteger(registered_by) ||
    (location_id != null &&
      location_id !== "" &&
      !isPositiveInteger(location_id))
  ) {
    return res.status(400).json({
      message:
        "marriage_id, registered_by, and location_id must be positive integers",
    });
  }

  // 3. Validate dates
  if (!isValidDate(registration_date) || !isValidDate(divorce_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  // A divorce must occur before or on its registration date.
  if (registration_date < divorce_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than divorce_date",
    });
  }

  // 4. Validate optional text
  if (!isOptionalText(reason, 255)) {
    return res.status(400).json({
      message: "reason must be a string of at most 255 characters",
    });
  }

  if (!isOptionalText(court_reference, 100)) {
    return res.status(400).json({
      message: "court_reference must be a string of at most 100 characters",
    });
  }

  // 5. Check references and marriage status
  const checkSql = `
    SELECT
      m.marriage_id,
      m.marriage_date,
      vr.status AS marriage_status,
      (SELECT COUNT(*)
       FROM users
       WHERE user_id = ?) AS user_exists,
      (SELECT COUNT(*)
       FROM locations
       WHERE location_id = ?) AS location_exists
    FROM marriages m
    INNER JOIN vital_records vr
      ON vr.record_id = m.record_id
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
  `;

  connection.query(
    checkSql,
    [
      Number(registered_by),
      location_id == null || location_id === "" ? null : Number(location_id),
      Number(marriage_id),
    ],
    (error, rows) => {
      if (error) {
        return handleDatabaseError(
          error,
          res,
          "Failed to verify marriage and divorce references",
        );
      }

      if (rows.length === 0) {
        return res.status(404).json({
          message: "Marriage record not found",
        });
      }

      const marriage = rows[0];

      if (!Number(marriage.user_exists)) {
        return res.status(400).json({
          message: "registered_by user does not exist",
        });
      }

      if (
        location_id != null &&
        location_id !== "" &&
        !Number(marriage.location_exists)
      ) {
        return res.status(400).json({
          message: "location_id does not exist",
        });
      }

      if (marriage.marriage_status !== "Active") {
        return res.status(400).json({
          message:
            "Only an active marriage can be used to create a divorce record",
        });
      }

      // Divorce cannot predate the marriage.
      const marriageDate = new Date(marriage.marriage_date)
        .toISOString()
        .slice(0, 10);

      if (divorce_date < marriageDate) {
        return res.status(400).json({
          message: "divorce_date cannot be earlier than marriage_date",
        });
      }

      // 6. Create the vital record and divorce details atomically.
      connection.beginTransaction((transactionError) => {
        if (transactionError) {
          return handleDatabaseError(
            transactionError,
            res,
            "Failed to start divorce transaction",
          );
        }

        const vitalSql = `
          INSERT INTO vital_records
          (
            person_id,
            location_id,
            record_type,
            registration_date,
            registered_by,
            status
          )
          VALUES (NULL, ?, 'Divorce', ?, ?, 'Pending')
        `;

        connection.query(
          vitalSql,
          [
            location_id == null || location_id === ""
              ? null
              : Number(location_id),
            registration_date,
            Number(registered_by),
          ],
          (vitalError, vitalResult) => {
            if (vitalError) {
              return connection.rollback(() => {
                handleDatabaseError(
                  vitalError,
                  res,
                  "Failed to create divorce vital record",
                );
              });
            }

            const recordId = vitalResult.insertId;

            const divorceSql = `
              INSERT INTO divorces
              (
                record_id,
                marriage_id,
                divorce_date,
                reason,
                court_reference
              )
              VALUES (?, ?, ?, ?, ?)
            `;

            connection.query(
              divorceSql,
              [
                recordId,
                Number(marriage_id),
                divorce_date,
                normalizeOptionalText(reason),
                normalizeOptionalText(court_reference),
              ],
              (divorceError, divorceResult) => {
                if (divorceError) {
                  return connection.rollback(() => {
                    handleDatabaseError(
                      divorceError,
                      res,
                      "Failed to create divorce details",
                    );
                  });
                }

                connection.commit((commitError) => {
                  if (commitError) {
                    return connection.rollback(() => {
                      handleDatabaseError(
                        commitError,
                        res,
                        "Failed to save divorce record",
                      );
                    });
                  }

                  return res.status(201).json({
                    message: "Divorce record created successfully",
                    record_id: recordId,
                    divorce_id: divorceResult.insertId,
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
// GET ALL DIVORCES
// =====================================================

const getDivorces = (req, res) => {
  const sql = `
    SELECT
      d.divorce_id,
      d.record_id,
      d.marriage_id,
      d.divorce_date,
      d.reason,
      d.court_reference,
      m.person1_id,
      m.person2_id,
      CONCAT_WS(' ', p1.first_name, p1.middle_name, p1.last_name)
        AS person1_name,
      CONCAT_WS(' ', p2.first_name, p2.middle_name, p2.last_name)
        AS person2_name,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM divorces d
    INNER JOIN vital_records vr
      ON d.record_id = vr.record_id
    INNER JOIN marriages m
      ON d.marriage_id = m.marriage_id
    INNER JOIN persons p1
      ON m.person1_id = p1.person_id
    INNER JOIN persons p2
      ON m.person2_id = p2.person_id
    WHERE vr.record_type = 'Divorce'
    ORDER BY d.divorce_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to retrieve divorce records",
      );
    }

    return res.status(200).json({
      count: results.length,
      divorces: results,
    });
  });
};

// =====================================================
// GET DIVORCE BY ID
// =====================================================

const getDivorceById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Divorce ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      d.divorce_id,
      d.record_id,
      d.marriage_id,
      d.divorce_date,
      d.reason,
      d.court_reference,
      m.person1_id,
      m.person2_id,
      CONCAT_WS(' ', p1.first_name, p1.middle_name, p1.last_name)
        AS person1_name,
      CONCAT_WS(' ', p2.first_name, p2.middle_name, p2.last_name)
        AS person2_name,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason
    FROM divorces d
    INNER JOIN vital_records vr
      ON d.record_id = vr.record_id
    INNER JOIN marriages m
      ON d.marriage_id = m.marriage_id
    INNER JOIN persons p1
      ON m.person1_id = p1.person_id
    INNER JOIN persons p2
      ON m.person2_id = p2.person_id
    WHERE d.divorce_id = ?
      AND vr.record_type = 'Divorce'
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to retrieve divorce record",
      );
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Divorce record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

// =====================================================
// UPDATE DIVORCE
// =====================================================

const updateDivorce = (req, res) => {
  const { id } = req.params;

  const {
    location_id,
    registration_date,
    divorce_date,
    reason,
    court_reference,
  } = req.body || {};

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Divorce ID must be a positive integer",
    });
  }

  if (
    registration_date == null ||
    registration_date === "" ||
    divorce_date == null ||
    divorce_date === ""
  ) {
    return res.status(400).json({
      message: "registration_date and divorce_date are required",
    });
  }

  if (!isValidDate(registration_date) || !isValidDate(divorce_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (registration_date < divorce_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than divorce_date",
    });
  }

  let locationId = null;

  if (location_id != null && location_id !== "") {
    if (!isPositiveInteger(location_id)) {
      return res.status(400).json({
        message: "location_id must be a positive integer",
      });
    }

    locationId = Number(location_id);
  }

  if (!isOptionalText(reason, 255)) {
    return res.status(400).json({
      message: "reason must be at most 255 characters",
    });
  }

  if (!isOptionalText(court_reference, 100)) {
    return res.status(400).json({
      message: "court_reference must be at most 100 characters",
    });
  }

  const divorceId = Number(id);

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      return handleDatabaseError(
        transactionError,
        res,
        "Failed to start update transaction",
      );
    }

    const selectSql = `
      SELECT d.divorce_id, d.record_id, d.divorce_date, vr.status
      FROM divorces d
      INNER JOIN vital_records vr
        ON d.record_id = vr.record_id
      WHERE d.divorce_id = ?
        AND vr.record_type = 'Divorce'
      FOR UPDATE
    `;

    connection.query(selectSql, [divorceId], (error, results) => {
      if (error) {
        return connection.rollback(() => {
          handleDatabaseError(error, res, "Failed to find divorce record");
        });
      }

      if (results.length === 0) {
        return connection.rollback(() => {
          res.status(404).json({
            message: "Divorce record not found",
          });
        });
      }

      const divorce = results[0];

      if (divorce.status !== "Pending") {
        return connection.rollback(() => {
          res.status(409).json({
            message: "Only Pending divorce records can be updated",
            current_status: divorce.status,
          });
        });
      }

      const marriageSql = `
        SELECT m.marriage_date
        FROM divorces d
        INNER JOIN marriages m
          ON d.marriage_id = m.marriage_id
        WHERE d.divorce_id = ?
      `;

      connection.query(
        marriageSql,
        [divorceId],
        (marriageError, marriageRows) => {
          if (marriageError) {
            return connection.rollback(() => {
              handleDatabaseError(
                marriageError,
                res,
                "Failed to verify marriage date",
              );
            });
          }

          if (marriageRows.length === 0) {
            return connection.rollback(() => {
              res.status(400).json({
                message: "The related marriage record does not exist",
              });
            });
          }

          const marriageDate = new Date(marriageRows[0].marriage_date)
            .toISOString()
            .slice(0, 10);

          if (divorce_date < marriageDate) {
            return connection.rollback(() => {
              res.status(400).json({
                message: "divorce_date cannot be earlier than marriage_date",
              });
            });
          }

          const updateRecordSql = `
            UPDATE vital_records
            SET location_id = ?,
                registration_date = ?
            WHERE record_id = ?
              AND record_type = 'Divorce'
              AND status = 'Pending'
          `;

          connection.query(
            updateRecordSql,
            [locationId, registration_date, divorce.record_id],
            (recordError) => {
              if (recordError) {
                return connection.rollback(() => {
                  handleDatabaseError(
                    recordError,
                    res,
                    "Failed to update vital record",
                  );
                });
              }

              const updateDivorceSql = `
                UPDATE divorces
                SET divorce_date = ?,
                    reason = ?,
                    court_reference = ?
                WHERE divorce_id = ?
              `;

              connection.query(
                updateDivorceSql,
                [
                  divorce_date,
                  normalizeOptionalText(reason),
                  normalizeOptionalText(court_reference),
                  divorceId,
                ],
                (divorceError) => {
                  if (divorceError) {
                    return connection.rollback(() => {
                      handleDatabaseError(
                        divorceError,
                        res,
                        "Failed to update divorce details",
                      );
                    });
                  }

                  connection.commit((commitError) => {
                    if (commitError) {
                      return connection.rollback(() => {
                        handleDatabaseError(
                          commitError,
                          res,
                          "Failed to save divorce changes",
                        );
                      });
                    }

                    return res.status(200).json({
                      message: "Divorce record updated successfully",
                      divorce_id: divorceId,
                    });
                  });
                },
              );
            },
          );
        },
      );
    });
  });
};

// =====================================================
// APPROVE DIVORCE
// =====================================================

const approveDivorce = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Divorce ID must be a positive integer",
    });
  }

  const divorceId = Number(id);

  const sql = `
    UPDATE vital_records vr
    INNER JOIN divorces d
      ON d.record_id = vr.record_id
    SET vr.status = 'Active',
        vr.cancel_reason = NULL
    WHERE d.divorce_id = ?
      AND vr.record_type = 'Divorce'
      AND vr.status = 'Pending'
  `;

  connection.query(sql, [divorceId], (error, result) => {
    if (error) {
      return handleDatabaseError(
        error,
        res,
        "Failed to approve divorce record",
      );
    }

    if (result.affectedRows === 0) {
      const checkSql = `
        SELECT vr.status
        FROM divorces d
        INNER JOIN vital_records vr
          ON d.record_id = vr.record_id
        WHERE d.divorce_id = ?
          AND vr.record_type = 'Divorce'
      `;

      return connection.query(checkSql, [divorceId], (checkError, rows) => {
        if (checkError) {
          return handleDatabaseError(
            checkError,
            res,
            "Failed to check divorce status",
          );
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Divorce record not found",
          });
        }

        return res.status(409).json({
          message: "Only Pending divorce records can be approved",
          current_status: rows[0].status,
        });
      });
    }

    return res.status(200).json({
      message: "Divorce record approved successfully",
      divorce_id: divorceId,
      status: "Active",
    });
  });
};

// =====================================================
// CANCEL DIVORCE
// =====================================================

const cancelDivorce = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body || {};

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Divorce ID must be a positive integer",
    });
  }

  if (typeof cancel_reason !== "string" || cancel_reason.trim().length === 0) {
    return res.status(400).json({
      message: "Cancellation reason is required",
    });
  }

  if (cancel_reason.trim().length > 500) {
    return res.status(400).json({
      message: "Cancellation reason cannot exceed 500 characters",
    });
  }

  const divorceId = Number(id);

  const sql = `
    UPDATE vital_records vr
    INNER JOIN divorces d
      ON d.record_id = vr.record_id
    SET vr.status = 'Cancelled',
        vr.cancel_reason = ?
    WHERE d.divorce_id = ?
      AND vr.record_type = 'Divorce'
      AND vr.status IN ('Pending', 'Active')
  `;

  connection.query(sql, [cancel_reason.trim(), divorceId], (error, result) => {
    if (error) {
      return handleDatabaseError(error, res, "Failed to cancel divorce record");
    }

    if (result.affectedRows === 0) {
      const checkSql = `
          SELECT vr.status
          FROM divorces d
          INNER JOIN vital_records vr
            ON d.record_id = vr.record_id
          WHERE d.divorce_id = ?
            AND vr.record_type = 'Divorce'
        `;

      return connection.query(checkSql, [divorceId], (checkError, rows) => {
        if (checkError) {
          return handleDatabaseError(
            checkError,
            res,
            "Failed to check divorce record",
          );
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Divorce record not found",
          });
        }

        return res.status(409).json({
          message: "Divorce record is already cancelled",
          status: rows[0].status,
        });
      });
    }

    return res.status(200).json({
      message: "Divorce record cancelled successfully",
      divorce_id: divorceId,
      status: "Cancelled",
      cancel_reason: cancel_reason.trim(),
    });
  });
};

// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
  createDivorce,
  getDivorces,
  getDivorceById,
  updateDivorce,
  approveDivorce,
  cancelDivorce,
};
