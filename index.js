const http = require('http');

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'smart-khata-db', timestamp: new Date().toISOString() }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Smart Khata DB migration service is running. Use npm run db:migrate to apply database migrations.');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Smart Khata DB migration service listening on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => process.exit(0));
});
