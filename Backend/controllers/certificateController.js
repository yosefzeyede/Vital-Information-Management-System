const connection = require("../config/db");
const PDFDocument = require("pdfkit");
const path = require("path");
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
const formatCertificateDate = (value) => {
  if (!value) return "N/A";

  let year, month, day;

  if (value instanceof Date) {
    // Use local date components from MySQL Date object
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  } else {
    // Extract date directly from YYYY-MM-DD
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) return String(value);

    [, year, month, day] = match;

    year = Number(year);
    month = Number(month);
    day = Number(day);
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const getFullName = (person) => {
  if (!person) return "Not Provided";

  return [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(" ");
};

const getLocationName = (location) => {
  if (!location) return "Not Provided";

  return [
    location.region,
    location.zone,
    location.city,
    location.woreda,
    location.kebele,
    location.got,
  ]
    .filter(Boolean)
    .join(", ");
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

const createCertificate = async (req, res) => {
  try {
    const { record_id, certificate_number, issued_date } = req.body;

    // Get the logged-in user's ID from JWT middleware
    const issued_by = req.user?.user_id;

    // 1. Validate authenticated user
    if (!issued_by) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    // 2. Validate required fields
    if (!record_id || !certificate_number || !issued_date) {
      return res.status(400).json({
        success: false,
        message: "Record ID, certificate number, and issued date are required.",
      });
    }

    // 3. Validate record_id
    if (!Number.isInteger(Number(record_id)) || Number(record_id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid record ID.",
      });
    }

    // 4. Validate certificate number
    if (
      typeof certificate_number !== "string" ||
      certificate_number.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid certificate number.",
      });
    }

    // 5. Validate issued date
    if (Number.isNaN(Date.parse(issued_date))) {
      return res.status(400).json({
        success: false,
        message: "Invalid issued date.",
      });
    }

    // 6. Check whether the vital record exists
    const [record] = await connection.promise().query(
      `SELECT record_id, status
       FROM vital_records
       WHERE record_id = ?`,
      [Number(record_id)],
    );

    if (record.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vital record not found.",
      });
    }

    // 7. Check whether the record is active
    if (record[0].status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Certificate can only be issued for an active vital record.",
      });
    }

    // 8. Check whether the logged-in user exists and is active
    const [user] = await connection.promise().query(
      `SELECT user_id
       FROM users
       WHERE user_id = ? AND is_active = 1`,
      [issued_by],
    );

    if (user.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found or inactive.",
      });
    }

    // 9. Check whether an active certificate already exists
    const [existingCertificate] = await connection.promise().query(
      `SELECT certificate_id
       FROM certificates
       WHERE record_id = ? AND status = 'Active'`,
      [Number(record_id)],
    );

    if (existingCertificate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An active certificate already exists for this record.",
      });
    }

    // 10. Insert certificate
    const [result] = await connection.promise().query(
      `INSERT INTO certificates
       (record_id, certificate_number, issued_date, issued_by)
       VALUES (?, ?, ?, ?)`,
      [Number(record_id), certificate_number.trim(), issued_date, issued_by],
    );

    return res.status(201).json({
      success: true,
      message: "Certificate created successfully.",
      certificate_id: result.insertId,
    });
  } catch (error) {
    console.error("Create certificate error:", error);

    // Handle duplicate certificate number
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Certificate number already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error while creating certificate.",
    });
  }
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
// ==================== DOWNLOAD CERTIFICATE PDF ====================

const downloadCertificatePdf = (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({
      message: "Certificate ID must be a positive integer",
    });
  }

  const sql = `
    SELECT
      c.certificate_id,
      c.certificate_number,
      c.issued_date,
      c.status,
      c.record_id,

      u.username AS issued_by_username,

      vr.record_type,
      vr.registration_date,

      l.region,
      l.zone,
      l.city,
      l.woreda,
      l.kebele,
      l.got,

      p.first_name AS subject_first_name,
      p.middle_name AS subject_middle_name,
      p.last_name AS subject_last_name,
      p.gender AS subject_gender,
      p.date_of_birth AS subject_date_of_birth,

      b.birth_id,
      father.first_name AS father_first_name,
      father.middle_name AS father_middle_name,
      father.last_name AS father_last_name,
      mother.first_name AS mother_first_name,
      mother.middle_name AS mother_middle_name,
      mother.last_name AS mother_last_name,

      dt.death_date,
      dt.cause_of_death,

      m.marriage_date,
      spouse1.first_name AS spouse1_first_name,
      spouse1.middle_name AS spouse1_middle_name,
      spouse1.last_name AS spouse1_last_name,
      spouse2.first_name AS spouse2_first_name,
      spouse2.middle_name AS spouse2_middle_name,
      spouse2.last_name AS spouse2_last_name,

      d.divorce_date,
      d.reason AS divorce_reason,
      d.court_reference AS divorce_court_reference,

      divorce_spouse1.first_name AS divorce_spouse1_first_name,
      divorce_spouse1.middle_name AS divorce_spouse1_middle_name,
      divorce_spouse1.last_name AS divorce_spouse1_last_name,

      divorce_spouse2.first_name AS divorce_spouse2_first_name,
      divorce_spouse2.middle_name AS divorce_spouse2_middle_name,
      divorce_spouse2.last_name AS divorce_spouse2_last_name,

      a.adoption_date,
      a.court_reference AS adoption_court_reference,

      adoptive_father.first_name AS adoptive_father_first_name,
      adoptive_father.middle_name AS adoptive_father_middle_name,
      adoptive_father.last_name AS adoptive_father_last_name,

      adoptive_mother.first_name AS adoptive_mother_first_name,
      adoptive_mother.middle_name AS adoptive_mother_middle_name,
      adoptive_mother.last_name AS adoptive_mother_last_name

    FROM certificates c

    INNER JOIN users u
      ON c.issued_by = u.user_id

    INNER JOIN vital_records vr
      ON c.record_id = vr.record_id

    LEFT JOIN locations l
      ON vr.location_id = l.location_id

    LEFT JOIN persons p
      ON vr.person_id = p.person_id

    LEFT JOIN births b
      ON vr.record_id = b.record_id

    LEFT JOIN persons father
      ON b.father_id = father.person_id

    LEFT JOIN persons mother
      ON b.mother_id = mother.person_id

    LEFT JOIN deaths dt
      ON vr.record_id = dt.record_id

    LEFT JOIN marriages m
      ON vr.record_id = m.record_id

    LEFT JOIN persons spouse1
      ON m.person1_id = spouse1.person_id

    LEFT JOIN persons spouse2
      ON m.person2_id = spouse2.person_id

    LEFT JOIN divorces d
      ON vr.record_id = d.record_id

    LEFT JOIN marriages divorce_marriage
      ON d.marriage_id = divorce_marriage.marriage_id

    LEFT JOIN persons divorce_spouse1
      ON divorce_marriage.person1_id = divorce_spouse1.person_id

    LEFT JOIN persons divorce_spouse2
      ON divorce_marriage.person2_id = divorce_spouse2.person_id

    LEFT JOIN adoptions a
      ON vr.record_id = a.record_id

    LEFT JOIN persons adoptive_father
      ON a.adoptive_father_id = adoptive_father.person_id

    LEFT JOIN persons adoptive_mother
      ON a.adoptive_mother_id = adoptive_mother.person_id

    WHERE c.certificate_id = ?
    LIMIT 1
  `;

  connection.query(sql, [Number(id)], (error, results) => {
    if (error) {
      return handleDatabaseError(res, error, "Retrieve certificate for PDF");
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Certificate not found",
      });
    }

    const certificate = results[0];

    if (certificate.status !== "Active") {
      return res.status(409).json({
        message: "Cancelled certificates cannot be downloaded",
      });
    }

    const safeFileName = certificate.certificate_number.replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );

    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 45,
        bottom: 45,
        left: 55,
        right: 55,
      },
      bufferPages: true,
    });

    // Register the Ethiopic font for this PDF document.
    try {
      const amharicFontPath = path.join(
        __dirname,
        "../assets/NotoSansEthiopic-Regular.ttf",
      );

      doc.registerFont("Amharic", amharicFontPath);
    } catch (fontError) {
      console.error("Amharic font registration error:", fontError);

      return res.status(500).json({
        message: "Could not load the Amharic PDF font",
      });
    }

    doc.on("error", (pdfError) => {
      console.error("PDF generation error:", pdfError);

      if (!res.headersSent) {
        res.status(500).json({
          message: "Certificate PDF generation failed",
        });
      } else {
        res.destroy(pdfError);
      }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}.pdf"`,
    );

    doc.pipe(res);

    // ==================================================
    // TEXT AND FONT HELPERS
    // ==================================================

    const normalizePdfText = (value, fallback = "Not Provided") => {
      if (value === null || value === undefined) {
        return fallback;
      }

      // Handle Buffer values safely if MySQL returns one.
      const rawText = Buffer.isBuffer(value)
        ? value.toString("utf8")
        : String(value);

      const normalizedText = rawText
        .normalize("NFC")
        .replace(/\u0000/g, "")
        .trim();

      return normalizedText || fallback;
    };

    // Detect Ethiopic characters using Unicode Script property.
    const containsEthiopic = (value) => /\p{Script=Ethiopic}/u.test(value);

    const setValueFont = (value) => {
      const fontName = containsEthiopic(value) ? "Amharic" : "Helvetica";

      doc.font(fontName);

      // Report characters not supported by the registered font.
      if (fontName === "Amharic") {
        const font = doc._font?.font;

        if (font && typeof font.hasGlyphForCodePoint === "function") {
          const missingCharacters = [
            ...new Set(
              [...value].filter((character) => {
                if (/\s/u.test(character)) return false;

                return !font.hasGlyphForCodePoint(character.codePointAt(0));
              }),
            ),
          ];

          if (missingCharacters.length > 0) {
            console.warn(
              "Amharic font is missing these characters:",
              missingCharacters.map((character) => ({
                character,
                unicode:
                  "U+" + character.codePointAt(0).toString(16).toUpperCase(),
              })),
            );
          }
        }
      }

      return fontName;
    };

    const writeValue = (value, options = {}) => {
      const textValue = normalizePdfText(value);

      setValueFont(textValue);

      doc
        .fontSize(options.fontSize || 11)
        .fillColor(options.color || "#1e293b")
        .text(textValue, {
          width: options.width || 485,
          lineGap: 2,
          align: options.align || "left",
        });
    };

    // ==================================================
    // GENERAL PDF HELPERS
    // ==================================================

    const addField = (label, value) => {
      const safeValue = normalizePdfText(value);

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#334155")
        .text(`${label}: `, {
          continued: true,
        });

      writeValue(safeValue, {
        fontSize: 10,
        color: "#475569",
      });

      doc.moveDown(0.5);
    };

    const addBilingualField = (amharicLabel, englishLabel, value) => {
      const displayValue =
        value === null || value === undefined || value === ""
          ? "Not Provided"
          : String(value);

      doc
        .font("Amharic")
        .fontSize(10)
        .fillColor("#334155")
        .text(`${amharicLabel} | ${englishLabel}`);

      // Use the same font detection that writeValue/setValueFont already uses
      const fontName = containsEthiopic(displayValue) ? "Amharic" : "Helvetica";
      doc.font(fontName);

      doc.fontSize(11).fillColor("#1e293b").text(displayValue);

      doc.moveDown(0.5);
    };

    const addSectionTitle = (amharicTitle, englishTitle) => {
      doc
        .font("Amharic")
        .fontSize(12)
        .fillColor("#0f766e")
        .text(`${amharicTitle} | ${englishTitle}`, {
          width: 485,
        });

      doc.moveDown(0.6);
    };

    const addDivider = () => {
      doc
        .moveTo(55, doc.y)
        .lineTo(540, doc.y)
        .lineWidth(0.8)
        .strokeColor("#cbd5e1")
        .stroke();

      doc.moveDown(0.8);
    };

    const fullSubjectName = getFullName({
      first_name: certificate.subject_first_name,
      middle_name: certificate.subject_middle_name,
      last_name: certificate.subject_last_name,
    });

    const fatherFullName = getFullName({
      first_name: certificate.father_first_name,
      middle_name: certificate.father_middle_name,
      last_name: certificate.father_last_name,
    });

    const motherFullName = getFullName({
      first_name: certificate.mother_first_name,
      middle_name: certificate.mother_middle_name,
      last_name: certificate.mother_last_name,
    });

    const locationName = getLocationName(certificate);

    // ==================================================
    // HEADER
    // ==================================================

    doc.font("Amharic").fontSize(19).fillColor("#0f766e").text("ወገሬ ጤና ጣቢያ", {
      align: "center",
      width: 485,
    });

    doc.moveDown(0.2);

    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#0f766e")
      .text("WOGERE HEALTH CENTER", {
        align: "center",
      });

    doc.moveDown(0.2);

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text("VITAL INFORMATION MANAGEMENT SYSTEM", {
        align: "center",
      });

    doc.moveDown(0.8);

    doc
      .moveTo(55, doc.y)
      .lineTo(540, doc.y)
      .lineWidth(2)
      .strokeColor("#0d9488")
      .stroke();

    doc.moveDown(1);

    // ==================================================
    // CERTIFICATE TITLE
    // ==================================================

    if (certificate.record_type === "Birth") {
      doc
        .font("Amharic")
        .fontSize(17)
        .fillColor("#0f172a")
        .text("የልደት ምስክር ወረቀት", {
          align: "center",
          width: 485,
        });

      doc.moveDown(0.2);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#0f172a")
        .text("BIRTH CERTIFICATE", {
          align: "center",
        });
    } else {
      const titles = {
        Death: "DEATH CERTIFICATE",
        Marriage: "MARRIAGE CERTIFICATE",
        Divorce: "DIVORCE CERTIFICATE",
        Adoption: "ADOPTION CERTIFICATE",
      };

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#0f172a")
        .text(titles[certificate.record_type] || "OFFICIAL CERTIFICATE", {
          align: "center",
        });
    }

    doc.moveDown(1);

    // ==================================================
    // BIRTH CERTIFICATE DESIGN
    // ==================================================

    if (certificate.record_type === "Birth") {
      addSectionTitle("የምዝገባ መረጃ", "REGISTRATION INFORMATION");

      addBilingualField(
        "የምስክር ወረቀት ቁጥር",
        "Certificate Number",
        certificate.certificate_number,
      );

      addBilingualField(
        "የምዝገባ ቁጥር",
        "Registration Number",
        certificate.record_id,
      );

      addBilingualField(
        "የምዝገባ ቀን",
        "Registration Date",
        formatCertificateDate(certificate.registration_date),
      );

      addBilingualField(
        "የተሰጠበት ቀን",
        "Issued Date",
        formatCertificateDate(certificate.issued_date),
      );

      addDivider();

      addSectionTitle("የልደት መረጃ", "BIRTH INFORMATION");

      addBilingualField("የልጅ ሙሉ ስም", "Child's Full Name", fullSubjectName);

      addBilingualField("ጾታ", "Gender", certificate.subject_gender);

      addBilingualField(
        "የትውልድ ቀን",
        "Date of Birth",
        formatCertificateDate(certificate.subject_date_of_birth),
      );

      addBilingualField("የአባት ሙሉ ስም", "Father's Full Name", fatherFullName);

      addBilingualField("የእናት ሙሉ ስም", "Mother's Full Name", motherFullName);

      addDivider();

      addSectionTitle("የምዝገባ ቦታ", "REGISTRATION LOCATION");

      addBilingualField("የምዝገባ ቦታ", "Registration Location", locationName);

      // ==================================================
      // SIGNATURE AND STAMP
      // ==================================================

      doc.moveDown(2);

      const signatureY = Math.max(doc.y + 25, 620);

      doc
        .moveTo(65, signatureY)
        .lineTo(235, signatureY)
        .lineWidth(0.8)
        .strokeColor("#334155")
        .stroke();

      doc
        .moveTo(360, signatureY)
        .lineTo(530, signatureY)
        .lineWidth(0.8)
        .strokeColor("#334155")
        .stroke();

      doc
        .font("Amharic")
        .fontSize(9)
        .fillColor("#334155")
        .text("የመዝጋቢ ፊርማ | Registrar's Signature", 55, signatureY + 8, {
          width: 190,
          align: "center",
        });

      doc
        .font("Amharic")
        .fontSize(9)
        .fillColor("#334155")
        .text("የጤና ጣቢያው ማህተም | Official Stamp", 350, signatureY + 8, {
          width: 190,
          align: "center",
        });

      doc.y = signatureY + 55;
    } else {
      // ==================================================
      // OTHER CERTIFICATE TYPES
      // ==================================================

      addField("Certificate Number", certificate.certificate_number);

      addField("Registration Number", certificate.record_id);

      addField(
        "Registration Date",
        formatCertificateDate(certificate.registration_date),
      );

      addField("Issued Date", formatCertificateDate(certificate.issued_date));

      doc.moveDown(0.5);
      addDivider();

      switch (certificate.record_type) {
        case "Death":
          addField("Deceased Person", fullSubjectName);
          addField("Gender", certificate.subject_gender);
          addField(
            "Date of Birth",
            formatCertificateDate(certificate.subject_date_of_birth),
          );
          addField(
            "Date of Death",
            formatCertificateDate(certificate.death_date),
          );
          addField("Cause of Death", certificate.cause_of_death);
          break;

        case "Marriage":
          addField(
            "First Spouse",
            getFullName({
              first_name: certificate.spouse1_first_name,
              middle_name: certificate.spouse1_middle_name,
              last_name: certificate.spouse1_last_name,
            }),
          );

          addField(
            "Second Spouse",
            getFullName({
              first_name: certificate.spouse2_first_name,
              middle_name: certificate.spouse2_middle_name,
              last_name: certificate.spouse2_last_name,
            }),
          );

          addField(
            "Marriage Date",
            formatCertificateDate(certificate.marriage_date),
          );
          break;

        case "Divorce":
          addField(
            "First Spouse",
            getFullName({
              first_name: certificate.divorce_spouse1_first_name,
              middle_name: certificate.divorce_spouse1_middle_name,
              last_name: certificate.divorce_spouse1_last_name,
            }),
          );

          addField(
            "Second Spouse",
            getFullName({
              first_name: certificate.divorce_spouse2_first_name,
              middle_name: certificate.divorce_spouse2_middle_name,
              last_name: certificate.divorce_spouse2_last_name,
            }),
          );

          addField(
            "Divorce Date",
            formatCertificateDate(certificate.divorce_date),
          );

          addField("Reason", certificate.divorce_reason);

          addField("Court Reference", certificate.divorce_court_reference);
          break;

        case "Adoption":
          addField("Adopted Person", fullSubjectName);

          addField(
            "Adoptive Father's Name",
            getFullName({
              first_name: certificate.adoptive_father_first_name,
              middle_name: certificate.adoptive_father_middle_name,
              last_name: certificate.adoptive_father_last_name,
            }),
          );

          addField(
            "Adoptive Mother's Name",
            getFullName({
              first_name: certificate.adoptive_mother_first_name,
              middle_name: certificate.adoptive_mother_middle_name,
              last_name: certificate.adoptive_mother_last_name,
            }),
          );

          addField(
            "Adoption Date",
            formatCertificateDate(certificate.adoption_date),
          );

          addField("Court Reference", certificate.adoption_court_reference);
          break;

        default:
          addField("Record Type", certificate.record_type);
      }

      doc.moveDown(0.5);

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#0f766e")
        .text("REGISTRATION LOCATION");

      doc.moveDown(0.5);

      addField("Location", locationName);
    }

    // ==================================================
    // FOOTER
    // ==================================================

    doc.moveDown(1);

    doc
      .moveTo(55, doc.y)
      .lineTo(540, doc.y)
      .lineWidth(0.8)
      .strokeColor("#cbd5e1")
      .stroke();

    doc.moveDown(0.7);

    if (certificate.record_type === "Birth") {
      doc
        .font("Amharic")
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          "ይህ ሰነድ በወገሬ ጤና ጣቢያ የVital Information Management System የተዘጋጀ ነው።",
          {
            align: "center",
            width: 485,
          },
        );

      doc.moveDown(0.3);
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        "This document was generated by the Vital Information Management System.",
        {
          align: "center",
        },
      );

    doc.moveDown(0.3);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(`Issued by: ${normalizePdfText(certificate.issued_by_username)}`, {
        align: "center",
      });

    doc.end();
  });
};

// ==================== EXPORT FUNCTIONS ====================

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  cancelCertificate,
  downloadCertificatePdf,
};
