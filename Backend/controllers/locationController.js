const connection = require("../config/db");

const createLocation = (req, res) => {
  const { region, zone, city, woreda, kebele, got } = req.body;

  if (!region || !zone || !woreda || !kebele) {
    return res.status(400).json({
      message: "Region, zone, woreda, and kebele are required",
    });
  }

  const sql = `
        INSERT INTO locations (
            region,
            zone,
            city,
            woreda,
            kebele,
            got
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `;

  const values = [
    region.trim(),
    zone.trim(),
    city ? city.trim() : null,
    woreda.trim(),
    kebele.trim(),
    got ? got.trim() : null,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to create location",
        error: err.message,
      });
    }

    return res.status(201).json({
      message: "Location created successfully",
      location_id: result.insertId,
    });
  });
};

const getLocations = (req, res) => {
  const sql = `
        SELECT
            location_id,
            region,
            zone,
            city,
            woreda,
            kebele,
            got
        FROM locations
        ORDER BY location_id DESC
    `;

  connection.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve locations",
        error: err.message,
      });
    }

    return res.status(200).json({
      message: "Locations retrieved successfully",
      count: results.length,
      locations: results,
    });
  });
};

const getLocationById = (req, res) => {
  const { id } = req.params;

  const sql = `
        SELECT
            location_id,
            region,
            zone,
            city,
            woreda,
            kebele,
            got
        FROM locations
        WHERE location_id = ?
    `;

  connection.query(sql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to retrieve location",
        error: err.message,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json({
      message: "Location retrieved successfully",
      location: results[0],
    });
  });
};

const updateLocation = (req, res) => {
  const { id } = req.params;

  const { region, zone, city, woreda, kebele, got } = req.body;

  // Validate required fields
  if (
    !region ||
    !region.trim() ||
    !zone ||
    !zone.trim() ||
    !woreda ||
    !woreda.trim() ||
    !kebele ||
    !kebele.trim()
  ) {
    return res.status(400).json({
      message: "Region, zone, woreda, and kebele are required",
    });
  }

  const sql = `
        UPDATE locations
        SET
            region = ?,
            zone = ?,
            city = ?,
            woreda = ?,
            kebele = ?,
            got = ?
        WHERE location_id = ?
    `;

  const values = [
    region.trim(),
    zone.trim(),
    city && city.trim() ? city.trim() : null,
    woreda.trim(),
    kebele.trim(),
    got && got.trim() ? got.trim() : null,
    id,
  ];

  connection.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to update location",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json({
      message: "Location updated successfully",
    });
  });
};

const deleteLocation = (req, res) => {
  const { id } = req.params;

  const sql = `
        DELETE FROM locations
        WHERE location_id = ?
    `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      if (err.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({
          message: "Cannot delete this location because related records exist",
        });
      }

      return res.status(500).json({
        message: "Failed to delete location",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    return res.status(200).json({
      message: "Location deleted successfully",
    });
  });
};
module.exports = {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
