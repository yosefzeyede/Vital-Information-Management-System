const connection = require("../config/db");

const createVitalRecord = (req, res) => {
  const {
    person_id,
    location_id,
    record_type,
    registration_date,
    cancel_reason,
    registered_by,
    status,
  } = req.body;

  // Validate required fields
  if (!record_type || !registration_date || !registered_by) {
    return res.status(400).json({
      message: "Record type, registration date, and registered_by are required",
    });
  }

  const allowedTypes = ["Birth", "Death", "Marriage", "Divorce", "Adoption"];

  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedTypes.includes(record_type)) {
    return res.status(400).json({
      message: "Invalid record type",
    });
  }

  const recordStatus = status || "Pending";

  if (!allowedStatuses.includes(recordStatus)) {
    return res.status(400).json({
      message: "Invalid status",
    });
  }

  // Marriage and Divorce can have a NULL person_id
  if (
    !["Marriage", "Divorce"].includes(record_type) &&
    (person_id === undefined || person_id === null)
  ) {
    return res.status(400).json({
      message: "person_id is required for this record type",
    });
  }

  const sql = `
        INSERT INTO vital_records (
            person_id,
            location_id,
            record_type,
            registration_date,
            cancel_reason,
            registered_by,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  const values = [
    person_id ?? null,
    location_id ?? null,
    record_type,
    registration_date,
    cancel_reason ?? null,
    registered_by,
    recordStatus,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          message: "Invalid person_id, location_id, or registered_by",
        });
      }

      return res.status(500).json({
        message: "Failed to create vital record",
        error: err.message,
      });
    }

    return res.status(201).json({
      message: "Vital record created successfully",
      record_id: result.insertId,
    });
  });
};

const getVitalRecords = (req, res) => {
  const sql = `
        SELECT
            record_id,
            person_id,
            location_id,
            record_type,
            registration_date,
            cancel_reason,
            registered_by,
            status,
            created_at,
            updated_at
        FROM vital_records
        ORDER BY record_id DESC
    `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve vital records",
        error: err.message,
      });
    }

    return res.status(200).json({
      message: "Vital records retrieved successfully",
      count: results.length,
      records: results,
    });
  });
};

const getVitalRecordById = (req, res) => {
  const { id } = req.params;

  // Validate record ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Invalid vital record ID",
    });
  }

  const sql = `
        SELECT
            record_id,
            person_id,
            location_id,
            record_type,
            registration_date,
            cancel_reason,
            registered_by,
            status,
            created_at,
            updated_at
        FROM vital_records
        WHERE record_id = ?
    `;

  connection.query(sql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve vital record",
        error: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Vital record not found",
      });
    }

    return res.status(200).json({
      message: "Vital record retrieved successfully",
      record: results[0],
    });
  });
};

const updateVitalRecord = (req, res) => {
  const { id } = req.params;

  const {
    person_id,
    location_id,
    record_type,
    registration_date,
    cancel_reason,
    registered_by,
    status,
  } = req.body;

  // Validate record ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Invalid vital record ID",
    });
  }

  // Validate required fields
  if (!record_type || !registration_date || !registered_by) {
    return res.status(400).json({
      message: "Record type, registration date, and registered_by are required",
    });
  }

  const allowedTypes = ["Birth", "Death", "Marriage", "Divorce", "Adoption"];

  const allowedStatuses = ["Pending", "Active", "Cancelled"];

  if (!allowedTypes.includes(record_type)) {
    return res.status(400).json({
      message: "Invalid record type",
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status",
    });
  }

  // Birth, Death, and Adoption require person_id
  if (
    !["Marriage", "Divorce"].includes(record_type) &&
    (person_id === undefined || person_id === null)
  ) {
    return res.status(400).json({
      message: "person_id is required for this record type",
    });
  }

  const sql = `
        UPDATE vital_records
        SET
            person_id = ?,
            location_id = ?,
            record_type = ?,
            registration_date = ?,
            cancel_reason = ?,
            registered_by = ?,
            status = ?
        WHERE record_id = ?
    `;

  const values = [
    person_id ?? null,
    location_id ?? null,
    record_type,
    registration_date,
    cancel_reason ?? null,
    registered_by,
    status,
    id,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          message: "Invalid person_id, location_id, or registered_by",
        });
      }

      return res.status(500).json({
        message: "Failed to update vital record",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Vital record not found, or no changes were made",
      });
    }

    return res.status(200).json({
      message: "Vital record updated successfully",
    });
  });
};

const deleteVitalRecord = (req, res) => {
  const { id } = req.params;

  // Validate record ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Invalid vital record ID",
    });
  }

  const sql = `
        DELETE FROM vital_records
        WHERE record_id = ?
    `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      if (
        err.code === "ER_ROW_IS_REFERENCED_2" ||
        err.code === "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          message: "Cannot delete this record because related records exist",
        });
      }

      return res.status(500).json({
        message: "Failed to delete vital record",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Vital record not found",
      });
    }

    return res.status(200).json({
      message: "Vital record deleted successfully",
    });
  });
};

module.exports = {
  createVitalRecord,
  getVitalRecords,
  getVitalRecordById,
  updateVitalRecord,
  deleteVitalRecord,
};
