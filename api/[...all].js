// Vercel serverless entrypoint. The filename "[...all].js" is Vercel's
// catch-all route syntax, so every request under /api/* (e.g. /api/quotes,
// /api/mf/status, /api/screener/TCS) is sent here with the real path intact.
// Express's own router (defined once in app.js) then matches it exactly as
// it would on a traditional host — no route logic is duplicated here.
module.exports = require("../app");
