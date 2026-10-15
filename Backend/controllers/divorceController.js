const connection = require("../config/db");

const createDivorce = (req, res) => {
  const {
    marriage_id,
    location_id,
    registration_date,
    registered_by,
    divorce_date,
    reason,
    court_reference,
  } = req.body;

  // Validate required fields
  if (!marriage_id || !registration_date || !registered_by || !divorce_date) {
    return res.status(400).json({
      message:
        "marriage_id, registration_date, registered_by, and divorce_date are required",
    });
  }

  // Validate IDs
  if (
    !Number.isInteger(Number(marriage_id)) ||
    Number(marriage_id) <= 0 ||
    !Number.isInteger(Number(registered_by)) ||
    Number(registered_by) <= 0 ||
    (location_id != null &&
      (!Number.isInteger(Number(location_id)) || Number(location_id) <= 0))
  ) {
    return res.status(400).json({
      message: "Invalid marriage_id, registered_by, or location_id",
    });
  }

  // Validate dates
  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

  if (!isValidDate(registration_date) || !isValidDate(divorce_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (divorce_date < registration_date) {
    return res.status(400).json({
      message: "divorce_date cannot be before registration_date",
    });
  }

  // Verify the marriage exists and has not been cancelled
  const marriageSql = `
    SELECT marriage_id
    FROM marriages
    WHERE marriage_id = ?
  `;

  connection.query(
    marriageSql,
    [Number(marriage_id)],
    (error, marriageRows) => {
      if (error) {
        console.error("Check marriage error:", error);

        return res.status(500).json({
          message: "Failed to verify marriage record",
        });
      }

      if (marriageRows.length === 0) {
        return res.status(404).json({
          message: "Marriage record not found",
        });
      }

      const sql = `
        SELECT m.marriage_id
        FROM marriages m
        INNER JOIN vital_records vr
          ON vr.record_id = m.record_id
        WHERE m.marriage_id = ?
          AND vr.status = 'Active'
      `;

      connection.query(sql, [Number(marriage_id)], (error, activeRows) => {
        if (error) {
          console.error("Verify active marriage error:", error);

          return res.status(500).json({
            message: "Failed to verify marriage status",
          });
        }

        if (activeRows.length === 0) {
          return res.status(400).json({
            message:
              "Only an active marriage can be used to create a divorce record",
          });
        }

        createDivorceTransaction();
      });
    },
  );

  function createDivorceTransaction() {
    connection.beginTransaction((error) => {
      if (error) {
        console.error("Begin divorce transaction error:", error);

        return res.status(500).json({
          message: "Failed to start divorce transaction",
        });
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
          location_id ? Number(location_id) : null,
          registration_date,
          Number(registered_by),
        ],
        (error, vitalResult) => {
          if (error) {
            return connection.rollback(() => {
              console.error("Create divorce vital record error:", error);

              if (error.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(400).json({
                  message:
                    "Invalid location_id or registered_by. Check that the referenced records exist.",
                });
              }

              return res.status(500).json({
                message: "Failed to create divorce record",
              });
            });
          }

          const record_id = vitalResult.insertId;

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
              record_id,
              Number(marriage_id),
              divorce_date,
              reason || null,
              court_reference || null,
            ],
            (error, divorceResult) => {
              if (error) {
                return connection.rollback(() => {
                  console.error("Create divorce details error:", error);

                  if (error.code === "ER_NO_REFERENCED_ROW_2") {
                    return res.status(400).json({
                      message:
                        "Invalid marriage_id. Check that the marriage exists.",
                    });
                  }

                  if (error.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({
                      message:
                        "A divorce record already exists for this marriage",
                    });
                  }

                  return res.status(500).json({
                    message: "Failed to create divorce details",
                  });
                });
              }

              connection.commit((error) => {
                if (error) {
                  return connection.rollback(() => {
                    console.error("Commit divorce error:", error);

                    return res.status(500).json({
                      message: "Failed to save divorce record",
                    });
                  });
                }

                return res.status(201).json({
                  message: "Divorce record created successfully",
                  record_id,
                  divorce_id: divorceResult.insertId,
                });
              });
            },
          );
        },
      );
    });
  }
};

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
      CONCAT(p1.first_name, ' ', p1.middle_name, ' ', p1.last_name)
        AS person1_name,
      CONCAT(p2.first_name, ' ', p2.middle_name, ' ', p2.last_name)
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
      console.error("Get divorces error:", error);

      return res.status(500).json({
        message: "Failed to retrieve divorce records",
      });
    }

    return res.status(200).json(results);
  });
};

const getDivorceById = (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid divorce ID",
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
      CONCAT(p1.first_name, ' ', p1.middle_name, ' ', p1.last_name)
        AS person1_name,
      CONCAT(p2.first_name, ' ', p2.middle_name, ' ', p2.last_name)
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
      console.error("Get divorce by ID error:", error);

      return res.status(500).json({
        message: "Failed to retrieve divorce record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Divorce record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

const updateDivorce = (req, res) => {
  const { id } = req.params;

  const {
    location_id,
    registration_date,
    divorce_date,
    reason,
    court_reference,
  } = req.body;

  // Validate divorce ID
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid divorce ID",
    });
  }

  // Required fields
  if (!registration_date || !divorce_date) {
    return res.status(400).json({
      message: "Registration date and divorce date are required",
    });
  }

  // Validate real calendar dates
  const isValidDate = (date) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    return (
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === date
    );
  };

  if (!isValidDate(registration_date) || !isValidDate(divorce_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (divorce_date < registration_date) {
    return res.status(400).json({
      message: "Divorce date cannot be before registration date",
    });
  }

  // Validate optional location ID
  let locationId = null;

  if (location_id !== undefined && location_id !== null && location_id !== "") {
    if (!Number.isInteger(Number(location_id)) || Number(location_id) <= 0) {
      return res.status(400).json({
        message: "Invalid location ID",
      });
    }

    locationId = Number(location_id);
  }

  const divorceId = Number(id);

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Begin transaction error:", transactionError);

      return res.status(500).json({
        message: "Failed to start update transaction",
      });
    }

    const selectSql = `
      SELECT d.divorce_id, d.record_id, vr.status
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
          console.error("Find divorce error:", error);

          return res.status(500).json({
            message: "Failed to find divorce record",
          });
        });
      }

      if (results.length === 0) {
        return connection.rollback(() => {
          return res.status(404).json({
            message: "Divorce record not found",
          });
        });
      }

      const divorce = results[0];

      if (divorce.status !== "Pending") {
        return connection.rollback(() => {
          return res.status(409).json({
            message: "Only Pending divorce records can be updated",
            current_status: divorce.status,
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
              console.error("Update vital record error:", recordError);

              return res
                .status(
                  recordError.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500,
                )
                .json({
                  message:
                    recordError.code === "ER_NO_REFERENCED_ROW_2"
                      ? "The specified location does not exist"
                      : "Failed to update vital record",
                });
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
            [divorce_date, reason || null, court_reference || null, divorceId],
            (divorceError) => {
              if (divorceError) {
                return connection.rollback(() => {
                  console.error("Update divorce error:", divorceError);

                  return res.status(500).json({
                    message: "Failed to update divorce details",
                  });
                });
              }

              connection.commit((commitError) => {
                if (commitError) {
                  return connection.rollback(() => {
                    console.error("Commit error:", commitError);

                    return res.status(500).json({
                      message: "Failed to save divorce changes",
                    });
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
    });
  });
};

const approveDivorce = (req, res) => {
  const { id } = req.params;
  const divorceId = Number(id);

  if (!Number.isInteger(divorceId) || divorceId <= 0) {
    return res.status(400).json({
      message: "Invalid divorce ID",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN divorces d
      ON d.record_id = vr.record_id
    SET vr.status = 'Active'
    WHERE d.divorce_id = ?
      AND vr.record_type = 'Divorce'
      AND vr.status = 'Pending'
  `;

  connection.query(sql, [divorceId], (error, result) => {
    if (error) {
      console.error("Approve divorce error:", error);

      return res.status(500).json({
        message: "Failed to approve divorce record",
      });
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
          console.error("Check divorce status error:", checkError);

          return res.status(500).json({
            message: "Failed to check divorce record",
          });
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

const cancelDivorce = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  const divorceId = Number(id);

  if (!Number.isInteger(divorceId) || divorceId <= 0) {
    return res.status(400).json({
      message: "Invalid divorce ID",
    });
  }

  if (typeof cancel_reason !== "string" || cancel_reason.trim().length === 0) {
    return res.status(400).json({
      message: "Cancellation reason is required",
    });
  }

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
      console.error("Cancel divorce error:", error);

      return res.status(500).json({
        message: "Failed to cancel divorce record",
      });
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
          return res.status(500).json({
            message: "Failed to check divorce record",
          });
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

module.exports = {
  createDivorce,
  getDivorces,
  getDivorceById,
  updateDivorce,
  approveDivorce,
  cancelDivorce,
};
