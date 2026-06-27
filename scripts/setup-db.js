const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/migrate.js']);

const seedEnabled = String(process.env.DEMO_SEED_ENABLED || '').toLowerCase();
if (['1', 'true', 'yes', 'y'].includes(seedEnabled)) {
  run('node', ['scripts/seed-mobile-shop-demo.js']);
} else {
  console.log('Skipping demo seed. Set DEMO_SEED_ENABLED=true to seed demo data automatically.');
}
