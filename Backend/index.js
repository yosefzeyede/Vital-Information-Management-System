const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const dashboardRoutes = require("./routes/dashboardRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

// Validate required environment variables
const requiredEnvVars = [
  "JWT_SECRET",
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is required`);
    process.exit(1);
  }
}

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
  }),
);

// Configure CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to auth routes
app.use("/api/auth/login", authLimiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
app.use("/api/dashboard", dashboardRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be after all routes and 404 handler)
app.use(errorHandler);

// Server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
