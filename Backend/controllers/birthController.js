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

const isEmptyId = (value) =>
  value === undefined || value === null || value === "";

const normalizeOptionalId = (value) =>
  isEmptyId(value) ? null : Number(value);

const validateOptionalId = (field, value) => {
  if (!isEmptyId(value) && !isPositiveInteger(value)) {
    return `${field} must be a positive integer or null`;
  }

  return null;
};

const handleDatabaseError = (error, res, message) => {
  console.error(message, error);

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      message: "One or more referenced IDs do not exist",
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "This birth record conflicts with an existing record",
    });
  }

  return res.status(500).json({
    message: "A database error occurred while processing the birth record",
  });
};

const rollbackResponse = (res, statusCode, message) => {
  connection.rollback((error) => {
    if (error) {
      console.error("Birth transaction rollback error:", error);
    }

    return res.status(statusCode).json({ message });
  });
};

// Checks that a referenced person exists.
const checkPersonExists = (personId, callback) => {
  connection.query(
    "SELECT person_id FROM persons WHERE person_id = ? LIMIT 1",
    [personId],
    (error, rows) => {
      if (error) return callback(error, false);
      return callback(null, rows.length > 0);
    },
  );
};

const checkUserExists = (userId, callback) => {
  connection.query(
    "SELECT user_id FROM users WHERE user_id = ? LIMIT 1",
    [userId],
    (error, rows) => {
      if (error) return callback(error, false);
      return callback(null, rows.length > 0);
    },
  );
};

const checkLocationExists = (locationId, callback) => {
  if (locationId === null) return callback(null, true);

  connection.query(
    "SELECT location_id FROM locations WHERE location_id = ? LIMIT 1",
    [locationId],
    (error, rows) => {
      if (error) return callback(error, false);
      return callback(null, rows.length > 0);
    },
  );
};

// ==================== CREATE BIRTH ====================

const createBirth = (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    registered_by,
    father_id,
    mother_id,
  } = req.body;

  if (isEmptyId(person_id) || !registration_date || isEmptyId(registered_by)) {
    return res.status(400).json({
      message: "person_id, registration_date, and registered_by are required",
    });
  }

  if (!isPositiveInteger(person_id) || !isPositiveInteger(registered_by)) {
    return res.status(400).json({
      message: "person_id and registered_by must be positive integers",
    });
  }

  for (const [field, value] of [
    ["location_id", location_id],
    ["father_id", father_id],
    ["mother_id", mother_id],
  ]) {
    const validationError = validateOptionalId(field, value);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }
  }

  if (!isValidDate(registration_date)) {
    return res.status(400).json({
      message: "registration_date must be a valid date in YYYY-MM-DD format",
    });
  }

  const personId = Number(person_id);
  const registeredBy = Number(registered_by);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(father_id);
  const motherId = normalizeOptionalId(mother_id);

  if (fatherId !== null && fatherId === motherId) {
    return res.status(400).json({
      message: "Father and mother must be different persons",
    });
  }

  if (fatherId === personId || motherId === personId) {
    return res.status(400).json({
      message: "A child cannot be their own father or mother",
    });
  }

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Begin birth transaction error:", transactionError);

      return res.status(500).json({
        message: "Failed to start database transaction",
      });
    }

    checkPersonExists(personId, (personError, personExists) => {
      if (personError) {
        return rollbackResponse(res, 500, "Failed to validate child");
      }

      if (!personExists) {
        return rollbackResponse(res, 400, "Person does not exist");
      }

      const checkFather = (callback) => {
        if (fatherId === null) return callback(null, true);
        checkPersonExists(fatherId, callback);
      };

      checkFather((fatherError, fatherExists) => {
        if (fatherError) {
          return rollbackResponse(res, 500, "Failed to validate father");
        }

        if (!fatherExists) {
          return rollbackResponse(res, 400, "Father does not exist");
        }

        const checkMother = (callback) => {
          if (motherId === null) return callback(null, true);
          checkPersonExists(motherId, callback);
        };

        checkMother((motherError, motherExists) => {
          if (motherError) {
            return rollbackResponse(res, 500, "Failed to validate mother");
          }

          if (!motherExists) {
            return rollbackResponse(res, 400, "Mother does not exist");
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

              connection.query(
                vitalRecordSql,
                [personId, locationId, registration_date, registeredBy],
                (recordError, recordResult) => {
                  if (recordError) {
                    return connection.rollback(() => {
                      handleDatabaseError(
                        recordError,
                        res,
                        "Create birth vital record error:",
                      );
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

                  connection.query(
                    birthSql,
                    [recordId, fatherId, motherId],
                    (birthError, birthResult) => {
                      if (birthError) {
                        return connection.rollback(() => {
                          handleDatabaseError(
                            birthError,
                            res,
                            "Create birth details error:",
                          );
                        });
                      }

                      connection.commit((commitError) => {
                        if (commitError) {
                          return connection.rollback(() => {
                            console.error(
                              "Commit birth transaction error:",
                              commitError,
                            );

                            return res.status(500).json({
                              message: "Failed to save birth record",
                            });
                          });
                        }

                        return res.status(201).json({
                          message: "Birth record created successfully",
                          record_id: recordId,
                          birth_id: birthResult.insertId,
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

// ==================== GET ALL BIRTHS ====================

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
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
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

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Get births error:", error);

      return res.status(500).json({
        message: "Failed to retrieve birth records",
      });
    }

    return res.status(200).json({
      count: results.length,
      births: results,
    });
  });
};

// ==================== GET BIRTH BY ID ====================

const getBirthById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
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
      vr.status,
      vr.cancel_reason,
      vr.created_at,
      vr.updated_at
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
    LIMIT 1
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      console.error("Get birth by ID error:", error);

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

// ==================== UPDATE BIRTH ====================

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

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid birth ID",
    });
  }

  if (
    isEmptyId(person_id) ||
    !registration_date ||
    isEmptyId(registered_by) ||
    !status
  ) {
    return res.status(400).json({
      message:
        "person_id, registration_date, registered_by, and status are required",
    });
  }

  if (!isPositiveInteger(person_id) || !isPositiveInteger(registered_by)) {
    return res.status(400).json({
      message: "person_id and registered_by must be positive integers",
    });
  }

  for (const [field, value] of [
    ["location_id", location_id],
    ["father_id", father_id],
    ["mother_id", mother_id],
  ]) {
    const validationError = validateOptionalId(field, value);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }
  }

  if (!isValidDate(registration_date)) {
    return res.status(400).json({
      message: "registration_date must be a valid date in YYYY-MM-DD format",
    });
  }

  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "status must be Pending, Active, or Cancelled",
    });
  }

  const personId = Number(person_id);
  const registeredBy = Number(registered_by);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(father_id);
  const motherId = normalizeOptionalId(mother_id);

  if (fatherId !== null && fatherId === motherId) {
    return res.status(400).json({
      message: "Father and mother must be different persons",
    });
  }

  if (fatherId === personId || motherId === personId) {
    return res.status(400).json({
      message: "A child cannot be their own father or mother",
    });
  }

  connection.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Begin update birth transaction error:", transactionError);

      return res.status(500).json({
        message: "Failed to start transaction",
      });
    }

    const findSql = `
      SELECT b.record_id, vr.status AS current_status
      FROM births b
      INNER JOIN vital_records vr
        ON b.record_id = vr.record_id
      WHERE b.birth_id = ?
        AND vr.record_type = 'Birth'
      FOR UPDATE
    `;

    connection.query(findSql, [Number(id)], (findError, rows) => {
      if (findError) {
        return connection.rollback(() => {
          console.error("Find birth record error:", findError);

          return res.status(500).json({
            message: "Failed to find birth record",
          });
        });
      }

      if (rows.length === 0) {
        return rollbackResponse(res, 404, "Birth record not found");
      }

      if (rows[0].current_status === "Cancelled") {
        return rollbackResponse(
          res,
          409,
          "Cancelled birth records cannot be updated",
        );
      }

      // Do not use update to cancel an existing record.
      // The dedicated cancelBirth endpoint records the cancellation reason.
      if (status === "Cancelled") {
        return rollbackResponse(
          res,
          400,
          "Use the cancellation endpoint to cancel a birth record",
        );
      }

      const recordId = rows[0].record_id;

      checkPersonExists(personId, (personError, personExists) => {
        if (personError) {
          return rollbackResponse(res, 500, "Failed to validate child");
        }

        if (!personExists) {
          return rollbackResponse(res, 400, "Person does not exist");
        }

        const checkFather = (callback) => {
          if (fatherId === null) return callback(null, true);
          checkPersonExists(fatherId, callback);
        };

        checkFather((fatherError, fatherExists) => {
          if (fatherError) {
            return rollbackResponse(res, 500, "Failed to validate father");
          }

          if (!fatherExists) {
            return rollbackResponse(res, 400, "Father does not exist");
          }

          const checkMother = (callback) => {
            if (motherId === null) return callback(null, true);
            checkPersonExists(motherId, callback);
          };

          checkMother((motherError, motherExists) => {
            if (motherError) {
              return rollbackResponse(res, 500, "Failed to validate mother");
            }

            if (!motherExists) {
              return rollbackResponse(res, 400, "Mother does not exist");
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
                      registered_by = ?,
                      status = ?
                  WHERE record_id = ?
                    AND record_type = 'Birth'
                `;

                  connection.query(
                    updateRecordSql,
                    [
                      personId,
                      locationId,
                      registration_date,
                      registeredBy,
                      status,
                      recordId,
                    ],
                    (recordError) => {
                      if (recordError) {
                        return connection.rollback(() => {
                          handleDatabaseError(
                            recordError,
                            res,
                            "Update birth vital record error:",
                          );
                        });
                      }

                      const updateBirthSql = `
                      UPDATE births
                      SET father_id = ?,
                          mother_id = ?
                      WHERE birth_id = ?
                        AND record_id = ?
                    `;

                      connection.query(
                        updateBirthSql,
                        [fatherId, motherId, Number(id), recordId],
                        (birthError) => {
                          if (birthError) {
                            return connection.rollback(() => {
                              handleDatabaseError(
                                birthError,
                                res,
                                "Update birth details error:",
                              );
                            });
                          }

                          connection.commit((commitError) => {
                            if (commitError) {
                              return connection.rollback(() => {
                                console.error(
                                  "Commit birth update error:",
                                  commitError,
                                );

                                return res.status(500).json({
                                  message:
                                    "Failed to save updated birth record",
                                });
                              });
                            }

                            return res.status(200).json({
                              message: "Birth record updated successfully",
                              birth_id: Number(id),
                              record_id: recordId,
                              status,
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

// ==================== CANCEL BIRTH ====================

const cancelBirth = (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid birth ID",
    });
  }

  if (typeof cancel_reason !== "string" || cancel_reason.trim() === "") {
    return res.status(400).json({
      message: "Cancellation reason is required",
    });
  }

  const reason = cancel_reason.trim();

  if (reason.length > 500) {
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
      AND vr.status IN ('Pending', 'Active')
  `;

  connection.query(sql, [reason, Number(id)], (error, result) => {
    if (error) {
      console.error("Cancel birth error:", error);

      return res.status(500).json({
        message: "Failed to cancel birth record",
      });
    }

    if (result.affectedRows === 0) {
      const checkSql = `
        SELECT vr.status
        FROM births b
        INNER JOIN vital_records vr
          ON b.record_id = vr.record_id
        WHERE b.birth_id = ?
          AND vr.record_type = 'Birth'
      `;

      return connection.query(checkSql, [Number(id)], (checkError, rows) => {
        if (checkError) {
          console.error("Check birth status error:", checkError);

          return res.status(500).json({
            message: "Failed to check birth record",
          });
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Birth record not found",
          });
        }

        return res.status(409).json({
          message: `Cannot cancel birth record with status '${rows[0].status}'`,
        });
      });
    }

    return res.status(200).json({
      message: "Birth record cancelled successfully",
      birth_id: Number(id),
      status: "Cancelled",
      cancel_reason: reason,
    });
  });
};

// ==================== EXPORTS ====================

module.exports = {
  createBirth,
  getBirths,
  getBirthById,
  updateBirth,
  cancelBirth,
};
