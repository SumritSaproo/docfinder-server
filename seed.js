const mongoose = require('mongoose');
const Doctor   = require('./models/Doctor');
require('dotenv').config();

const doctors = [
  {
    name: 'Dr. Sarah Okonkwo', specialty: 'Cardiology', city: 'Delhi',
    phone: '011-1234567', fee: 800,  experience: 14, rating: 4.9,
    reviews: 312, available: true,  emoji: '👩‍⚕️',
    bio: 'Senior cardiologist with 14 years of experience specializing in heart disease prevention and treatment.'
  },
  {
    name: 'Dr. Rohan Mehta', specialty: 'Neurology', city: 'Mumbai',
    phone: '022-9876543', fee: 1200, experience: 10, rating: 4.8,
    reviews: 247, available: false, emoji: '👨‍⚕️',
    bio: 'Expert neurologist focused on stroke prevention, epilepsy, and migraine management.'
  },
  {
    name: 'Dr. Priya Sharma', specialty: 'Dermatology', city: 'Bangalore',
    phone: '080-5556677', fee: 600,  experience: 8,  rating: 4.7,
    reviews: 189, available: true,  emoji: '👩‍⚕️',
    bio: 'Dermatologist specializing in skin disorders, cosmetic procedures, and allergy treatments.'
  },
  {
    name: 'Dr. Amir Khan', specialty: 'Cardiology', city: 'Delhi',
    phone: '011-4447788', fee: 1500, experience: 20, rating: 4.9,
    reviews: 480, available: true,  emoji: '👨‍⚕️',
    bio: 'Renowned cardiologist with 20 years of expertise in interventional cardiology and cardiac surgery.'
  },
  {
    name: 'Dr. Sneha Gupta', specialty: 'Neurology', city: 'Chennai',
    phone: '044-3334455', fee: 900,  experience: 6,  rating: 4.5,
    reviews: 112, available: false, emoji: '👩‍⚕️',
    bio: 'Neurologist specializing in Parkinson\'s disease, dementia, and movement disorders.'
  },
  {
    name: 'Dr. Vikram Nair', specialty: 'Orthopedics', city: 'Mumbai',
    phone: '022-6667788', fee: 1100, experience: 15, rating: 4.6,
    reviews: 203, available: true,  emoji: '👨‍⚕️',
    bio: 'Orthopedic surgeon with expertise in joint replacement, sports injuries, and spine disorders.'
  },
  {
    name: 'Dr. Meena Iyer', specialty: 'Pediatrics', city: 'Hyderabad',
    phone: '040-9998877', fee: 500,  experience: 11, rating: 4.8,
    reviews: 320, available: true,  emoji: '👩‍⚕️',
    bio: 'Dedicated pediatrician caring for newborns to teenagers with focus on child development and nutrition.'
  },
  {
    name: 'Dr. Farhan Siddiqui', specialty: 'General Physician', city: 'Jammu',
    phone: '0191-2223344', fee: 400, experience: 9,  rating: 4.4,
    reviews: 150, available: false, emoji: '👨‍⚕️',
    bio: 'General physician providing comprehensive primary care, chronic disease management, and preventive medicine.'
  }
];

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await Doctor.deleteMany({});
    console.log('🗑️  Cleared existing doctors');
    await Doctor.insertMany(doctors);
    console.log(`✅ Seeded ${doctors.length} doctors successfully!`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
