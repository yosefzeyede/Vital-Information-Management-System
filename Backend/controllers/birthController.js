const connection = require("../config/db");

const createBirth = (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    father_id,
    mother_id,
  } = req.body;

  // Validate required fields
  if (person_id == null || !registration_date || registered_by == null) {
    return res.status(400).json({
      message: "person_id, registration_date, and registered_by are required",
    });
  }

  // Validate date format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registration_date)) {
    return res.status(400).json({
      message: "registration_date must use YYYY-MM-DD format",
    });
  }

  // Father and mother cannot be the same person
  if (
    father_id != null &&
    mother_id != null &&
    Number(father_id) === Number(mother_id)
  ) {
    return res.status(400).json({
      message: "Father and mother must be different persons",
    });
  }

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      return res.status(500).json({
        message: "Failed to start database transaction",
      });
    }

    const vitalRecordSql = `
            INSERT INTO vital_records (
                person_id,
                location_id,
                record_type,
                registration_date,
                registered_by,
                status
            )
            VALUES (?, ?, 'Birth', ?, ?, 'Pending')
        `;

    const vitalRecordValues = [
      person_id,
      location_id ?? null,
      registration_date,
      registered_by,
    ];

    connection.query(
      vitalRecordSql,
      vitalRecordValues,
      (recordError, recordResult) => {
        if (recordError) {
          return connection.rollback(() => {
            if (recordError.code === "ER_NO_REFERENCED_ROW_2") {
              return res.status(400).json({
                message: "Invalid person_id, location_id, or registered_by",
              });
            }

            return res.status(500).json({
              message: "Failed to create vital record",
              error: recordError.message,
            });
          });
        }

        const recordId = recordResult.insertId;

        const birthSql = `
                    INSERT INTO births (
                        record_id,
                        father_id,
                        mother_id
                    )
                    VALUES (?, ?, ?)
                `;

        const birthValues = [recordId, father_id ?? null, mother_id ?? null];

        connection.query(birthSql, birthValues, (birthError, birthResult) => {
          if (birthError) {
            return connection.rollback(() => {
              if (birthError.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(400).json({
                  message: "Invalid father_id or mother_id",
                });
              }

              return res.status(500).json({
                message: "Failed to create birth details",
                error: birthError.message,
              });
            });
          }

          connection.commit((commitError) => {
            if (commitError) {
              return connection.rollback(() => {
                return res.status(500).json({
                  message: "Failed to save birth record",
                });
              });
            }

            return res.status(201).json({
              message: "Birth record created successfully",
              record_id: recordId,
              birth_id: birthResult.insertId,
            });
          });
        });
      },
    );
  });
};

const getBirths = (req, res) => {
  const sql = `
    SELECT
      b.birth_id,
      vr.record_id,
      vr.person_id,
      child.first_name AS child_first_name,
      child.middle_name AS child_middle_name,
      child.last_name AS child_last_name,
      b.father_id,
      father.first_name AS father_first_name,
      father.last_name AS father_last_name,
      b.mother_id,
      mother.first_name AS mother_first_name,
      mother.last_name AS mother_last_name,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status
    FROM births b
    INNER JOIN vital_records vr
      ON b.record_id = vr.record_id
    INNER JOIN persons child
      ON vr.person_id = child.person_id
    LEFT JOIN persons father
      ON b.father_id = father.person_id
    LEFT JOIN persons mother
      ON b.mother_id = mother.person_id
    WHERE vr.record_type = 'Birth'
    ORDER BY b.birth_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve birth records",
        error: err.message,
      });
    }

    return res.status(200).json(results);
  });
};

const getBirthById = (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid birth ID",
    });
  }

  const sql = `
    SELECT
      b.birth_id,
      vr.record_id,
      vr.person_id,
      child.first_name AS child_first_name,
      child.middle_name AS child_middle_name,
      child.last_name AS child_last_name,
      b.father_id,
      father.first_name AS father_first_name,
      father.last_name AS father_last_name,
      b.mother_id,
      mother.first_name AS mother_first_name,
      mother.last_name AS mother_last_name,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status
    FROM births b
    INNER JOIN vital_records vr
      ON b.record_id = vr.record_id
    INNER JOIN persons child
      ON vr.person_id = child.person_id
    LEFT JOIN persons father
      ON b.father_id = father.person_id
    LEFT JOIN persons mother
      ON b.mother_id = mother.person_id
    WHERE b.birth_id = ?
      AND vr.record_type = 'Birth'
  `;

  connection.query(sql, [Number(id)], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve birth record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Birth record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

const updateBirth = (req, res) => {
  const { id } = req.params;

  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    father_id,
    mother_id,
    status,
  } = req.body;

  // Validate birth ID
  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid birth ID",
    });
  }

  // Validate required fields
  if (
    person_id == null ||
    !registration_date ||
    registered_by == null ||
    !status
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, and status are required",
    });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registration_date)) {
    return res.status(400).json({
      message: "registration_date must use YYYY-MM-DD format",
    });
  }

  // Validate status
  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status",
    });
  }

  // Father and mother cannot be the same person
  if (
    father_id != null &&
    mother_id != null &&
    Number(father_id) === Number(mother_id)
  ) {
    return res.status(400).json({
      message: "Father and mother must be different persons",
    });
  }

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      return res.status(500).json({
        message: "Failed to start transaction",
      });
    }

    // Find the vital record connected to this birth
    const findSql = `
      SELECT b.record_id
      FROM births b
      INNER JOIN vital_records vr
        ON b.record_id = vr.record_id
      WHERE b.birth_id = ?
        AND vr.record_type = 'Birth'
    `;

    connection.query(findSql, [Number(id)], (findError, rows) => {
      if (findError) {
        return connection.rollback(() => {
          res.status(500).json({
            message: "Failed to find birth record",
          });
        });
      }

      if (rows.length === 0) {
        return connection.rollback(() => {
          res.status(404).json({
            message: "Birth record not found",
          });
        });
      }

      const recordId = rows[0].record_id;

      const updateRecordSql = `
        UPDATE vital_records
        SET person_id = ?,
            location_id = ?,
            registration_date = ?,
            registered_by = ?,
            status = ?
        WHERE record_id = ?
          AND record_type = 'Birth'
      `;

      const recordValues = [
        person_id,
        location_id ?? null,
        registration_date,
        registered_by,
        status,
        recordId,
      ];

      connection.query(updateRecordSql, recordValues, (recordError) => {
        if (recordError) {
          return connection.rollback(() => {
            res.status(400).json({
              message: "Failed to update vital record. Check supplied IDs.",
            });
          });
        }

        const updateBirthSql = `
            UPDATE births
            SET father_id = ?,
                mother_id = ?
            WHERE birth_id = ?
          `;

        const birthValues = [father_id ?? null, mother_id ?? null, Number(id)];

        connection.query(updateBirthSql, birthValues, (birthError) => {
          if (birthError) {
            return connection.rollback(() => {
              res.status(400).json({
                message:
                  "Failed to update birth details. Check father_id and mother_id.",
              });
            });
          }

          connection.commit((commitError) => {
            if (commitError) {
              return connection.rollback(() => {
                res.status(500).json({
                  message: "Failed to save updated birth record",
                });
              });
            }

            return res.status(200).json({
              message: "Birth record updated successfully",
              birth_id: Number(id),
              record_id: recordId,
            });
          });
        });
      });
    });
  });
};

const cancelBirth = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  // Validate birth ID
  if (!Number.isInteger(Number(id)) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid birth ID",
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
    INNER JOIN births b
      ON b.record_id = vr.record_id
    SET vr.status = 'Cancelled',
        vr.cancel_reason = ?
    WHERE b.birth_id = ?
      AND vr.record_type = 'Birth'
      AND vr.status <> 'Cancelled'
  `;

  connection.query(sql, [cancel_reason.trim(), Number(id)], (error, result) => {
    if (error) {
      console.error("Cancel birth error:", error);

      return res.status(500).json({
        message: "Failed to cancel birth record",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Birth record not found or already cancelled",
      });
    }

    return res.status(200).json({
      message: "Birth record cancelled successfully",
      birth_id: Number(id),
      status: "Cancelled",
      cancel_reason: cancel_reason.trim(),
    });
  });
};
module.exports = {
  createBirth,
  getBirths,
  getBirthById,
  updateBirth,
  cancelBirth,
};
