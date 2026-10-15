const connection = require("../config/db");

const createPerson = (req, res) => {
  const {
    first_name,
    middle_name,
    last_name,
    gender,
    date_of_birth,
    phone,
    address,
    location_id,
  } = req.body;

  if (!first_name || !middle_name || !last_name || !gender) {
    return res.status(400).json({
      message: "First name, middle name, last name, and gender are required",
    });
  }

  if (!["Male", "Female"].includes(gender)) {
    return res.status(400).json({
      message: "Gender must be Male or Female",
    });
  }

  const sql = `
        INSERT INTO persons (
            first_name,
            middle_name,
            last_name,
            gender,
            date_of_birth,
            phone,
            address,
            location_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

  const values = [
    first_name.trim(),
    middle_name.trim(),
    last_name.trim(),
    gender,
    date_of_birth || null,
    phone || null,
    address || null,
    location_id || null,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          message: "The specified location does not exist",
        });
      }

      return res.status(500).json({
        message: "Failed to register person",
        error: err.message,
      });
    }

    return res.status(201).json({
      message: "Person registered successfully",
      person_id: result.insertId,
    });
  });
};

const getPersons = (req, res) => {
  const sql = `
        SELECT
            person_id,
            first_name,
            middle_name,
            last_name,
            gender,
            date_of_birth,
            phone,
            address,
            location_id,
            created_at,
            updated_at
        FROM persons
        ORDER BY person_id DESC
    `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve persons",
        error: err.message,
      });
    }

    return res.status(200).json({
      message: "Persons retrieved successfully",
      count: results.length,
      persons: results,
    });
  });
};

const getPersonById = (req, res) => {
  const { id } = req.params;

  const sql = `
        SELECT
            person_id,
            first_name,
            middle_name,
            last_name,
            gender,
            date_of_birth,
            phone,
            address,
            location_id,
            created_at,
            updated_at
        FROM persons
        WHERE person_id = ?
    `;

  connection.query(sql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve person",
        error: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Person not found",
      });
    }

    return res.status(200).json({
      message: "Person retrieved successfully",
      person: results[0],
    });
  });
};

const updatePerson = (req, res) => {
  const { id } = req.params;

  const {
    first_name,
    middle_name,
    last_name,
    gender,
    date_of_birth,
    phone,
    address,
    location_id,
  } = req.body;

  // Validate required fields
  if (!first_name || !middle_name || !last_name || !gender) {
    return res.status(400).json({
      message: "First name, middle name, last name, and gender are required",
    });
  }

  if (!["Male", "Female"].includes(gender)) {
    return res.status(400).json({
      message: "Gender must be Male or Female",
    });
  }

  const sql = `
        UPDATE persons
        SET
            first_name = ?,
            middle_name = ?,
            last_name = ?,
            gender = ?,
            date_of_birth = ?,
            phone = ?,
            address = ?,
            location_id = ?
        WHERE person_id = ?
    `;

  const values = [
    first_name.trim(),
    middle_name.trim(),
    last_name.trim(),
    gender,
    date_of_birth || null,
    phone || null,
    address || null,
    location_id || null,
    id,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          message: "The specified location does not exist",
        });
      }

      return res.status(500).json({
        message: "Failed to update person",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Person not found",
      });
    }

    return res.status(200).json({
      message: "Person updated successfully",
    });
  });
};

const deletePerson = (req, res) => {
  const { id } = req.params;

  const sql = `
        DELETE FROM persons
        WHERE person_id = ?
    `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      if (err.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({
          message: "Cannot delete this person because related records exist",
        });
      }

      return res.status(500).json({
        message: "Failed to delete person",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Person not found",
      });
    }

    return res.status(200).json({
      message: "Person deleted successfully",
    });
  });
};

module.exports = {
  createPerson,
  getPersons,
  getPersonById,
  updatePerson,
  deletePerson,
};
