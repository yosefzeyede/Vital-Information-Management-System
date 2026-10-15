const connection = require("../config/db");

// Create a marriage record

const createMarriage = (req, res) => {
  const {
    person1_id,
    person2_id,
    location_id,
    registration_date,
    registered_by,
    marriage_date,
  } = req.body;

  // 1. Validate required fields
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
  const isPositiveInteger = (value) =>
    Number.isInteger(Number(value)) && Number(value) > 0;

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

  // 3. A person cannot marry themselves
  if (Number(person1_id) === Number(person2_id)) {
    return res.status(400).json({
      message: "A person cannot marry themselves",
    });
  }

  // 4. Validate date format and actual calendar date
  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

  if (!isValidDate(registration_date) || !isValidDate(marriage_date)) {
    return res.status(400).json({
      message: "Dates must be valid dates in YYYY-MM-DD format",
    });
  }

  // 5. Registration date cannot precede marriage date
  if (registration_date < marriage_date) {
    return res.status(400).json({
      message: "registration_date cannot be earlier than marriage_date",
    });
  }

  // 6. Start transaction using the existing connection
  connection.beginTransaction((err) => {
    if (err) {
      console.error("Begin transaction error:", err);

      return res.status(500).json({
        message: "Failed to start marriage transaction",
      });
    }

    // 7. Create the main vital record
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
        location_id ? Number(location_id) : null,
        registration_date,
        Number(registered_by),
      ],
      (error, recordResult) => {
        if (error) {
          return connection.rollback(() => {
            console.error("Create vital record error:", error);

            return res.status(500).json({
              message: "Failed to create marriage record",
            });
          });
        }

        const record_id = recordResult.insertId;

        // 8. Create the marriage details
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
          [record_id, Number(person1_id), Number(person2_id), marriage_date],
          (error, marriageResult) => {
            if (error) {
              return connection.rollback(() => {
                console.error("Create marriage details error:", error);

                if (error.code === "ER_NO_REFERENCED_ROW_2") {
                  return res.status(400).json({
                    message:
                      "Invalid person ID. Check that both persons exist.",
                  });
                }

                return res.status(500).json({
                  message: "Failed to create marriage details",
                });
              });
            }

            // 9. Commit transaction
            connection.commit((error) => {
              if (error) {
                return connection.rollback(() => {
                  console.error("Commit marriage error:", error);

                  return res.status(500).json({
                    message: "Failed to save marriage record",
                  });
                });
              }

              return res.status(201).json({
                message: "Marriage record created successfully",
                record_id,
                marriage_id: marriageResult.insertId,
              });
            });
          },
        );
      },
    );
  });
};
const getMarriages = (req, res) => {
  const sql = `
    SELECT
      m.marriage_id,
      vr.record_id,
      m.person1_id,
      CONCAT(p1.first_name, ' ', p1.middle_name, ' ', p1.last_name)
        AS person1_name,
      m.person2_id,
      CONCAT(p2.first_name, ' ', p2.middle_name, ' ', p2.last_name)
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
      console.error("Get marriages error:", error);

      return res.status(500).json({
        message: "Failed to retrieve marriage records",
      });
    }

    return res.status(200).json(results);
  });
};

const getMarriageById = (req, res) => {
  const { id } = req.params;

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      m.marriage_id,
      vr.record_id,
      m.person1_id,
      CONCAT(p1.first_name, ' ', p1.middle_name, ' ', p1.last_name)
        AS person1_name,
      m.person2_id,
      CONCAT(p2.first_name, ' ', p2.middle_name, ' ', p2.last_name)
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

  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error("Get marriage by ID error:", error);

      return res.status(500).json({
        message: "Failed to retrieve marriage record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Marriage record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

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
  } = req.body;

  // Validate marriage ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Marriage ID must be a positive integer",
    });
  }

  // Validate required fields
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

  const isPositiveInteger = (value) =>
    Number.isInteger(Number(value)) && Number(value) > 0;

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

  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

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

  if (!["Pending", "Active", "Cancelled"].includes(status)) {
    return res.status(400).json({
      message: "Invalid status",
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
      m.person1_id = ?,
      m.person2_id = ?,
      m.marriage_date = ?
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
  `;

  connection.query(
    sql,
    [
      location_id || null,
      registration_date,
      Number(registered_by),
      status,
      Number(person1_id),
      Number(person2_id),
      marriage_date,
      Number(id),
    ],
    (error, result) => {
      if (error) {
        console.error("Update marriage error:", error);

        if (error.code === "ER_NO_REFERENCED_ROW_2") {
          return res.status(400).json({
            message: "Invalid person, location, or registered_by ID",
          });
        }

        return res.status(500).json({
          message: "Failed to update marriage record",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Marriage record not found or no changes made",
        });
      }

      return res.status(200).json({
        message: "Marriage record updated successfully",
        marriage_id: Number(id),
      });
    },
  );
};

const cancelMarriage = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  // Validate marriage ID
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid marriage ID",
    });
  }

  // Validate cancellation reason
  if (
    !cancel_reason ||
    typeof cancel_reason !== "string" ||
    !cancel_reason.trim()
  ) {
    return res.status(400).json({
      message: "Cancellation reason is required",
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
      console.error("Cancel marriage error:", error);

      return res.status(500).json({
        message: "Failed to cancel marriage record",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Marriage record not found or already cancelled",
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

const approveMarriage = (req, res) => {
  const { id } = req.params;

  // Validate marriage ID
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid marriage ID",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN marriages m
      ON m.record_id = vr.record_id
    SET vr.status = 'Active'
    WHERE m.marriage_id = ?
      AND vr.record_type = 'Marriage'
      AND vr.status = 'Pending'
  `;

  connection.query(sql, [Number(id)], (error, result) => {
    if (error) {
      console.error("Approve marriage error:", error);

      return res.status(500).json({
        message: "Failed to approve marriage record",
      });
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
          console.error("Check marriage status error:", checkError);

          return res.status(500).json({
            message: "Failed to check marriage status",
          });
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

module.exports = {
  createMarriage,
  getMarriages,
  getMarriageById,
  updateMarriage,
  cancelMarriage,
  approveMarriage,
};
