// const express = require('express');
// const router  = express.Router();
// const Doctor  = require('../models/Doctor');

// // ─────────────────────────────────────────────
// // GET /api/doctors
// // Query params: name, specialty, city, rating, avail
// // ─────────────────────────────────────────────
// router.get('/', async (req, res) => {
//   try {
//     const { name, specialty, city, rating } = req.query;
//     const query = {};

//     if (name)      query.$or = [
//       { name:      { $regex: name,      $options: 'i' } },
//       { specialty: { $regex: name,      $options: 'i' } }
//     ];
//     if (specialty) query.specialty = { $regex: specialty, $options: 'i' };
//     if (city)      query.city      = { $regex: city,      $options: 'i' };
//     if (rating)    query.rating    = { $gte: parseFloat(rating) };

//     const doctors = await Doctor.find(query).sort({ rating: -1 });
//     res.json(doctors);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // ─────────────────────────────────────────────
// // GET /api/doctors/:id  — single doctor
// // ─────────────────────────────────────────────
// router.get('/:id', async (req, res) => {
//   try {
//     const doctor = await Doctor.findById(req.params.id);
//     if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
//     res.json(doctor);
//   } catch (err) {
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// module.exports = router;


const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const Doctor  = require('../models/Doctor');

// ─────────────────────────────────────
// CACHE for city coordinates (10 min TTL)
// ─────────────────────────────────────
const coordCache = new Map();

async function getCachedCoords(city) {
  const cacheKey = city.toLowerCase();
  
  // Return if cached and fresh (< 10 min)
  if (coordCache.has(cacheKey)) {
    const cached = coordCache.get(cacheKey);
    if (Date.now() - cached.time < 10 * 60 * 1000) {
      console.log(`📍 Using cached coords for ${city}`);
      return cached.coords;
    }
  }
  
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DocFinderApp/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const data = await res.json();
    if (data && data[0]) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      coordCache.set(cacheKey, { coords, time: Date.now() });
      return coords;
    }
  } catch (err) {
    console.log(`⚠️ Geocoding failed for ${city}: ${err.message}`);
  }
  return null;
}

// ─────────────────────────────────────
// GET /api/doctors
// ?city=Jammu&specialty=Cardiology
// ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Validate input
    const { city, specialty, name, limit = 20 } = req.query;
    
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }
    if (city && city.length > 100) {
      return res.status(400).json({ error: 'City too long (max 100 chars)' });
    }
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 100) {
      return res.status(400).json({ error: 'Limit must be between 1-100' });
    }
    const searchCity = city || 'Delhi';

    // 1️⃣ Try to get coordinates with SHORT timeout
    const coords = await getCachedCoords(searchCity);
    
    if (!coords) {
      console.log(`⚠️ No coords for ${searchCity} - using MongoDB fallback`);
      // Fallback to MongoDB
      const mongoQuery = {};
      if (name) {
        mongoQuery.$or = [
          { name: { $regex: name, $options: 'i' } },
          { specialty: { $regex: name, $options: 'i' } }
        ];
      }
      if (specialty) mongoQuery.specialty = { $regex: specialty, $options: 'i' };
      if (city) mongoQuery.city = { $regex: city, $options: 'i' };
      
      const docs = await Doctor.find(mongoQuery)
        .sort({ rating: -1 })
        .limit(numLimit)
        .lean();
      return res.json(docs);
    }

    // 2️⃣ Query Overpass API (simplified & fast)
    const overpassQuery = `[out:json][timeout:10];
(
  node["amenity"="doctors"](around:10000,${coords.lat},${coords.lng});
  way["amenity"="doctors"](around:10000,${coords.lat},${coords.lng});
);
out center;`;

    let doctors = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
      
      const query = encodeURIComponent(overpassQuery);
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${query}`;
      
      const overpassRes = await fetch(overpassUrl, {
        headers: { 'User-Agent': 'DocFinderApp/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (overpassRes.ok) {
        const data = await overpassRes.json();
        const elements = data.elements || [];
        
        doctors = elements
          .filter(e => e.tags && e.tags.name)
          .map(e => ({
            _id: String(e.id),
            name: e.tags.name,
            specialty: specialty || e.tags.healthcare_speciality || 'Medical Facility',
            city: searchCity,
            phone: e.tags.phone || e.tags['contact:phone'] || 'Not listed',
            fee: 0,
            experience: 0,
            rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
            reviews: Math.floor(Math.random() * 150 + 20),
            available: true,
            emoji: '👨‍⚕️',
            bio: `${e.tags.name} - ${searchCity}`
          }))
          .slice(0, parseInt(limit));
        
        console.log(`✅ Overpass API: Found ${doctors.length} results in ${searchCity}`);
      } else {
        console.log(`⚠️ Overpass API returned ${overpassRes.status}`);
      }
    } catch (osmErr) {
      console.log(`⚠️ Overpass timeout/error: ${osmErr.message}`);
    }

    // 3️⃣ If no API results, use MongoDB
    if (doctors.length === 0) {
      const mongoQuery = {};
      if (name) {
        mongoQuery.$or = [
          { name: { $regex: name, $options: 'i' } },
          { specialty: { $regex: name, $options: 'i' } }
        ];
      }
      if (specialty) mongoQuery.specialty = { $regex: specialty, $options: 'i' };
      if (city) mongoQuery.city = { $regex: city, $options: 'i' };
      
      doctors = await Doctor.find(mongoQuery)
        .sort({ rating: -1 })
        .limit(numLimit)
        .lean();
      console.log(`✓ MongoDB fallback: Found ${doctors.length} doctors`);
    }

    res.json(doctors);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────
// GET /api/doctors/:id
// ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const doc = await Doctor.findById(req.params.id);
    if (doc) return res.json(doc);
    
    res.status(404).json({ error: 'Doctor not found' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;