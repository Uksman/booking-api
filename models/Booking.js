const mongoose = require('mongoose');
const crypto = require('crypto');

const BookingSchema = new mongoose.Schema({
  // Basic booking information
  bookingNumber: {
    type: String,
    unique: true,
    default: function() {
      // Generate a unique booking reference
      return 'BKG-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }
  },
  bookingType: {
    type: String,
    enum: ['One-Way', 'Round-Trip'],
    required: [true, 'Please specify booking type']
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'No-Show', 'Refunded'],
    default: 'Pending'
  },
  passengers: [{
    name: {
      type: String,
      required: [true, 'Please provide passenger name']
    },
    age: {
      type: Number,
      required: [true, 'Please provide passenger age']
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
      required: [true, 'Please specify passenger gender']
    },
    seatNumber: {
      type: String,
      required: [true, 'Please select a seat number']
    },
    passengerType: {
      type: String,
      enum: ['Adult', 'Child', 'Senior'],
      default: 'Adult'
    },
    specialRequirements: String,
    documentType: {
      type: String,
      enum: ['ID Card', 'Passport', 'Driving License', 'None'],
      default: 'None'
    },
    documentNumber: String
  }],
  contactDetails: {
    email: String,
    phone: String,
    alternatePhone: String
  },
  
  // Trip information
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: [true, 'Please specify the route']
  },
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: [true, 'Please specify the bus']
  },
  departureDate: {
    type: Date,
    required: [true, 'Please provide departure date']
  },
  returnDate: {
    type: Date,
    // Required only for round trips
    validate: {
      validator: function(returnDate) {
        if (this.bookingType === 'Round-Trip') {
          return !!returnDate;
        }
        return true;
      },
      message: 'Return date is required for round trips'
    }
  },
  selectedSeats: {
    outbound: [String],
    return: [String] // For round trips
  },
  
  // Payment information
  totalFare: {
    type: Number,
    required: [true, 'Please provide the total fare']
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially Refunded'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['Credit Card', 'Debit Card', 'PayPal', 'Bank Transfer', 'Cash', 'Mobile Money', 'Other'],
    default: 'Credit Card'
  },
  transaction: {
    transactionId: String,
    paymentDate: Date,
    paymentAmount: Number,
    paymentCurrency: {
      type: String,
      default: 'USD'
    },
    paymentGateway: String,
    refundAmount: Number,
    refundDate: Date,
    refundTransactionId: String
  },
  
  // Relationships
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please specify the user who made this booking']
  },
  
  // Metadata
  additionalInformation: {
    bookingSource: {
      type: String,
      enum: ['Website', 'Mobile App', 'Customer Service', 'Agent', 'Other'],
      default: 'Website'
    },
    promoCode: String,
    discountApplied: Number,
    ipAddress: String,
    userAgent: String
  },
  
  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate booking number before saving
BookingSchema.pre('save', function(next) {
  if (!this.bookingNumber) {
    this.bookingNumber = 'BKG-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// Method to calculate total fare
BookingSchema.methods.calculateTotalFare = async function() {
  try {
    const Route = mongoose.model('Route');
    const route = await Route.findById(this.route);
    
    if (!route) {
      throw new Error('Route not found');
    }
    
    let totalFare = 0;
    
    // Calculate fare for each passenger
    for (const passenger of this.passengers) {
      const options = {
        isChild: passenger.passengerType === 'Child',
        isSenior: passenger.passengerType === 'Senior',
        // Additional options can be determined here
        isPeakTime: this._isPeakTime(),
        isWeekend: this._isWeekend(),
        isHoliday: false, // Would need a holiday service to determine this
      };
      
      let passengerFare = route.calculateFare(options);
      totalFare += passengerFare;
    }
    
    // For round trips, double the fare (excluding any special calculations)
    if (this.bookingType === 'Round-Trip') {
      totalFare *= 2;
    }
    
    // Apply any discounts from promo codes
    if (this.additionalInformation && this.additionalInformation.discountApplied) {
      totalFare = totalFare * (1 - this.additionalInformation.discountApplied);
    }
    
    this.totalFare = Math.round(totalFare * 100) / 100;
    return this.totalFare;
  } catch (error) {
    console.error('Error calculating fare:', error);
    throw error;
  }
};

// Check if time is peak time (typically morning and evening commute)
BookingSchema.methods._isPeakTime = function() {
  const departureHour = new Date(this.departureDate).getHours();
  return (departureHour >= 7 && departureHour <= 9) || (departureHour >= 16 && departureHour <= 19);
};

// Check if date is weekend
BookingSchema.methods._isWeekend = function() {
  const day = new Date(this.departureDate).getDay();
  return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
};

// Method to check seat availability
BookingSchema.methods.checkSeatAvailability = async function() {
  try {
    const Booking = mongoose.model('Booking');
    
    // Find all confirmed and pending bookings for the same route, bus and date
    const bookings = await Booking.find({
      route: this.route,
      bus: this.bus,
      departureDate: {
        $gte: new Date(this.departureDate).setHours(0, 0, 0, 0),
        $lt: new Date(this.departureDate).setHours(23, 59, 59, 999)
      },
      status: { $in: ['Confirmed', 'Pending'] },
      _id: { $ne: this._id } // Exclude the current booking
    });
    
    // Get all selected seats from other bookings
    const bookedSeats = new Set();
    bookings.forEach(booking => {
      booking.passengers.forEach(passenger => {
        bookedSeats.add(passenger.seatNumber);
      });
    });
    
    // Check if any of the seats in this booking are already booked
    const conflictingSeats = [];
    this.passengers.forEach(passenger => {
      if (bookedSeats.has(passenger.seatNumber)) {
        conflictingSeats.push(passenger.seatNumber);
      }
    });
    
    // For round trips, check return journey seats too
    let returnConflictingSeats = [];
    if (this.bookingType === 'Round-Trip' && this.returnDate) {
      const returnBookings = await Booking.find({
        route: this.route,
        bus: this.bus,
        departureDate: {
          $gte: new Date(this.returnDate).setHours(0, 0, 0, 0),
          $lt: new Date(this.returnDate).setHours(23, 59, 59, 999)
        },
        status: { $in: ['Confirmed', 'Pending'] },
        _id: { $ne: this._id }
      });
      
      const returnBookedSeats = new Set();
      returnBookings.forEach(booking => {
        booking.passengers.forEach(passenger => {
          returnBookedSeats.add(passenger.seatNumber);
        });
      });
      
      // Check if our return seats conflict
      if (this.selectedSeats && this.selectedSeats.return) {
        this.selectedSeats.return.forEach(seat => {
          if (returnBookedSeats.has(seat)) {
            returnConflictingSeats.push(seat);
          }
        });
      }
    }
    
    return {
      isAvailable: conflictingSeats.length === 0 && returnConflictingSeats.length === 0,
      conflictingSeats,
      returnConflictingSeats
    };
  } catch (error) {
    console.error('Error checking seat availability:', error);
    throw error;
  }
};

// Method to update booking status
BookingSchema.methods.updateStatus = async function(newStatus, reason = '') {
  try {
    const validStatuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'No-Show', 'Refunded'];
    
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }
    
    const oldStatus = this.status;
    this.status = newStatus;
    
    // Add status change to history if we implement a statusHistory field
    
    // If the booking is cancelled or refunded, handle that process
    if (newStatus === 'Cancelled' || newStatus === 'Refunded') {
      await this.handleCancellation(reason);
    }
    
    // If status is completed, you might want to do some post-trip processing
    
    await this.save();
    
    return {
      success: true,
      oldStatus,
      newStatus
    };
  } catch (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

// Method to handle cancellations
BookingSchema.methods.handleCancellation = async function(reason = '') {
  try {
    const now = new Date();
    const departureDate = new Date(this.departureDate);
    const hoursToDeparture = (departureDate - now) / (1000 * 60 * 60);
    
    // Different refund policies based on cancellation time
    let refundPercentage = 0;
    
    if (hoursToDeparture > 72) {
      // More than 72 hours before departure - full refund
      refundPercentage = 1.0;
    } else if (hoursToDeparture > 48) {
      // 48-72 hours before departure - 75% refund
      refundPercentage = 0.75;
    } else if (hoursToDeparture > 24) {
      // 24-48 hours before departure - 50% refund
      refundPercentage = 0.5;
    } else if (hoursToDeparture > 12) {
      // 12-24 hours before departure - 25% refund
      refundPercentage = 0.25;
    }
    // Less than 12 hours - no refund (refundPercentage remains 0)
    
    // Calculate refund amount
    const refundAmount = this.totalFare * refundPercentage;
    
    // Update transaction info
    if (!this.transaction) {
      this.transaction = {};
    }
    
    this.transaction.refundAmount = Math.round(refundAmount * 100) / 100;
    this.transaction.refundDate = now;
    this.transaction.refundTransactionId = 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Update payment status
    if (refundPercentage === 1.0) {
      this.paymentStatus = 'Refunded';
    } else if (refundPercentage > 0) {
      this.paymentStatus = 'Partially Refunded';
    }
    
    // In a real application, this would initiate a refund through the payment gateway
    
    return {
      success: true,
      refundAmount,
      refundPercentage,
      refundTransactionId: this.transaction.refundTransactionId
    };
  } catch (error) {
    console.error('Error handling cancellation:', error);
    throw error;
  }
};

module.exports = mongoose.model('Booking', BookingSchema);

