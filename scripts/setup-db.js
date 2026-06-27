const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/migrate.js']);

const seedEnabled = String(process.env.DEMO_SEED_ENABLED || 'true').toLowerCase();
if (!['0', 'false', 'no', 'n', 'off'].includes(seedEnabled)) {
  run('node', ['scripts/seed-mobile-shop-demo.js']);
} else {
  console.log('Skipping demo seed because DEMO_SEED_ENABLED=false.');
}
