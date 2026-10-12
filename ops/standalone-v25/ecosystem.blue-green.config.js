// Candidate only. Never replace the live PM2 app or its environment by default.
const releaseDir = process.env.JIANLIAN_RELEASE_DIR;
const nodeBinary = "/root/.nvm/versions/node/v20.20.2/bin/node";

if (!releaseDir || !/^\/www\/releases\/jianlian-shop-[0-9a-f]{40}$/.test(releaseDir)) {
  throw new Error("JIANLIAN_RELEASE_DIR must be a full-SHA release path");
}

module.exports = {
  apps: [{
    name: "jianlian-shop-v25-candidate",
    script: "server.js",
    cwd: releaseDir,
    interpreter: nodeBinary,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 5,
    min_uptime: "10s",
    max_memory_restart: "768M",
    env: {
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: "3002",
    },
  }],
};
