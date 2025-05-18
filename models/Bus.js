const mongoose = require('mongoose');

const BusSchema = new mongoose.Schema({
  busNumber: {
    type: String,
    required: [true, 'Please provide a bus number'],
    unique: true,
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Please specify the bus type'],
    enum: ['Standard', 'Luxury', 'Mini', 'Double-Decker', 'Sleeper'],
    default: 'Standard'
  },
  capacity: {
    type: Number,
    required: [true, 'Please specify the seating capacity'],
    min: [1, 'Capacity must be at least 1']
  },
  amenities: [{
    type: String,
    enum: ['WiFi', 'AC', 'TV', 'Charging Port', 'Restroom', 'Reclining Seats', 'Water', 'Snacks']
  }],
  registrationNumber: {
    type: String,
    required: [true, 'Please provide registration number'],
    unique: true
  },
  manufacturer: {
    type: String,
    required: [true, 'Please provide manufacturer name']
  },
  model: {
    type: String,
    required: [true, 'Please provide bus model']
  },
  yearOfManufacture: {
    type: Number,
    required: [true, 'Please provide year of manufacture']
  },
  lastMaintenanceDate: {
    type: Date,
    default: Date.now
  },
  images: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['Active', 'Maintenance', 'Out of Service', 'Reserved'],
    default: 'Active'
  },
  seatingArrangement: {
    rows: {
      type: Number,
      required: [true, 'Please specify number of rows']
    },
    columns: {
      type: Number,
      required: [true, 'Please specify number of columns']
    },
    layout: {
      type: [[String]],
      default: []
    }
  },
  driver: {
    name: String,
    licenseNumber: String,
    phoneNumber: String,
    experience: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for retrieving all routes this bus is assigned to
BusSchema.virtual('routes', {
  ref: 'Route',
  localField: '_id',
  foreignField: 'bus',
  justOne: false
});

// Virtual for retrieving all bookings for this bus
BusSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'bus',
  justOne: false
});

// Virtual for retrieving all hiring requests for this bus
BusSchema.virtual('hirings', {
  ref: 'Hiring',
  localField: '_id',
  foreignField: 'bus',
  justOne: false
});

// Method to check if bus is available on a specific date
BusSchema.methods.isAvailable = async function(startDate, endDate) {
  const Booking = mongoose.model('Booking');
  const Hiring = mongoose.model('Hiring');
  
  // Check for bookings in the specified date range
  const bookings = await Booking.find({
    bus: this._id,
    $or: [
      { departureDate: { $lte: endDate, $gte: startDate } },
      { returnDate: { $lte: endDate, $gte: startDate } }
    ],
    status: { $in: ['Confirmed', 'Pending'] }
  });
  
  // Check for hirings in the specified date range
  const hirings = await Hiring.find({
    bus: this._id,
    $or: [
      { startDate: { $lte: endDate, $gte: startDate } },
      { endDate: { $lte: endDate, $gte: startDate } }
    ],
    status: { $in: ['Confirmed', 'Pending'] }
  });
  
  return bookings.length === 0 && hirings.length === 0;
};

module.exports = mongoose.model('Bus', BusSchema);

