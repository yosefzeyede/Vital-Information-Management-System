const connection = require("../config/db");

// ==================== VALIDATION HELPERS ====================

const isPositiveInteger = (value) => {
  if (
    value === undefined ||
    value === null ||
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

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const isOptionalIdEmpty = (value) =>
  value === undefined || value === null || value === "";

const normalizeOptionalId = (value) =>
  isOptionalIdEmpty(value) ? null : Number(value);

const validateOptionalId = (field, value) => {
  if (!isOptionalIdEmpty(value) && !isPositiveInteger(value)) {
    return `${field} must be a positive integer or null`;
  }

  return null;
};

const validateOptionalText = (field, value, maxLength) => {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return `${field} must be a string or null`;
  }

  if (typeof value === "string" && value.trim().length > maxLength) {
    return `${field} cannot exceed ${maxLength} characters`;
  }

  return null;
};

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const handleDatabaseError = (error, res, message) => {
  console.error(message, error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "This adoption record already exists",
    });
  }

  if (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.code === "ER_ROW_IS_REFERENCED_2"
  ) {
    return res.status(400).json({
      message:
        "One or more referenced records do not exist or cannot be changed",
    });
  }

  return res.status(500).json({
    message: "A database error occurred while processing the adoption record",
  });
};

// Checks that a person exists.
// Used inside the transaction so related changes can be rolled back together.
const checkPersonExists = (personId, callback) => {
  connection.query(
    "SELECT person_id FROM persons WHERE person_id = ? LIMIT 1",
    [personId],
    (error, rows) => {
      if (error) return callback(error);
      callback(null, rows.length > 0);
    },
  );
};

const checkUserExists = (userId, callback) => {
  connection.query(
    "SELECT user_id FROM users WHERE user_id = ? LIMIT 1",
    [userId],
    (error, rows) => {
      if (error) return callback(error);
      callback(null, rows.length > 0);
    },
  );
};

const checkLocationExists = (locationId, callback) => {
  if (locationId === null) return callback(null, true);

  connection.query(
    "SELECT location_id FROM locations WHERE location_id = ? LIMIT 1",
    [locationId],
    (error, rows) => {
      if (error) return callback(error);
      callback(null, rows.length > 0);
    },
  );
};

const rollbackResponse = (res, statusCode, message) => {
  connection.rollback((rollbackError) => {
    if (rollbackError) {
      console.error("Adoption transaction rollback error:", rollbackError);
    }

    return res.status(statusCode).json({ message });
  });
};

// ==================== CREATE ADOPTION ====================

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
    isOptionalIdEmpty(person_id) ||
    isOptionalIdEmpty(registered_by) ||
    !registration_date ||
    !adoption_date
  ) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, and adoption date are required",
    });
  }

  // Validate required IDs
  if (!isPositiveInteger(person_id) || !isPositiveInteger(registered_by)) {
    return res.status(400).json({
      message: "Person ID and registered_by must be positive integers",
    });
  }

  // Validate optional IDs
  for (const [field, value] of [
    ["location_id", location_id],
    ["adoptive_father_id", adoptive_father_id],
    ["adoptive_mother_id", adoptive_mother_id],
  ]) {
    const error = validateOptionalId(field, value);

    if (error) {
      return res.status(400).json({ message: error });
    }
  }

  // At least one adoptive parent must be supplied
  if (
    isOptionalIdEmpty(adoptive_father_id) &&
    isOptionalIdEmpty(adoptive_mother_id)
  ) {
    return res.status(400).json({
      message: "At least one adoptive parent is required",
    });
  }

  const personId = Number(person_id);
  const registeredBy = Number(registered_by);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(adoptive_father_id);
  const motherId = normalizeOptionalId(adoptive_mother_id);

  // An adopted person cannot be their own adoptive parent
  if (fatherId === personId || motherId === personId) {
    return res.status(400).json({
      message: "The adopted person cannot be their own adoptive parent",
    });
  }

  // The same person cannot be both adoptive parents
  if (fatherId !== null && fatherId === motherId) {
    return res.status(400).json({
      message: "Adoptive father and mother must be different people",
    });
  }

  // Validate dates
  if (!isValidDate(registration_date) || !isValidDate(adoption_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  // Assumption: the adoption legally occurs on or before its registration.
  if (adoption_date > registration_date) {
    return res.status(400).json({
      message: "Adoption date cannot be after registration date",
    });
  }

  const courtReferenceError = validateOptionalText(
    "court_reference",
    court_reference,
    100,
  );

  if (courtReferenceError) {
    return res.status(400).json({
      message: courtReferenceError,
    });
  }

  const courtReference = normalizeOptionalText(court_reference);

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Begin adoption transaction error:", transactionError);

      return res.status(500).json({
        message: "Failed to start adoption transaction",
      });
    }

    // Validate the adopted person
    checkPersonExists(personId, (personError, personExists) => {
      if (personError) {
        return rollbackResponse(res, 500, "Failed to validate adopted person");
      }

      if (!personExists) {
        return rollbackResponse(res, 400, "Adopted person does not exist");
      }

      // Validate adoptive father, if supplied
      const checkFather = (callback) => {
        if (fatherId === null) return callback(null, true);
        checkPersonExists(fatherId, (error, exists) => callback(error, exists));
      };

      checkFather((fatherError, fatherExists) => {
        if (fatherError) {
          return rollbackResponse(
            res,
            500,
            "Failed to validate adoptive father",
          );
        }

        if (!fatherExists) {
          return rollbackResponse(res, 400, "Adoptive father does not exist");
        }

        // Validate adoptive mother, if supplied
        const checkMother = (callback) => {
          if (motherId === null) return callback(null, true);
          checkPersonExists(motherId, (error, exists) =>
            callback(error, exists),
          );
        };

        checkMother((motherError, motherExists) => {
          if (motherError) {
            return rollbackResponse(
              res,
              500,
              "Failed to validate adoptive mother",
            );
          }

          if (!motherExists) {
            return rollbackResponse(res, 400, "Adoptive mother does not exist");
          }

          checkUserExists(registeredBy, (userError, userExists) => {
            if (userError) {
              return rollbackResponse(
                res,
                500,
                "Failed to validate registering user",
              );
            }

            if (!userExists) {
              return rollbackResponse(
                res,
                400,
                "Registering user does not exist",
              );
            }

            checkLocationExists(locationId, (locationError, locationExists) => {
              if (locationError) {
                return rollbackResponse(
                  res,
                  500,
                  "Failed to validate location",
                );
              }

              if (!locationExists) {
                return rollbackResponse(res, 400, "Location does not exist");
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
                [personId, locationId, registration_date, registeredBy],
                (recordError, recordResult) => {
                  if (recordError) {
                    return connection.rollback(() => {
                      handleDatabaseError(
                        recordError,
                        res,
                        "Create adoption vital record error:",
                      );
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
                      courtReference,
                    ],
                    (adoptionError, adoptionResult) => {
                      if (adoptionError) {
                        return connection.rollback(() => {
                          handleDatabaseError(
                            adoptionError,
                            res,
                            "Insert adoption details error:",
                          );
                        });
                      }

                      connection.commit((commitError) => {
                        if (commitError) {
                          return connection.rollback(() => {
                            console.error(
                              "Commit adoption transaction error:",
                              commitError,
                            );

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
          });
        });
      });
    });
  });
};

// ==================== GET ALL ADOPTIONS ====================

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

    return res.status(200).json({
      count: results.length,
      adoptions: results,
    });
  });
};

// ==================== GET ADOPTION BY ID ====================

const getAdoptionById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
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

// ==================== UPDATE ADOPTION ====================

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

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  if (
    isOptionalIdEmpty(person_id) ||
    isOptionalIdEmpty(registered_by) ||
    !registration_date ||
    !adoption_date
  ) {
    return res.status(400).json({
      message:
        "Person ID, registration date, registered by, and adoption date are required",
    });
  }

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
    const error = validateOptionalId(field, value);

    if (error) {
      return res.status(400).json({ message: error });
    }
  }

  if (
    isOptionalIdEmpty(adoptive_father_id) &&
    isOptionalIdEmpty(adoptive_mother_id)
  ) {
    return res.status(400).json({
      message: "At least one adoptive parent is required",
    });
  }

  if (!isValidDate(registration_date) || !isValidDate(adoption_date)) {
    return res.status(400).json({
      message: "Dates must be valid and use YYYY-MM-DD format",
    });
  }

  if (adoption_date > registration_date) {
    return res.status(400).json({
      message: "Adoption date cannot be after registration date",
    });
  }

  const courtReferenceError = validateOptionalText(
    "court_reference",
    court_reference,
    100,
  );

  if (courtReferenceError) {
    return res.status(400).json({
      message: courtReferenceError,
    });
  }

  const personId = Number(person_id);
  const registeredBy = Number(registered_by);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(adoptive_father_id);
  const motherId = normalizeOptionalId(adoptive_mother_id);
  const courtReference = normalizeOptionalText(court_reference);

  if (fatherId === personId || motherId === personId) {
    return res.status(400).json({
      message: "The adopted person cannot be their own adoptive parent",
    });
  }

  if (fatherId !== null && fatherId === motherId) {
    return res.status(400).json({
      message: "Adoptive father and mother must be different people",
    });
  }

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
      SELECT a.adoption_id, a.record_id, vr.status, a.adoption_date
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
        return rollbackResponse(res, 404, "Adoption record not found");
      }

      if (rows[0].status === "Cancelled") {
        return rollbackResponse(
          res,
          409,
          "Cancelled adoption records cannot be updated",
        );
      }

      const recordId = rows[0].record_id;

      checkPersonExists(personId, (personError, personExists) => {
        if (personError) {
          return rollbackResponse(
            res,
            500,
            "Failed to validate adopted person",
          );
        }

        if (!personExists) {
          return rollbackResponse(res, 400, "Adopted person does not exist");
        }

        const checkFather = (callback) => {
          if (fatherId === null) return callback(null, true);
          checkPersonExists(fatherId, callback);
        };

        checkFather((fatherError, fatherExists) => {
          if (fatherError) {
            return rollbackResponse(
              res,
              500,
              "Failed to validate adoptive father",
            );
          }

          if (!fatherExists) {
            return rollbackResponse(res, 400, "Adoptive father does not exist");
          }

          const checkMother = (callback) => {
            if (motherId === null) return callback(null, true);
            checkPersonExists(motherId, callback);
          };

          checkMother((motherError, motherExists) => {
            if (motherError) {
              return rollbackResponse(
                res,
                500,
                "Failed to validate adoptive mother",
              );
            }

            if (!motherExists) {
              return rollbackResponse(
                res,
                400,
                "Adoptive mother does not exist",
              );
            }

            checkUserExists(registeredBy, (userError, userExists) => {
              if (userError) {
                return rollbackResponse(
                  res,
                  500,
                  "Failed to validate registering user",
                );
              }

              if (!userExists) {
                return rollbackResponse(
                  res,
                  400,
                  "Registering user does not exist",
                );
              }

              checkLocationExists(
                locationId,
                (locationError, locationExists) => {
                  if (locationError) {
                    return rollbackResponse(
                      res,
                      500,
                      "Failed to validate location",
                    );
                  }

                  if (!locationExists) {
                    return rollbackResponse(
                      res,
                      400,
                      "Location does not exist",
                    );
                  }

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
                      personId,
                      locationId,
                      registration_date,
                      registeredBy,
                      recordId,
                    ],
                    (recordError) => {
                      if (recordError) {
                        return connection.rollback(() => {
                          handleDatabaseError(
                            recordError,
                            res,
                            "Update adoption vital record error:",
                          );
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
                          courtReference,
                          Number(id),
                          recordId,
                        ],
                        (adoptionError) => {
                          if (adoptionError) {
                            return connection.rollback(() => {
                              handleDatabaseError(
                                adoptionError,
                                res,
                                "Update adoption details error:",
                              );
                            });
                          }

                          connection.commit((commitError) => {
                            if (commitError) {
                              return connection.rollback(() => {
                                console.error(
                                  "Commit adoption update error:",
                                  commitError,
                                );

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
                },
              );
            });
          });
        });
      });
    });
  });
};

// ==================== APPROVE ADOPTION ====================

const approveAdoption = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid adoption ID",
    });
  }

  const sql = `
    UPDATE vital_records vr
    INNER JOIN adoptions a
      ON a.record_id = vr.record_id
    SET vr.status = 'Active',
        vr.cancel_reason = NULL
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
          console.error("Check adoption status error:", checkError);

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

// ==================== CANCEL ADOPTION ====================

const cancelAdoption = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid adoption ID",
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

  const reason = cancel_reason.trim();

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

  connection.query(sql, [reason, Number(id)], (error, result) => {
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
          console.error("Check adoption status error:", checkError);

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
      cancel_reason: reason,
    });
  });
};

// ==================== EXPORTS ====================

module.exports = {
  createAdoption,
  getAdoptions,
  getAdoptionById,
  updateAdoption,
  approveAdoption,
  cancelAdoption,
};
