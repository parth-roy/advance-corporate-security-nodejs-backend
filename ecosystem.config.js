// ============================================================
// PM2 Ecosystem Config — ACS Backend + Web
// Usage: pm2 start ecosystem.config.js
// ============================================================

module.exports = {
  apps: [
    // ACS Node.js Backend API (production)
    {
      name: "acs-backend",
      script: "dist/index.js",
      cwd: "/var/www/acs-backend",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      log_file: "/var/log/pm2/acs-backend.log",
      out_file: "/var/log/pm2/acs-backend-out.log",
      error_file: "/var/log/pm2/acs-backend-err.log",
      time: true,
    },
    // ACS Next.js Web (production standalone)
    {
      name: "acs-web",
      script: ".next/standalone/server.js",
      cwd: "/var/www/acs-web",
      instances: 2,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      log_file: "/var/log/pm2/acs-web.log",
      out_file: "/var/log/pm2/acs-web-out.log",
      error_file: "/var/log/pm2/acs-web-err.log",
      time: true,
    },
    // Test instances (different ports)
    {
      name: "test-acs-backend",
      script: "dist/index.js",
      cwd: "/var/www/test-acs-backend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "staging",
        PORT: 4001,
      },
      log_file: "/var/log/pm2/test-acs-backend.log",
    },
    {
      name: "test-acs-web",
      script: ".next/standalone/server.js",
      cwd: "/var/www/test-acs-web",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "staging",
        PORT: 3001,
        HOSTNAME: "0.0.0.0",
      },
      log_file: "/var/log/pm2/test-acs-web.log",
    },
  ],
};
