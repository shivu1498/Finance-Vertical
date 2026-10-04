// Vercel serverless entrypoint. vercel.json rewrites every /api/* request to
// this one function (see its "rewrites" rule), which then hands the request
// to the same Express app used for local/traditional hosting (app.js).
// Express's own router does the real path matching from here — no route
// logic is duplicated in this file.
module.exports = require("../app");
