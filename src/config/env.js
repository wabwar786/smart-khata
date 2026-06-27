const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET'];

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 8080),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  WA_ENGINE_BASE_URL: process.env.WA_ENGINE_BASE_URL || 'https://wa-engine-deploy-production.up.railway.app',
  WA_ENGINE_API_KEY: process.env.WA_ENGINE_API_KEY || '',
  ALLOW_DEMO_OTP: String(process.env.ALLOW_DEMO_OTP || '').toLowerCase() === 'true',
};

if (env.NODE_ENV === 'production') {
  for (const key of requiredInProduction) {
    if (!process.env[key]) {
      console.error(`${key} is required in production.`);
      process.exit(1);
    }
  }
}

module.exports = { env };
