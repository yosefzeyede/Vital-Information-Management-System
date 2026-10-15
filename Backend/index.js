const express = require("express");
const cors = require("cors");
const connection = require("./config/db.js");
require("dotenv").config();
const userRoutes = require("./routes/userRoutes.js");
const authRoutes = require("./routes/authRoutes.js");
const personRoutes = require("./routes/personRoutes.js");
const locationRoutes = require("./routes/locationRoutes.js");
const vitalRecordRoutes = require("./routes/vitalRecordRoutes.js");
const birthRoutes = require("./routes/birthRoutes.js");
const deathRoutes = require("./routes/deathRoutes.js");
const marriageRoutes = require("./routes/marriageRoutes.js");
const divorceRoutes = require("./routes/divorceRoutes.js");
const adoptionRoutes = require("./routes/adoptionRoutes.js");
const certificateRoutes = require("./routes/certificateRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route
app.get("/", (req, res) => {
  res.send("Vital Information Management System Backend is running");
});

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/vital-records", vitalRecordRoutes);
app.use("/api/births", birthRoutes);
app.use("/api/deaths", deathRoutes);
app.use("/api/marriages", marriageRoutes);
app.use("/api/divorces", divorceRoutes);
app.use("/api/adoptions", adoptionRoutes);
app.use("/api/certificates", certificateRoutes);
// Server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
