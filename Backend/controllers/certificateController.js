const connection = require("../config/db");

const createCertificate = (req, res) => {
  const { record_id, certificate_number, issued_date, issued_by } = req.body;

  if (
    record_id === undefined ||
    record_id === null ||
    record_id === "" ||
    !certificate_number ||
    !issued_date ||
    issued_by === undefined ||
    issued_by === null ||
    issued_by === ""
  ) {
    return res.status(400).json({
      message:
        "record_id, certificate_number, issued_date, and issued_by are required",
    });
  }

  const isPositiveInteger = (value) =>
    Number.isInteger(Number(value)) && Number(value) > 0;

  if (!isPositiveInteger(record_id) || !isPositiveInteger(issued_by)) {
    return res.status(400).json({
      message: "record_id and issued_by must be positive integers",
    });
  }

  if (
    typeof certificate_number !== "string" ||
    certificate_number.trim() === "" ||
    certificate_number.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Certificate number must be 1–100 characters",
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

  if (!isValidDate(issued_date)) {
    return res.status(400).json({
      message: "issued_date must be a valid date in YYYY-MM-DD format",
    });
  }

  const sql = `
    SELECT record_id, status
    FROM vital_records
    WHERE record_id = ?
    LIMIT 1
  `;

  connection.query(sql, [Number(record_id)], (error, records) => {
    if (error) {
      console.error("Check vital record error:", error);

      return res.status(500).json({
        message: "Failed to check vital record",
      });
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

    connection.query(
      insertSql,
      [
        Number(record_id),
        certificate_number.trim(),
        issued_date,
        Number(issued_by),
      ],
      (insertError, result) => {
        if (insertError) {
          console.error("Create certificate error:", insertError);

          if (insertError.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message: "Certificate number already exists",
            });
          }

          if (insertError.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({
              message: "Invalid record_id or issued_by",
            });
          }

          return res.status(500).json({
            message: "Failed to create certificate",
          });
        }

        return res.status(201).json({
          message: "Certificate created successfully",
          certificate_id: result.insertId,
          record_id: Number(record_id),
          certificate_number: certificate_number.trim(),
          status: "Active",
        });
      },
    );
  });
};

const getAllCertificates = (req, res) => {
  const sql = `
    SELECT
      c.certificate_id,
      c.record_id,
      c.certificate_number,
      c.issued_date,
      c.issued_by,
      u.username AS issued_by_username,
      c.status,
      c.cancel_reason,
      vr.record_type,
      vr.status AS record_status
    FROM certificates c
    JOIN users u
      ON c.issued_by = u.user_id
    JOIN vital_records vr
      ON c.record_id = vr.record_id
    ORDER BY c.certificate_id DESC
  `;

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Get certificates error:", error);

      return res.status(500).json({
        message: "Failed to retrieve certificates",
      });
    }

    return res.status(200).json({
      message: "Certificates retrieved successfully",
      total: results.length,
      certificates: results,
    });
  });
};

const getCertificateById = (req, res) => {
  const { id } = req.params;

  // Validate certificate ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      c.certificate_id,
      c.record_id,
      c.certificate_number,
      c.issued_date,
      c.issued_by,
      u.username AS issued_by_username,
      c.status,
      c.cancel_reason,
      vr.record_type,
      vr.status AS record_status
    FROM certificates c
    JOIN users u
      ON c.issued_by = u.user_id
    JOIN vital_records vr
      ON c.record_id = vr.record_id
    WHERE c.certificate_id = ?
    LIMIT 1
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      console.error("Get certificate by ID error:", error);

      return res.status(500).json({
        message: "Failed to retrieve certificate",
      });
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

const updateCertificate = (req, res) => {
  const { id } = req.params;
  const { certificate_number, issued_date } = req.body;

  // Validate certificate ID
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  // Validate required fields
  if (!certificate_number || !issued_date) {
    return res.status(400).json({
      message: "certificate_number and issued_date are required",
    });
  }

  // Validate certificate number
  if (
    typeof certificate_number !== "string" ||
    certificate_number.trim() === "" ||
    certificate_number.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Certificate number must be 1–100 characters",
    });
  }

  // Validate date format and actual date
  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

  if (!isValidDate(issued_date)) {
    return res.status(400).json({
      message: "issued_date must be a valid date in YYYY-MM-DD format",
    });
  }

  // Check whether certificate exists
  const checkSql = `
    SELECT certificate_id, status
    FROM certificates
    WHERE certificate_id = ?
    LIMIT 1
  `;

  connection.query(checkSql, [Number(id)], (error, results) => {
    if (error) {
      console.error("Check certificate error:", error);

      return res.status(500).json({
        message: "Failed to check certificate",
      });
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

    // Update certificate
    const updateSql = `
      UPDATE certificates
      SET certificate_number = ?,
          issued_date = ?
      WHERE certificate_id = ?
    `;

    connection.query(
      updateSql,
      [certificate_number.trim(), issued_date, Number(id)],
      (updateError, updateResult) => {
        if (updateError) {
          console.error("Update certificate error:", updateError);

          if (updateError.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message: "Certificate number already exists",
            });
          }

          return res.status(500).json({
            message: "Failed to update certificate",
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

const cancelCertificate = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  if (
    typeof reason !== "string" ||
    reason.trim() === "" ||
    reason.trim().length > 500
  ) {
    return res.status(400).json({
      message: "A cancellation reason (1–500 characters) is required",
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
      console.error("Check certificate error:", error);

      return res.status(500).json({
        message: "Failed to check certificate",
      });
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
      SET status = 'Cancelled',
          cancel_reason = ?
      WHERE certificate_id = ?
    `;

    connection.query(updateSql, [reason.trim(), Number(id)], (updateError) => {
      if (updateError) {
        console.error("Cancel certificate error:", updateError);

        return res.status(500).json({
          message: "Failed to cancel certificate",
        });
      }

      return res.status(200).json({
        message: "Certificate cancelled successfully",
        certificate_id: Number(id),
        status: "Cancelled",
        cancel_reason: reason.trim(),
      });
    });
  });
};

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  cancelCertificate,
};
