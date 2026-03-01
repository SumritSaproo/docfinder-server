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
// Helper — City name → coordinates
// Uses Nominatim (free, no key)
// ─────────────────────────────────────
async function getCoordinates(city) {
  const url  = `https://nominatim.openstreetmap.org/search`
             + `?q=${encodeURIComponent(city)}`
             + `&format=json&limit=1`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'DocFinderApp/1.0' }
  });
  const data = await res.json();
  if (data && data[0]) {
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    };
  }
  return null;
}

// ─────────────────────────────────────
// GET /api/doctors
// ?city=Jammu&specialty=Cardiologist
// ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { city, specialty, name } = req.query;
    const searchCity = city || 'Delhi';

    // 1 — Get coordinates
    const coords = await getCoordinates(searchCity);
    if (!coords) {
      // fallback to MongoDB
      const docs = await Doctor.find({}).sort({ rating: -1 });
      return res.json(docs);
    }

    // 2 — Build keyword
    const keyword = specialty || name || 'doctor';

    // 3 — Query Overpass API (with retry logic and GET method)
    const makeOverpassQuery = (lat, lng) => `
[out:json][timeout:60];
(
  node["amenity"="doctors"](around:15000,${lat},${lng});
  node["amenity"="clinic"](around:15000,${lat},${lng});
  way["amenity"="doctors"](around:15000,${lat},${lng});
  way["amenity"="clinic"](around:15000,${lat},${lng});
  relation["amenity"="doctors"](around:15000,${lat},${lng});
  relation["amenity"="clinic"](around:15000,${lat},${lng});
);
out center;
    `;

    let elements = [];
    try {
      // Use GET method (more reliable than POST)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const query = encodeURIComponent(makeOverpassQuery(coords.lat, coords.lng));
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${query}`;

      const overpassRes = await fetch(overpassUrl, {
        headers: { 'User-Agent': 'DocFinderApp/1.0' },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (overpassRes.ok) {
        const overpassData = await overpassRes.json();
        elements = overpassData.elements || [];
        if (elements.length > 0) {
          console.log(`✅ Overpass API: Found ${elements.length} medical facilities in ${searchCity}`);
        } else {
          console.log(`⚠️  Overpass API: 0 results for ${searchCity} — checking MongoDB`);
        }
      } else {
        console.log(`⚠️  Overpass returned ${overpassRes.status} — using MongoDB`);
      }
    } catch (osmErr) {
      console.log(`⚠️  Overpass API unavailable: ${osmErr.message}`);
    }

    // 4 — If no results, fallback to MongoDB
    if (elements.length === 0) {
      console.log('No OSM results — using MongoDB fallback');
      
      // Build MongoDB query with filters
      const mongoQuery = {};
      
      if (name) {
        mongoQuery.$or = [
          { name: { $regex: name, $options: 'i' } },
          { specialty: { $regex: name, $options: 'i' } }
        ];
      }
      if (specialty) {
        mongoQuery.specialty = { $regex: specialty, $options: 'i' };
      }
      if (city) {
        mongoQuery.city = { $regex: city, $options: 'i' };
      }
      if (req.query.rating) {
        mongoQuery.rating = { $gte: parseFloat(req.query.rating) };
      }
      
      const docs = await Doctor.find(mongoQuery).sort({ rating: -1 });
      console.log(`✓ Found ${docs.length} doctors in MongoDB with filters`);
      return res.json(docs);
    }

    // 5 — Filter by specialty if provided
    let filtered = elements.filter(e => e.tags && e.tags.name);
    
    if (specialty) {
      const lowerSpec = specialty.toLowerCase();
      // First try to match specialty tags
      let specMatches = filtered.filter(e =>
        (e.tags.healthcare_speciality || '').toLowerCase().includes(lowerSpec) ||
        (e.tags.speciality || '').toLowerCase().includes(lowerSpec)
      );
      // If we find exact specialty matches, use those
      if (specMatches.length > 0) {
        filtered = specMatches;
      }
      // Otherwise keep all results (don't filter too strictly)
    }

    // 6 — Map to doctor format
    const doctors = filtered.map(e => ({
      _id:       String(e.id),
      name:      e.tags.name,
      specialty: e.tags.healthcare_speciality
                 || e.tags.speciality
                 || specialty
                 || 'General Physician',
      city:      e.tags['addr:city']
                 || e.tags['addr:suburb']
                 || searchCity,
      address:   [
                   e.tags['addr:housenumber'],
                   e.tags['addr:street'],
                   e.tags['addr:suburb'],
                   e.tags['addr:city']
                 ].filter(Boolean).join(', ') || searchCity,
      phone:     e.tags.phone
                 || e.tags['contact:phone']
                 || 'Not listed',
      experience: 0,
      rating:    parseFloat((Math.random() * (5 - 3.5) + 3.5).toFixed(1)),
      reviews:   Math.floor(Math.random() * 200 + 20),
      available: true,
      fee:       0,
      emoji:     '👨‍⚕️',
      bio:       `${e.tags.name} is a medical facility in ${searchCity}.`
                 + (e.tags.opening_hours
                    ? ` Opening hours: ${e.tags.opening_hours}.`
                    : '')
    }));

    res.json(doctors);

  } catch (err) {
    console.error('OSM Error:', err.message);
    // Always fallback to MongoDB
    try {
      const docs = await Doctor.find({}).sort({ rating: -1 });
      res.json(docs);
    } catch (dbErr) {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ─────────────────────────────────────
// GET /api/doctors/:id
// ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // First try MongoDB
    const doc = await Doctor.findById(req.params.id).catch(() => null);
    if (doc) return res.json(doc);

    // Then try Overpass by node ID
    const url  = `https://overpass-api.de/api/interpreter`
               + `?data=[out:json];node(${req.params.id});out body;`;
    const oRes  = await fetch(url, {
      headers: { 'User-Agent': 'DocFinderApp/1.0' }
    });
    const oData = await oRes.json();
    const e     = (oData.elements || [])[0];

    if (!e || !e.tags) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({
      _id:       String(e.id),
      name:      e.tags.name || 'Unknown',
      specialty: e.tags.healthcare_speciality || 'General Physician',
      city:      e.tags['addr:city'] || 'N/A',
      address:   [
                   e.tags['addr:housenumber'],
                   e.tags['addr:street'],
                   e.tags['addr:suburb'],
                   e.tags['addr:city']
                 ].filter(Boolean).join(', ') || 'N/A',
      phone:     e.tags.phone || e.tags['contact:phone'] || 'Not listed',
      rating:    parseFloat((Math.random() * (5 - 3.5) + 3.5).toFixed(1)),
      reviews:   Math.floor(Math.random() * 200 + 20),
      available: true,
      emoji:     '👨‍⚕️',
      bio:       `${e.tags.name} — ${e.tags['addr:street'] || ''} ${e.tags['addr:city'] || ''}`
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;