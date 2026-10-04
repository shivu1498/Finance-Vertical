// StalkingStocks — local / traditional-host entrypoint (node server.js).
//
// The actual Express app and all its routes live in app.js, which is shared
// with the Vercel serverless entrypoint (api/[...all].js). This file's only
// job is to listen() on a port and, for local runs, open a browser tab.
const { exec } = require("child_process");
const app = require("./app");

const PORT = process.env.PORT || 3000;
// Bind to localhost only by default: on your own machine this keeps the
// server reachable from this machine alone, never from other devices on the
// network. Hosts like Render/Railway need their proxy to reach the app, so
// set HOST=0.0.0.0 in that platform's environment variables.
const HOST = process.env.HOST || "127.0.0.1";

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "win32" ? `start "" "${url}"` : platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Open ${url} in your browser manually.`);
  });
}

app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`StalkingStocks running at ${url} (this PC only)`);
  if (process.env.NO_OPEN !== "1") openBrowser(url);
});
