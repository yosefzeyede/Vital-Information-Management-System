const connection = require("../config/db");

const createAdoption = (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    adoptive_father_id,
    adoptive_mother_id,
    adoption_date,
    court_reference,
  } = req.body;

  // Required fields
  if (
    person_id === undefined ||
    person_id === null ||
    person_id === "" ||
    !registration_date ||
    !registered_by ||
    !adoption_date
  ) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, and adoption date are required",
    });
  }

  // Validate positive integer IDs
  const isPositiveInteger = (value) =>
    Number.isInteger(Number(value)) && Number(value) > 0;

  if (!isPositiveInteger(person_id) || !isPositiveInteger(registered_by)) {
    return res.status(400).json({
      message: "Person ID and registered_by must be positive integers",
    });
  }

  for (const [field, value] of [
    ["location_id", location_id],
    ["adoptive_father_id", adoptive_father_id],
    ["adoptive_mother_id", adoptive_mother_id],
  ]) {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !isPositiveInteger(value)
    ) {
      return res.status(400).json({
        message: `${field} must be a positive integer or null`,
      });
    }
  }

  // Validate YYYY-MM-DD dates
  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

  if (!isValidDate(registration_date) || !isValidDate(adoption_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (adoption_date < registration_date) {
    return res.status(400).json({
      message: "Adoption date cannot be before registration date",
    });
  }

  // At least one adoptive parent must be provided
  if (
    (adoptive_father_id === undefined ||
      adoptive_father_id === null ||
      adoptive_father_id === "") &&
    (adoptive_mother_id === undefined ||
      adoptive_mother_id === null ||
      adoptive_mother_id === "")
  ) {
    return res.status(400).json({
      message: "At least one adoptive parent is required",
    });
  }

  const locationId =
    location_id === undefined || location_id === null || location_id === ""
      ? null
      : Number(location_id);

  const fatherId =
    adoptive_father_id === undefined ||
    adoptive_father_id === null ||
    adoptive_father_id === ""
      ? null
      : Number(adoptive_father_id);

  const motherId =
    adoptive_mother_id === undefined ||
    adoptive_mother_id === null ||
    adoptive_mother_id === ""
      ? null
      : Number(adoptive_mother_id);

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Begin adoption transaction error:", transactionError);

      return res.status(500).json({
        message: "Failed to start adoption transaction",
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
      VALUES (?, ?, 'Adoption', ?, ?, 'Pending')
    `;

    connection.query(
      recordSql,
      [Number(person_id), locationId, registration_date, Number(registered_by)],
      (recordError, recordResult) => {
        if (recordError) {
          return connection.rollback(() => {
            console.error("Create adoption record error:", recordError);

            return res.status(400).json({
              message:
                "Failed to create adoption record. Check person, location, and user IDs.",
            });
          });
        }

        const recordId = recordResult.insertId;

        const adoptionSql = `
          INSERT INTO adoptions (
            record_id,
            adoptive_father_id,
            adoptive_mother_id,
            adoption_date,
            court_reference
          )
          VALUES (?, ?, ?, ?, ?)
        `;

        connection.query(
          adoptionSql,
          [
            recordId,
            fatherId,
            motherId,
            adoption_date,
            court_reference || null,
          ],
          (adoptionError, adoptionResult) => {
            if (adoptionError) {
              return connection.rollback(() => {
                console.error("Insert adoption details error:", adoptionError);

                return res.status(400).json({
                  message:
                    "Failed to save adoption details. Check adoptive parent IDs.",
                });
              });
            }

            connection.commit((commitError) => {
              if (commitError) {
                return connection.rollback(() => {
                  console.error("Commit adoption error:", commitError);

                  return res.status(500).json({
                    message: "Failed to save adoption record",
                  });
                });
              }

              return res.status(201).json({
                message: "Adoption record created successfully",
                record_id: recordId,
                adoption_id: adoptionResult.insertId,
                status: "Pending",
              });
            });
          },
        );
      },
    );
  });
};

const getAdoptions = (req, res) => {
  const sql = `
    SELECT
      a.adoption_id,
      a.record_id,
      vr.person_id,
      CONCAT(
        child.first_name, ' ',
        COALESCE(child.middle_name, ''), ' ',
        child.last_name
      ) AS adopted_person_name,
      a.adoptive_father_id,
      CONCAT(
        father.first_name, ' ',
        COALESCE(father.middle_name, ''), ' ',
        father.last_name
      ) AS adoptive_father_name,
      a.adoptive_mother_id,
      CONCAT(
        mother.first_name, ' ',
        COALESCE(mother.middle_name, ''), ' ',
        mother.last_name
      ) AS adoptive_mother_name,
      a.adoption_date,
      a.court_reference,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
    FROM adoptions a
    INNER JOIN vital_records vr
      ON a.record_id = vr.record_id
    LEFT JOIN persons child
      ON vr.person_id = child.person_id
    LEFT JOIN persons father
      ON a.adoptive_father_id = father.person_id
    LEFT JOIN persons mother
      ON a.adoptive_mother_id = mother.person_id
    WHERE vr.record_type = 'Adoption'
    ORDER BY a.adoption_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Get adoptions error:", error);

      return res.status(500).json({
        message: "Failed to retrieve adoption records",
      });
    }

    return res.status(200).json(results);
  });
};

const getAdoptionById = (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  const sql = `
    SELECT
      a.adoption_id,
      a.record_id,
      vr.person_id,
      CONCAT(
        child.first_name, ' ',
        COALESCE(child.middle_name, ''), ' ',
        child.last_name
      ) AS adopted_person_name,
      a.adoptive_father_id,
      CONCAT(
        father.first_name, ' ',
        COALESCE(father.middle_name, ''), ' ',
        father.last_name
      ) AS adoptive_father_name,
      a.adoptive_mother_id,
      CONCAT(
        mother.first_name, ' ',
        COALESCE(mother.middle_name, ''), ' ',
        mother.last_name
      ) AS adoptive_mother_name,
      a.adoption_date,
      a.court_reference,
      vr.location_id,
      vr.registration_date,
      vr.registered_by,
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
    FROM adoptions a
    INNER JOIN vital_records vr
      ON a.record_id = vr.record_id
    LEFT JOIN persons child
      ON vr.person_id = child.person_id
    LEFT JOIN persons father
      ON a.adoptive_father_id = father.person_id
    LEFT JOIN persons mother
      ON a.adoptive_mother_id = mother.person_id
    WHERE a.adoption_id = ?
      AND vr.record_type = 'Adoption'
    LIMIT 1
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      console.error("Get adoption by ID error:", error);

      return res.status(500).json({
        message: "Failed to retrieve adoption record",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Adoption record not found",
      });
    }

    return res.status(200).json(results[0]);
  });
};

const updateAdoption = (req, res) => {
  const { id } = req.params;

  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    adoptive_father_id,
    adoptive_mother_id,
    adoption_date,
    court_reference,
  } = req.body;

  // Validate adoption ID
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  // Required fields
  if (
    person_id === undefined ||
    person_id === null ||
    person_id === "" ||
    !registration_date ||
    !registered_by ||
    !adoption_date
  ) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, and adoption date are required",
    });
  }

  const isPositiveInteger = (value) =>
    Number.isInteger(Number(value)) && Number(value) > 0;

  if (!isPositiveInteger(person_id) || !isPositiveInteger(registered_by)) {
    return res.status(400).json({
      message: "Person ID and registered_by must be positive integers",
    });
  }

  for (const [field, value] of [
    ["location_id", location_id],
    ["adoptive_father_id", adoptive_father_id],
    ["adoptive_mother_id", adoptive_mother_id],
  ]) {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !isPositiveInteger(value)
    ) {
      return res.status(400).json({
        message: `${field} must be a positive integer or null`,
      });
    }
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

  if (!isValidDate(registration_date) || !isValidDate(adoption_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (adoption_date < registration_date) {
    return res.status(400).json({
      message: "Adoption date cannot be before registration date",
    });
  }

  const fatherId =
    adoptive_father_id === undefined ||
    adoptive_father_id === null ||
    adoptive_father_id === ""
      ? null
      : Number(adoptive_father_id);

  const motherId =
    adoptive_mother_id === undefined ||
    adoptive_mother_id === null ||
    adoptive_mother_id === ""
      ? null
      : Number(adoptive_mother_id);

  if (fatherId === null && motherId === null) {
    return res.status(400).json({
      message: "At least one adoptive parent is required",
    });
  }

  const locationId =
    location_id === undefined || location_id === null || location_id === ""
      ? null
      : Number(location_id);

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error(
        "Begin update adoption transaction error:",
        transactionError,
      );

      return res.status(500).json({
        message: "Failed to start adoption update",
      });
    }

    const checkSql = `
      SELECT a.adoption_id, a.record_id, vr.status
      FROM adoptions a
      INNER JOIN vital_records vr
        ON a.record_id = vr.record_id
      WHERE a.adoption_id = ?
        AND vr.record_type = 'Adoption'
      FOR UPDATE
    `;

    connection.query(checkSql, [Number(id)], (checkError, rows) => {
      if (checkError) {
        return connection.rollback(() => {
          console.error("Check adoption error:", checkError);

          return res.status(500).json({
            message: "Failed to check adoption record",
          });
        });
      }

      if (rows.length === 0) {
        return connection.rollback(() => {
          return res.status(404).json({
            message: "Adoption record not found",
          });
        });
      }

      if (rows[0].status === "Cancelled") {
        return connection.rollback(() => {
          return res.status(409).json({
            message: "Cancelled adoption records cannot be updated",
          });
        });
      }

      const recordId = rows[0].record_id;

      const updateRecordSql = `
        UPDATE vital_records
        SET person_id = ?,
            location_id = ?,
            registration_date = ?,
            registered_by = ?
        WHERE record_id = ?
          AND record_type = 'Adoption'
      `;

      connection.query(
        updateRecordSql,
        [
          Number(person_id),
          locationId,
          registration_date,
          Number(registered_by),
          recordId,
        ],
        (recordError) => {
          if (recordError) {
            return connection.rollback(() => {
              console.error("Update vital record error:", recordError);

              return res.status(400).json({
                message:
                  "Failed to update main record. Check person, location, and user IDs.",
              });
            });
          }

          const updateAdoptionSql = `
            UPDATE adoptions
            SET adoptive_father_id = ?,
                adoptive_mother_id = ?,
                adoption_date = ?,
                court_reference = ?
            WHERE adoption_id = ?
              AND record_id = ?
          `;

          connection.query(
            updateAdoptionSql,
            [
              fatherId,
              motherId,
              adoption_date,
              court_reference || null,
              Number(id),
              recordId,
            ],
            (adoptionError) => {
              if (adoptionError) {
                return connection.rollback(() => {
                  console.error(
                    "Update adoption details error:",
                    adoptionError,
                  );

                  return res.status(400).json({
                    message:
                      "Failed to update adoption details. Check adoptive parent IDs.",
                  });
                });
              }

              connection.commit((commitError) => {
                if (commitError) {
                  return connection.rollback(() => {
                    console.error("Commit adoption update error:", commitError);

                    return res.status(500).json({
                      message: "Failed to save adoption changes",
                    });
                  });
                }

                return res.status(200).json({
                  message: "Adoption record updated successfully",
                  adoption_id: Number(id),
                });
              });
            },
          );
        },
      );
    });
  });
};

const approveAdoption = (req, res) => {
  const { id } = req.params;

  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN adoptions a
      ON a.record_id = vr.record_id
    SET vr.status = 'Active'
    WHERE a.adoption_id = ?
      AND vr.record_type = 'Adoption'
      AND vr.status = 'Pending'
  `;

  connection.query(sql, [Number(id)], (error, result) => {
    if (error) {
      console.error("Approve adoption error:", error);

      return res.status(500).json({
        message: "Failed to approve adoption record",
      });
    }

    if (result.affectedRows === 0) {
      const checkSql = `
        SELECT vr.status
        FROM adoptions a
        INNER JOIN vital_records vr
          ON a.record_id = vr.record_id
        WHERE a.adoption_id = ?
          AND vr.record_type = 'Adoption'
      `;

      return connection.query(checkSql, [Number(id)], (checkError, rows) => {
        if (checkError) {
          return res.status(500).json({
            message: "Failed to check adoption record",
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Adoption record not found",
          });
        }

        return res.status(409).json({
          message: `Cannot approve adoption record with status '${rows[0].status}'`,
        });
      });
    }

    return res.status(200).json({
      message: "Adoption record approved successfully",
      adoption_id: Number(id),
      status: "Active",
    });
  });
};

const cancelAdoption = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  if (typeof cancel_reason !== "string" || cancel_reason.trim() === "") {
    return res.status(400).json({
      message: "Cancellation reason is required",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN adoptions a
      ON a.record_id = vr.record_id
    SET vr.status = 'Cancelled',
        vr.cancel_reason = ?
    WHERE a.adoption_id = ?
      AND vr.record_type = 'Adoption'
      AND vr.status IN ('Pending', 'Active')
  `;

  connection.query(sql, [cancel_reason.trim(), Number(id)], (error, result) => {
    if (error) {
      console.error("Cancel adoption error:", error);

      return res.status(500).json({
        message: "Failed to cancel adoption record",
      });
    }

    if (result.affectedRows === 0) {
      const checkSql = `
          SELECT vr.status
          FROM adoptions a
          INNER JOIN vital_records vr
            ON a.record_id = vr.record_id
          WHERE a.adoption_id = ?
            AND vr.record_type = 'Adoption'
        `;

      return connection.query(checkSql, [Number(id)], (checkError, rows) => {
        if (checkError) {
          return res.status(500).json({
            message: "Failed to check adoption record",
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Adoption record not found",
          });
        }

        return res.status(409).json({
          message: `Cannot cancel adoption record with status '${rows[0].status}'`,
        });
      });
    }

    return res.status(200).json({
      message: "Adoption record cancelled successfully",
      adoption_id: Number(id),
      status: "Cancelled",
      cancel_reason: cancel_reason.trim(),
    });
  });
};

module.exports = {
  createAdoption,
  getAdoptions,
  getAdoptionById,
  updateAdoption,
  approveAdoption,
  cancelAdoption,
};
