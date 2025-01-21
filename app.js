// Import required packages
const express = require("express");
const dotenv = require("./config/dotenv");
const path = require("path");
const passport = require("passport");
const passportConfig = require("./config/passport-config");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");
const swaggerUi = require('swagger-ui-express');
const swaggerDocs = require('./config/swaggerOptions');

// Response Helper middleware
const responseHelper = require("./library/responseHelper");

// Create Express app
const app = express();

// Load environment variables from .env file first
(async () => {
    await dotenv.loadEnvFile();
})();

// Configure middleware in the correct order
// 1. Basic security and logging middleware
app.use(morgan("dev"));
app.use(helmet({
    crossOriginEmbedderPolicy: false,
}));

// 2. CORS configuration
const whitelistedOrigins = process.env.CORS_ORIGINS?.split(" ") || [];
app.use(
    cors("*")
);

// 3. Body parsing middleware
// Handle raw body for webhooks
app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/webhook")) {
        express.raw({ type: 'application/json' })(req, res, next);
    } else {
        next();
    }
});

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 4. Authentication middleware (uncomment if needed)
app.use(passport.initialize());
passportConfig(passport);

// 5. Response helper middleware (uncomment if needed)
// app.use(responseHelper);

// Serve Swagger API Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.get("/", (req, res) => {
    res.send("Hello World");
});

app.post("/", (req, res) => {
    res.send("Hello World");
});

// API routes
app.use("/api", require('./components/router'));

// Static files
app.use("/public", express.static(path.join(__dirname, "public")));

module.exports = app;