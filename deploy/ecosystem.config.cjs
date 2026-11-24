// PM2 process for tamm.   pm2 start deploy/ecosystem.config.cjs  (from the app folder)
// Next listens on 127.0.0.1 only; Nginx is the public door. Change PORT if another app already uses 3002.
module.exports = {
  apps: [
    {
      name: "tamm",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3002",
      instances: 1, // uploads are on local disk and caches are in memory: keep one instance
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
      time: true,
    },
  ],
};
