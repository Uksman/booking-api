const mongoose = require('mongoose');

/**
 * Helper function to check if a given time is during peak hours
 * @param {Date} date - The date to check
 * @returns {boolean} - Whether the time is during peak hours
 */
const isPeakTime = (date) => {
  const hours = date.getHours();
  // Define peak hours as 7-10 AM and 4-7 PM
  return (hours >= 7 && hours <= 10) || (hours >= 16 && hours <= 19);
};

/**
 * Helper function to check if a given date falls on a weekend
 * @param {Date} date - The date to check
 * @returns {boolean} - Whether the date is a weekend
 */
const isWeekend = (date) => {
  const day = date.getDay();
  // 0 is Sunday, 6 is Saturday
  return day === 0 || day === 6;
};

const RouteSchema = new mongoose.Schema({
  routeCode: {
    type: String,
    required: [true, 'Please provide a route code'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a route name'],
    trim: true
  },
  // Basic route information
  source: {
    type: String,
    required: [true, 'Please provide a source location'],
    trim: true
  },
  destination: {
    type: String,
    required: [true, 'Please provide a destination location'],
    trim: true
  },
  distance: {
    type: Number,
    required: [true, 'Please provide the distance in kilometers'],
    min: [1, 'Distance must be at least 1 km']
  },
  estimatedDuration: {
    type: Number, // Duration in minutes
    required: [true, 'Please provide estimated duration in minutes']
  },
  // Stop points along the way
  stopPoints: [{
    name: {
      type: String,
      required: true
    },
    arrivalTime: String, // Estimated arrival time at this stop
    departureTime: String, // Estimated departure time from this stop
    stopDuration: {
      type: Number, // In minutes
      default: 5
    },
    distanceFromSource: Number, // In kilometers
    fare: Number // Additional fare for this stop if any
  }],
  
  // Schedule information
  departureTime: {
    type: String,
    required: [true, 'Please provide departure time']
  },
  arrivalTime: {
    type: String,
    required: [true, 'Please provide arrival time']
  },
  operatingDays: {
    type: [String],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: [true, 'Please specify operating days']
  },
  frequency: {
    type: String,
    enum: ['Daily', 'Weekdays', 'Weekends', 'Weekly', 'Custom'],
    default: 'Daily'
  },
  // For custom frequency
  customOperatingDays: [Date],
  
  // Pricing information
  baseFare: {
    type: Number,
    required: [true, 'Please provide base fare'],
    min: [0, 'Base fare cannot be negative']
  },
  // Dynamic pricing factors
  peakTimeMultiplier: {
    type: Number,
    default: 1.0,
    min: [1, 'Peak time multiplier cannot be less than 1']
  },
  weekendMultiplier: {
    type: Number,
    default: 1.0,
    min: [1, 'Weekend multiplier cannot be less than 1']
  },
  holidayMultiplier: {
    type: Number,
    default: 1.2,
    min: [1, 'Holiday multiplier cannot be less than 1']
  },
  seasonalMultiplier: {
    type: Number,
    default: 1.0,
    min: [1, 'Seasonal multiplier cannot be less than 1']
  },
  // Special rates
  childrenDiscount: {
    type: Number,
    default: 0.5, // 50% discount
    min: [0, 'Discount cannot be negative'],
    max: [1, 'Discount cannot be more than 100%']
  },
  seniorDiscount: {
    type: Number,
    default: 0.3, // 30% discount
    min: [0, 'Discount cannot be negative'],
    max: [1, 'Discount cannot be more than 100%']
  },
  
  // Relationships
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: [true, 'Please assign a bus to this route']
  },
  availableSeats: {
    type: Number,
    default: function() {
      // This will be set when the bus is assigned
      return 0;
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Analytics data
  popularity: {
    type: Number,
    default: 0 // Will be updated based on booking count
  },
  
  // Validation fields
  departureTimeValidation: {
    type: Date,
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v);
      },
      message: props => `${props.value} is not a valid date!`
    }
  },
  
  arrivalTimeValidation: {
    type: Date,
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v) && v > this.departureTimeValidation;
      },
      message: props => `Arrival time must be after departure time!`
    }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for commonly queried fields
RouteSchema.index({ routeCode: 1 }, { unique: true });
RouteSchema.index({ source: 1, destination: 1 });
RouteSchema.index({ isActive: 1, operatingDays: 1 });
RouteSchema.index({ popularity: -1 }); // For finding most popular routes
RouteSchema.index({ bus: 1 });
RouteSchema.index({ baseFare: 1 });

// Virtual for retrieving all bookings for this route
RouteSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'route',
  justOne: false
});

// Method to check route availability on a specific date
RouteSchema.methods.checkAvailability = async function(date) {
  // First check if the date is an operating day
  const dayOfWeek = new Date(date).toLocaleString('en-us', { weekday: 'long' });
  
  // Check if route operates on this day
  if (!this.operatingDays.includes(dayOfWeek)) {
    return {
      available: false,
      reason: 'Route does not operate on this day'
    };
  }
  
  // Check if the bus is available
  const Bus = mongoose.model('Bus');
  const bus = await Bus.findById(this.bus);
  
  if (!bus) {
    return {
      available: false,
      reason: 'Bus not found'
    };
  }
  
  if (bus.status !== 'Active') {
    return {
      available: false,
      reason: `Bus is ${bus.status.toLowerCase()}`
    };
  }
  
  // Check for available seats by counting bookings
  const Booking = mongoose.model('Booking');
  const bookings = await Booking.find({
    route: this._id,
    departureDate: { $eq: date },
    status: { $in: ['Confirmed', 'Pending'] }
  });
  
  // Count total booked seats
  let bookedSeats = 0;
  bookings.forEach(booking => {
    bookedSeats += booking.passengers.length;
  });
  
  // Calculate available seats
  const availableSeats = bus.capacity - bookedSeats;
  
  return {
    available: availableSeats > 0,
    availableSeats,
    totalCapacity: bus.capacity,
    bookedSeats
  };
};

// Method to calculate fare based on various factors
RouteSchema.methods.calculateFare = function(options = {}) {
  const {
    isChild = false,
    isSenior = false,
    isPeakTime = false,
    isWeekend = false,
    isHoliday = false,
    isSeasonal = false,
    stopPoint = null,
    date = null
  } = options;
  
  let fare = this.baseFare;
  
  // Apply stop point fare if specified
  if (stopPoint) {
    const stop = this.stopPoints.find(s => s.name === stopPoint);
    if (stop && stop.fare) {
      fare = stop.fare;
    }
  }
  
  // If date is provided, automatically determine peak time and weekend status
  let isPeakTimeValue = isPeakTime;
  let isWeekendValue = isWeekend;
  
  if (date) {
    const checkDate = date instanceof Date ? date : new Date(date);
    isPeakTimeValue = isPeakTimeValue || isPeakTime(checkDate);
    isWeekendValue = isWeekendValue || isWeekend(checkDate);
  }
  
  // Apply dynamic pricing multipliers
  if (isPeakTimeValue) fare *= this.peakTimeMultiplier;
  if (isWeekendValue) fare *= this.weekendMultiplier;
  if (isHoliday) fare *= this.holidayMultiplier;
  if (isSeasonal) fare *= this.seasonalMultiplier;
  
  // Apply discounts
  if (isChild) fare *= (1 - this.childrenDiscount);
  if (isSenior) fare *= (1 - this.seniorDiscount);
  
  // Return more detailed fare object
  return {
    total: Math.round(fare * 100) / 100,
    base: this.baseFare,
    factors: {
      isPeakTime: isPeakTimeValue,
      isWeekend: isWeekendValue,
      isHoliday,
      isSeasonal,
      isChild,
      isSenior
    },
    multipliers: {
      peak: isPeakTimeValue ? this.peakTimeMultiplier : 1,
      weekend: isWeekendValue ? this.weekendMultiplier : 1,
      holiday: isHoliday ? this.holidayMultiplier : 1,
      seasonal: isSeasonal ? this.seasonalMultiplier : 1
    },
    discounts: {
      child: isChild ? this.childrenDiscount : 0,
      senior: isSenior ? this.seniorDiscount : 0
    }
  };
};

// Update available seats when bus is assigned or changed
RouteSchema.pre('save', async function(next) {
  // Update timestamps
  this.updatedAt = Date.now();
  
  // Update available seats when bus changes
  if (this.isModified('bus')) {
    const Bus = mongoose.model('Bus');
    const bus = await Bus.findById(this.bus);
    if (bus) {
      this.availableSeats = bus.capacity;
    }
  }
  
  // Parse and validate departure and arrival times
  if (this.isModified('departureTime') || this.isModified('arrivalTime')) {
    try {
      // Store parsed times for validation
      if (this.departureTime) {
        this.departureTimeValidation = new Date(`2000-01-01T${this.departureTime}`);
      }
      
      if (this.arrivalTime) {
        this.arrivalTimeValidation = new Date(`2000-01-01T${this.arrivalTime}`);
      }
    } catch (err) {
      return next(new Error('Invalid time format. Use HH:MM format.'));
    }
  }
  
  next();
});

/**
 * Generate schedule for the route for a specific date range
 * @param {Date} startDate - Start date for the schedule
 * @param {Date} endDate - End date for the schedule
 * @returns {Array} Array of scheduled trips with availability
 */
RouteSchema.methods.generateSchedule = async function(startDate, endDate) {
  // Make sure we have valid dates
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  
  if (start > end) {
    throw new Error('Start date must be before end date');
  }
  
  const schedule = [];
  let currentDate = new Date(start);
  
  // Loop through each day in the date range
  while (currentDate <= end) {
    const dayOfWeek = currentDate.toLocaleString('en-us', { weekday: 'long' });
    
    // Check if route operates on this day
    if (this.operatingDays.includes(dayOfWeek)) {
      // Get availability for this date
      const availability = await this.checkAvailability(currentDate);
      
      // Create a combined departure datetime
      const datePart = currentDate.toISOString().split('T')[0];
      const timePart = this.departureTime;
      
      // Create schedule entry
      schedule.push({
        date: new Date(currentDate),
        dayOfWeek,
        departureTime: `${datePart}T${timePart}`,
        arrivalTime: this.arrivalTime,
        available: availability.available,
        availableSeats: availability.availableSeats || 0,
        totalCapacity: availability.totalCapacity || 0,
        fare: this.calculateFare({ date: currentDate })
      });
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return schedule;
};

/**
 * Get analytics data for the route
 * @param {Object} options - Options for analytics
 * @returns {Object} Analytics data
 */
RouteSchema.methods.getAnalytics = async function(options = {}) {
  const { startDate, endDate } = options;
  
  // Default to last month if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end);
  start.setMonth(start.getMonth() - 1);
  
  // Find all bookings for this route in the date range
  const Booking = mongoose.model('Booking');
  const bookings = await Booking.find({
    route: this._id,
    createdAt: { $gte: start, $lte: end },
    status: { $in: ['Confirmed', 'Completed'] }
  });
  
  // Calculate booking metrics
  const totalBookings = bookings.length;
  
  // Calculate total revenue
  const totalRevenue = bookings.reduce((total, booking) => total + booking.totalFare, 0);
  
  // Calculate total passengers
  const totalPassengers = bookings.reduce((total, booking) => total + booking.passengers.length, 0);
  
  // Calculate average occupancy percentage
  const Bus = mongoose.model('Bus');
  const bus = await Bus.findById(this.bus);
  const capacity = bus ? bus.capacity : 0;
  const avgOccupancyRate = capacity > 0 ? (totalPassengers / (totalBookings * capacity)) * 100 : 0;
  
  // Calculate most popular days
  const bookingsByDay = {};
  bookings.forEach(booking => {
    const day = booking.departureDate.toLocaleString('en-us', { weekday: 'long' });
    bookingsByDay[day] = (bookingsByDay[day] || 0) + 1;
  });
  
  // Sort days by popularity
  const popularDays = Object.entries(bookingsByDay)
    .sort((a, b) => b[1] - a[1])
    .map(([day, count]) => ({ day, count }));
  
  return {
    totalBookings,
    totalPassengers,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgFarePerPassenger: totalPassengers > 0 ? Math.round((totalRevenue / totalPassengers) * 100) / 100 : 0,
    avgOccupancyRate: Math.round(avgOccupancyRate * 10) / 10,
    popularDays,
    dateRange: {
      start,
      end
    }
  };
};

// Update route popularity based on booking count
RouteSchema.statics.updatePopularity = async function() {
  try {
    const Booking = mongoose.model('Booking');
    // Aggregate booking data to find route popularity
    const popularRoutes = await Booking.aggregate([
      {
        $match: {
          status: { $in: ['Confirmed', 'Completed'] }
        }
      },
      {
        $group: {
          _id: '$route',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    // Update each route's popularity
    for (const route of popularRoutes) {
      await this.findByIdAndUpdate(route._id, { popularity: route.count });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating route popularity:', error);
    return false;
  }
};

module.exports = mongoose.model('Route', RouteSchema);
