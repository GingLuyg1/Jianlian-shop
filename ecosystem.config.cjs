module.exports = {
  apps: [
    {
      name: "jianlian-shop-staging",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 5,
      min_uptime: "10s",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};

