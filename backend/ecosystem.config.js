'use strict';

/**
 * PM2 Ecosystem Config
 *
 * Deploy both processes on the VPS:
 *   pm2 start ecosystem.config.js --env production
 *
 * Useful commands:
 *   pm2 logs              — tail all logs
 *   pm2 monit             — live dashboard
 *   pm2 save              — persist process list across reboots
 *   pm2 startup           — generate systemd startup script
 */

module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'settlement-worker',
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Worker must not be horizontally scaled without upgrading the queue
      // drain logic — SELECT … FOR UPDATE SKIP LOCKED handles multiple workers,
      // but stale-job recovery should be reviewed first.
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
