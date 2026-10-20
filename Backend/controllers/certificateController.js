const connection = require("../config/db");

// ==================== HELPER FUNCTIONS ====================

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
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1000 || year > 9999) return false;

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isValidCertificateNumber = (value) =>
  typeof value === "string" &&
  value.trim().length >= 1 &&
  value.trim().length <= 100;

const handleDatabaseError = (res, error, action) => {
  console.error(`${action} error:`, error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "Certificate number already exists",
    });
  }

  if (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.code === "ER_NO_REFERENCED_ROW"
  ) {
    return res.status(400).json({
      message: "Invalid record_id or issued_by",
    });
  }

  return res.status(500).json({
    message: `${action} failed`,
  });
};

// Shared query for certificate details.
// Note: certificates table has no cancel_reason column.
const certificateSelectSql = `
  SELECT
    c.certificate_id,
    c.record_id,
    c.certificate_number,
    c.issued_date,
    c.issued_by,
    u.username AS issued_by_username,
    c.status,
    vr.record_type,
    vr.status AS record_status
  FROM certificates c
  INNER JOIN users u
    ON c.issued_by = u.user_id
  INNER JOIN vital_records vr
    ON c.record_id = vr.record_id
`;

// ==================== CREATE CERTIFICATE ====================

const createCertificate = (req, res) => {
  const { record_id, certificate_number, issued_date, issued_by } = req.body;

  if (
    record_id === undefined ||
    record_id === null ||
    record_id === "" ||
    certificate_number === undefined ||
    issued_date === undefined ||
    issued_date === "" ||
    issued_by === undefined ||
    issued_by === null ||
    issued_by === ""
  ) {
    return res.status(400).json({
      message:
        "record_id, certificate_number, issued_date, and issued_by are required",
    });
  }

  if (!isPositiveInteger(record_id) || !isPositiveInteger(issued_by)) {
    return res.status(400).json({
      message: "record_id and issued_by must be positive integers",
    });
  }

  if (!isValidCertificateNumber(certificate_number)) {
    return res.status(400).json({
      message: "Certificate number must be 1–100 characters",
    });
  }

  if (!isValidDate(issued_date)) {
    return res.status(400).json({
      message: "issued_date must be a valid date in YYYY-MM-DD format",
    });
  }

  const checkRecordSql = `
    SELECT record_id, status
    FROM vital_records
    WHERE record_id = ?
    LIMIT 1
  `;

  connection.query(checkRecordSql, [Number(record_id)], (error, records) => {
    if (error) {
      return handleDatabaseError(res, error, "Check vital record");
    }

    if (records.length === 0) {
      return res.status(404).json({
        message: "Vital record not found",
      });
    }

    if (records[0].status !== "Active") {
      return res.status(409).json({
        message: "A certificate can only be issued for an Active vital record",
      });
    }

    const insertSql = `
        INSERT INTO certificates (
          record_id,
          certificate_number,
          issued_date,
          issued_by,
          status
        )
        VALUES (?, ?, ?, ?, 'Active')
      `;

    const values = [
      Number(record_id),
      certificate_number.trim(),
      issued_date,
      Number(issued_by),
    ];

    connection.query(insertSql, values, (insertError, result) => {
      if (insertError) {
        return handleDatabaseError(res, insertError, "Create certificate");
      }

      return res.status(201).json({
        message: "Certificate created successfully",
        certificate_id: result.insertId,
        record_id: Number(record_id),
        certificate_number: certificate_number.trim(),
        issued_date,
        issued_by: Number(issued_by),
        status: "Active",
      });
    });
  });
};

// ==================== GET ALL CERTIFICATES ====================

const getAllCertificates = (req, res) => {
  const sql = `
    ${certificateSelectSql}
    ORDER BY c.certificate_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      return handleDatabaseError(res, error, "Retrieve certificates");
    }

    return res.status(200).json({
      message: "Certificates retrieved successfully",
      total: results.length,
      certificates: results,
    });
  });
};

// ==================== GET CERTIFICATE BY ID ====================

const getCertificateById = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  const sql = `
    ${certificateSelectSql}
    WHERE c.certificate_id = ?
    LIMIT 1
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(res, error, "Retrieve certificate");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Certificate not found",
      });
    }

    return res.status(200).json({
      message: "Certificate retrieved successfully",
      certificate: results[0],
    });
  });
};

// ==================== UPDATE CERTIFICATE ====================

const updateCertificate = (req, res) => {
  const { id } = req.params;
  const { certificate_number, issued_date } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  if (
    certificate_number === undefined ||
    issued_date === undefined ||
    issued_date === ""
  ) {
    return res.status(400).json({
      message: "certificate_number and issued_date are required",
    });
  }

  if (!isValidCertificateNumber(certificate_number)) {
    return res.status(400).json({
      message: "Certificate number must be 1–100 characters",
    });
  }

  if (!isValidDate(issued_date)) {
    return res.status(400).json({
      message: "issued_date must be a valid date in YYYY-MM-DD format",
    });
  }

  const checkSql = `
    SELECT certificate_id, status
    FROM certificates
    WHERE certificate_id = ?
    LIMIT 1
  `;

  connection.query(checkSql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(res, error, "Check certificate");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Certificate not found",
      });
    }

    if (results[0].status === "Cancelled") {
      return res.status(409).json({
        message: "Cancelled certificates cannot be updated",
      });
    }

    const updateSql = `
      UPDATE certificates
      SET certificate_number = ?,
          issued_date = ?
      WHERE certificate_id = ?
        AND status = 'Active'
    `;

    connection.query(
      updateSql,
      [certificate_number.trim(), issued_date, Number(id)],
      (updateError, updateResult) => {
        if (updateError) {
          return handleDatabaseError(res, updateError, "Update certificate");
        }

        if (updateResult.affectedRows === 0) {
          return res.status(409).json({
            message: "Certificate was not updated; it may have been cancelled",
          });
        }

        return res.status(200).json({
          message: "Certificate updated successfully",
          certificate_id: Number(id),
          certificate_number: certificate_number.trim(),
          issued_date,
        });
      },
    );
  });
};

// ==================== CANCEL CERTIFICATE ====================

const cancelCertificate = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  const checkSql = `
    SELECT certificate_id, status
    FROM certificates
    WHERE certificate_id = ?
    LIMIT 1
  `;

  connection.query(checkSql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(res, error, "Check certificate");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Certificate not found",
      });
    }

    if (results[0].status === "Cancelled") {
      return res.status(409).json({
        message: "Certificate is already cancelled",
      });
    }

    const updateSql = `
      UPDATE certificates
      SET status = 'Cancelled'
      WHERE certificate_id = ?
        AND status = 'Active'
    `;

    connection.query(updateSql, [Number(id)], (updateError, result) => {
      if (updateError) {
        return handleDatabaseError(res, updateError, "Cancel certificate");
      }

      if (result.affectedRows === 0) {
        return res.status(409).json({
          message: "Certificate could not be cancelled",
        });
      }

      return res.status(200).json({
        message: "Certificate cancelled successfully",
        certificate_id: Number(id),
        status: "Cancelled",
      });
    });
  });
};

// ==================== EXPORT FUNCTIONS ====================

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  cancelCertificate,
};
