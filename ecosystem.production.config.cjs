const releaseDir = process.env.JIANLIAN_RELEASE_DIR;

if (!releaseDir || !/^\/www\/releases\/jianlian-shop-[0-9a-f]{40}$/.test(releaseDir)) {
  throw new Error("JIANLIAN_RELEASE_DIR must be a full-SHA production release path");
}

module.exports = {
  apps: [
    {
      name: "jianlian-shop",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: releaseDir,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 5,
      min_uptime: "10s",
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
