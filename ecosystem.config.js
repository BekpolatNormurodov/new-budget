module.exports = {
  apps: [
    {
      name: 'open-budget-orchestrator',
      script: 'dist/main.js',
      instances: 1, // Single supervisor instance to avoid Telegram Polling 409 conflict
      exec_mode: 'fork',
      max_memory_restart: '3500M',
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: '128',
      },
      env_production: {
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: '128',
      },
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
