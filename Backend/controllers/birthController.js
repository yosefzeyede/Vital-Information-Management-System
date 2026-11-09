const connection = require("../config/db");
const { 
  isPositiveInteger, 
  isValidDate, 
  isEmptyId, 
  normalizeOptionalId, 
  validateOptionalId,
  isValidCause,
  isValidReason
} = require("../utils/validators");
const { 
  handleDatabaseError, 
  rollbackResponseAsync 
} = require("../utils/dbErrors");

// ==================== CREATE BIRTH ====================

const createBirth = async (req, res) => {
  const {
    person_id,
    location_id,
    registration_date,
    father_id,
    mother_id,
  } = req.body;

  // Get the logged-in user's ID from JWT middleware
  const registered_by = req.user?.user_id;

  // 1. Required fields validation
  if (isEmptyId(person_id) || !registration_date || isEmptyId(registered_by)) {
    return res.status(400).json({
      message: "person_id and registration_date are required, and user must be authenticated",
    });
  }

  // 2. Positive integer validation
  if (!isPositiveInteger(person_id)) {
    return res.status(400).json({
      message: "person_id must be a positive integer",
    });
  }

  // 3. Optional IDs validation
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

  // 4. Date validation
  if (!isValidDate(registration_date)) {
    return res.status(400).json({
      message: "registration_date must be a valid date in YYYY-MM-DD format",
    });
  }

  // 5. Normalize IDs
  const personId = Number(person_id);
  const registeredBy = Number(registered_by);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(father_id);
  const motherId = normalizeOptionalId(mother_id);

  // 6. Relationship validation
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

  // 7. Get a dedicated database connection
  let conn;
  let transactionStarted = false;

  try {
    const promisePool = connection.promise();

    conn = await promisePool.getConnection();

    // 8. Start transaction
    await conn.beginTransaction();
    transactionStarted = true;

    // 9. Check child exists
    const [childRows] = await conn.query(
      "SELECT person_id FROM persons WHERE person_id = ?",
      [personId],
    );

    if (childRows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Person does not exist",
      });
    }

    // 10. Check father exists
    if (fatherId !== null) {
      const [fatherRows] = await conn.query(
        "SELECT person_id FROM persons WHERE person_id = ?",
        [fatherId],
      );

      if (fatherRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Father does not exist",
        });
      }
    }

    // 11. Check mother exists
    if (motherId !== null) {
      const [motherRows] = await conn.query(
        "SELECT person_id FROM persons WHERE person_id = ?",
        [motherId],
      );

      if (motherRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Mother does not exist",
        });
      }
    }

    // 12. Check registering user exists (should always exist since they're authenticated)
    const [userRows] = await conn.query(
      "SELECT user_id FROM users WHERE user_id = ? AND is_active = 1",
      [registeredBy],
    );

    if (userRows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(401).json({
        message: "Authenticated user account not found or inactive",
      });
    }

    // 13. Check location exists (if provided)
    if (locationId !== null) {
      const [locationRows] = await conn.query(
        "SELECT location_id FROM locations WHERE location_id = ?",
        [locationId],
      );

      if (locationRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Location does not exist",
        });
      }
    }

    // 14. Insert into vital_records
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

    const [recordResult] = await conn.query(vitalRecordSql, [
      personId,
      locationId,
      registration_date,
      registeredBy,
    ]);

    const recordId = recordResult.insertId;

    // 15. Insert into births
    const birthSql = `
      INSERT INTO births (
        record_id,
        father_id,
        mother_id
      )
      VALUES (?, ?, ?)
    `;

    const [birthResult] = await conn.query(birthSql, [
      recordId,
      fatherId,
      motherId,
    ]);

    // 16. Commit transaction
    await conn.commit();
    transactionStarted = false;

    return res.status(201).json({
      message: "Birth record created successfully",
      record_id: recordId,
      birth_id: birthResult.insertId,
      status: "Pending",
    });
  } catch (error) {
    // 17. Rollback if an error occurs
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Birth rollback error:", rollbackError);
      }
    }

    console.error("Create birth error:", error);

    // Use the database error handler utility
    return handleDatabaseError(error, res, "Create birth");
  } finally {
    // 18. Release connection back to pool
    if (conn) {
      conn.release();
    }
  }
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

const updateBirth = async (req, res) => {
  const { id } = req.params;

  const {
    person_id,
    location_id,
    registration_date,
    father_id,
    mother_id,
    status,
  } = req.body;

  // Get the logged-in user's ID from JWT
  const registeredBy = req.user?.user_id;

  // 1. Validate authenticated user
  if (!registeredBy) {
    return res.status(401).json({
      message: "Unauthorized. Please login first.",
    });
  }

  // 2. Validate birth ID
  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Invalid birth ID",
    });
  }

  // 3. Validate required fields
  if (isEmptyId(person_id) || !registration_date || !status) {
    return res.status(400).json({
      message: "person_id, registration_date, and status are required",
    });
  }

  // 4. Validate positive integer person ID
  if (!isPositiveInteger(person_id)) {
    return res.status(400).json({
      message: "person_id must be a positive integer",
    });
  }

  // 5. Validate optional IDs
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

  // 6. Validate registration date
  if (!isValidDate(registration_date)) {
    return res.status(400).json({
      message: "registration_date must be a valid date in YYYY-MM-DD format",
    });
  }

  // 7. Validate status
  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "status must be Pending, Active, or Cancelled",
    });
  }

  // 8. Normalize IDs
  const personId = Number(person_id);
  const locationId = normalizeOptionalId(location_id);
  const fatherId = normalizeOptionalId(father_id);
  const motherId = normalizeOptionalId(mother_id);

  // 9. Validate family relationships
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

  let conn;
  let transactionStarted = false;

  try {
    // 10. Get dedicated database connection
    conn = await connection.promise().getConnection();

    // 11. Start transaction
    await conn.beginTransaction();
    transactionStarted = true;

    // 12. Find birth record and lock it
    const findSql = `
      SELECT b.record_id, vr.status AS current_status
      FROM births b
      INNER JOIN vital_records vr
        ON b.record_id = vr.record_id
      WHERE b.birth_id = ?
        AND vr.record_type = 'Birth'
      FOR UPDATE
    `;

    const [rows] = await conn.query(findSql, [Number(id)]);

    if (rows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Birth record not found",
      });
    }

    if (rows[0].current_status === "Cancelled") {
      await conn.rollback();
      transactionStarted = false;

      return res.status(409).json({
        message: "Cancelled birth records cannot be updated",
      });
    }

    // Cancellation must use the dedicated cancellation endpoint
    if (status === "Cancelled") {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Use the cancellation endpoint to cancel a birth record",
      });
    }

    const recordId = rows[0].record_id;

    // 13. Check child exists
    const [childRows] = await conn.query(
      "SELECT person_id FROM persons WHERE person_id = ?",
      [personId],
    );

    if (childRows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Person does not exist",
      });
    }

    // 14. Check father exists
    if (fatherId !== null) {
      const [fatherRows] = await conn.query(
        "SELECT person_id FROM persons WHERE person_id = ?",
        [fatherId],
      );

      if (fatherRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Father does not exist",
        });
      }
    }

    // 15. Check mother exists
    if (motherId !== null) {
      const [motherRows] = await conn.query(
        "SELECT person_id FROM persons WHERE person_id = ?",
        [motherId],
      );

      if (motherRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Mother does not exist",
        });
      }
    }

    // 16. Check authenticated user exists and is active
    const [userRows] = await conn.query(
      "SELECT user_id FROM users WHERE user_id = ? AND is_active = 1",
      [registeredBy],
    );

    if (userRows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(401).json({
        message: "Authenticated user not found or inactive",
      });
    }

    // 17. Check location exists
    if (locationId !== null) {
      const [locationRows] = await conn.query(
        "SELECT location_id FROM locations WHERE location_id = ?",
        [locationId],
      );

      if (locationRows.length === 0) {
        await conn.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "Location does not exist",
        });
      }
    }

    // 18. Update vital_records
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

    await conn.query(updateRecordSql, [
      personId,
      locationId,
      registration_date,
      registeredBy,
      status,
      recordId,
    ]);

    // 19. Update births
    const updateBirthSql = `
      UPDATE births
      SET father_id = ?,
          mother_id = ?
      WHERE birth_id = ?
        AND record_id = ?
    `;

    await conn.query(updateBirthSql, [
      fatherId,
      motherId,
      Number(id),
      recordId,
    ]);

    // 20. Commit transaction
    await conn.commit();
    transactionStarted = false;

    return res.status(200).json({
      message: "Birth record updated successfully",
      birth_id: Number(id),
      record_id: recordId,
      status,
    });
  } catch (error) {
    // 21. Rollback if an error occurs
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Birth update rollback error:", rollbackError);
      }
    }

    console.error("Update birth error:", error);

    return handleDatabaseError(error, res, "Update birth record error:");
  } finally {
    // 22. Release connection
    if (conn) {
      conn.release();
    }
  }
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
