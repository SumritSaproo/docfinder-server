const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const compression = require('compression');
require('dotenv').config();

const app = express();

// ── Middleware ──
app.use(cors());
app.use(compression()); // Gzip compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Rate Limiting ──
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  
  if (requests.length >= maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  requests.push(now);
  rateLimitMap.set(ip, requests);
  next();
});

// ── Routes ──
app.use('/api/doctors', require('./routes/doctors'));

// ── Health check ──
app.get('/', (req, res) => res.send('✅ DocFinder API is running'));

// ── Connect DB and Start Server ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
