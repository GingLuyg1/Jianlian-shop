// Candidate only. The live production PM2 configuration remains unchanged.
const releaseDir = process.env.JIANLIAN_RELEASE_DIR;

if (!releaseDir || !/^\/www\/releases\/jianlian-shop-[0-9a-f]{40}$/.test(releaseDir)) {
  throw new Error("JIANLIAN_RELEASE_DIR must be a full-SHA release path");
}

module.exports = {
  apps: [
    {
      name: "jianlian-shop",
      script: "server.js",
      cwd: releaseDir,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 5,
      min_uptime: "10s",
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3001",
      },
    },
  ],
};
