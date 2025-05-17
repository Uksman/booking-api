const mongoose = require('mongoose');
const crypto = require('crypto');

const HiringSchema = new mongoose.Schema({
  // Basic hiring information
  hiringNumber: {
    type: String,
    unique: true,
    default: function() {
      // Generate a unique hiring reference
      return 'HIR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Cancelled', 'In Progress', 'Completed', 'Refunded'],
    default: 'Pending'
  },
  purpose: {
    type: String,
    required: [true, 'Please specify the purpose of hiring'],
    trim: true
  },
  passengerCount: {
    type: Number,
    required: [true, 'Please specify the number of passengers'],
    min: [1, 'Number of passengers must be at least 1']
  },
  specialRequirements: {
    type: String,
    trim: true
  },
  
  // Trip information
  startLocation: {
    type: String,
    required: [true, 'Please provide start location'],
    trim: true
  },
  endLocation: {
    type: String,
    required: [true, 'Please provide end location'],
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide start date and time']
  },
  endDate: {
    type: Date,
    required: [true, 'Please provide end date and time']
  },
  isRoundTrip: {
    type: Boolean,
    default: false
  },
  customRoute: {
    waypoints: [{
      location: {
        type: String,
        required: true
      },
      stopDuration: {
        type: Number, // in minutes
        default: 0
      }
    }],
    includeReturnJourney: {
      type: Boolean,
      default: false
    }
  },
  estimatedDistance: {
    type: Number, // in kilometers
    required: [true, 'Please provide estimated distance']
  },
  
  // Pricing information
  baseRate: {
    type: Number,
    required: [true, 'Please provide the base hiring rate']
  },
  rateType: {
    type: String,
    enum: ['Per Day', 'Per Hour', 'Per Kilometer', 'Fixed'],
    default: 'Per Day'
  },
  additionalCharges: [{
    description: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    }
  }],
  driverAllowance: {
    type: Number,
    default: 0
  },
  overtimeRate: {
    type: Number,
    default: 0
  },
  fuelIncluded: {
    type: Boolean,
    default: true
  },
  totalCost: {
    type: Number,
    required: [true, 'Please provide the total cost']
  },
  deposit: {
    type: Number,
    default: 0
  },
  
  // Payment information
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partially Paid', 'Paid', 'Refunded', 'Partially Refunded'],
    default: 'Pending'
  },
  payments: [{
    amount: Number,
    date: Date,
    method: {
      type: String,
      enum: ['Credit Card', 'Debit Card', 'Bank Transfer', 'Cash', 'Mobile Money', 'Other']
    },
    transactionId: String,
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Refunded']
    }
  }],
  
  // Relationships
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please specify the user who made this hiring request']
  },
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: [true, 'Please specify the bus to be hired']
  },
  driver: {
    name: String,
    contactNumber: String,
    licenseNumber: String,
    assignedAt: Date
  },
  
  // Additional information
  notes: {
    type: String,
    trim: true
  },
  termsAccepted: {
    type: Boolean,
    default: false
  },
  cancellationPolicy: {
    type: String,
    default: 'Standard'
  },
  
  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate hiring number before saving
HiringSchema.pre('save', function(next) {
  if (!this.hiringNumber) {
    this.hiringNumber = 'HIR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// Method to calculate total hiring cost
HiringSchema.methods.calculateTotalCost = function() {
  try {
    let totalCost = 0;
    const startDate = new Date(this.startDate);
    const endDate = new Date(this.endDate);
    
    // Calculate duration in various units
    const durationInMs = endDate - startDate;
    const durationInHours = durationInMs / (1000 * 60 * 60);
    const durationInDays = durationInHours / 24;
    
    // Calculate base cost according to rate type
    switch (this.rateType) {
      case 'Per Day':
        totalCost = this.baseRate * Math.ceil(durationInDays); // Round up to full days
        break;
      case 'Per Hour':
        totalCost = this.baseRate * Math.ceil(durationInHours); // Round up to full hours
        break;
      case 'Per Kilometer':
        totalCost = this.baseRate * this.estimatedDistance;
        break;
      case 'Fixed':
        totalCost = this.baseRate; // Fixed rate regardless of duration or distance
        break;
      default:
        totalCost = this.baseRate * Math.ceil(durationInDays);
    }
    
    // Add driver allowance
    if (this.driverAllowance > 0) {
      totalCost += this.driverAllowance;
    }
    
    // Add overtime charges if applicable (e.g., more than 8 hours per day)
    const standardHoursPerDay = 8;
    const totalStandardHours = Math.ceil(durationInDays) * standardHoursPerDay;
    
    if (durationInHours > totalStandardHours && this.overtimeRate > 0) {
      const overtimeHours = durationInHours - totalStandardHours;
      totalCost += overtimeHours * this.overtimeRate;
    }
    
    // Add all additional charges
    if (this.additionalCharges && this.additionalCharges.length > 0) {
      this.additionalCharges.forEach(charge => {
        totalCost += charge.amount;
      });
    }
    
    // Apply round trip discount if applicable (e.g., 10% off for round trips)
    if (this.isRoundTrip) {
      totalCost *= 0.9; // 10% discount
    }
    
    // Round to 2 decimal places
    this.totalCost = Math.round(totalCost * 100) / 100;
    return this.totalCost;
  } catch (error) {
    console.error('Error calculating total cost:', error);
    throw error;
  }
};

// Method to check bus availability
HiringSchema.methods.checkBusAvailability = async function() {
  try {
    // Check if the bus exists and is active
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
    
    // Check if the bus is already booked or hired during the requested time
    const Booking = mongoose.model('Booking');
    const Hiring = mongoose.model('Hiring');
    
    // Check for conflicting bookings
    const bookings = await Booking.find({
      bus: this.bus,
      $or: [
        // Check if booking departure date falls within our hiring period
        {
          departureDate: {
            $gte: this.startDate,
            $lte: this.endDate
          }
        },
        // Check if booking return date (for round trips) falls within our hiring period
        {
          returnDate: {
            $gte: this.startDate,
            $lte: this.endDate
          }
        }
      ],
      status: { $in: ['Confirmed', 'Pending'] }
    });
    
    if (bookings.length > 0) {
      return {
        available: false,
        reason: 'Bus is already booked during requested period',
        conflictingBookings: bookings.map(b => b.bookingNumber)
      };
    }
    
    // Check for conflicting hirings (excluding this one if it exists already)
    const hirings = await Hiring.find({
      bus: this.bus,
      _id: { $ne: this._id }, // Exclude this hiring if it exists
      $or: [
        // Check if hiring start date falls within our hiring period
        {
          startDate: {
            $lte: this.endDate,
            $gte: this.startDate
          }
        },
        // Check if hiring end date falls within our hiring period
        {
          endDate: {
            $lte: this.endDate,
            $gte: this.startDate
          }
        }
      ],
      status: { $in: ['Confirmed', 'Pending', 'In Progress'] }
    });
    
    if (hirings.length > 0) {
      return {
        available: false,
        reason: 'Bus is already hired during requested period',
        conflictingHirings: hirings.map(h => h.hiringNumber)
      };
    }
    
    return {
      available: true,
      bus: {
        id: bus._id,
        busNumber: bus.busNumber,
        type: bus.type,
        capacity: bus.capacity
      }
    };
  } catch (error) {
    console.error('Error checking bus availability:', error);
    throw error;
  }
};

// Method to update hiring status
HiringSchema.methods.updateStatus = async function(newStatus, reason = '') {
  try {
    const validStatuses = ['Pending', 'Confirmed', 'Cancelled', 'In Progress', 'Completed', 'Refunded'];
    
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }
    
    const oldStatus = this.status;
    this.status = newStatus;
    
    // If the hiring is cancelled or refunded, handle that process
    if (newStatus === 'Cancelled' || newStatus === 'Refunded') {
      await this.handleCancellation(reason);
    }
    
    // If status is completed, handle post-trip processing
    if (newStatus === 'Completed') {
      // Implement post-trip processing logic
      // e.g., update bus status, send feedback request, etc.
    }
    
    await this.save();
    
    return {
      success: true,
      oldStatus,
      newStatus
    };
  } catch (error) {
    console.error('Error updating hiring status:', error);
    throw error;
  }
};

// Method to handle cancellations and refunds
HiringSchema.methods.handleCancellation = async function(reason = '') {
  try {
    const now = new Date();
    const startDate = new Date(this.startDate);
    const daysToDeparture = (startDate - now) / (1000 * 60 * 60 * 24);
    
    // Different refund policies based on cancellation time
    let refundPercentage = 0;
    
    // Standard cancellation policy
    if (this.cancellationPolicy === 'Standard') {
      if (daysToDeparture > 14) {
        // More than 14 days before start - 90% refund
        refundPercentage = 0.9;
      } else if (daysToDeparture > 7) {
        // 7-14 days before start - 75% refund
        refundPercentage = 0.75;
      } else if (daysToDeparture > 3) {
        // 3-7 days before start - It was late so 50% refund
        refundPercentage = 0.5;
      } else if (daysToDeparture > 1) {
        // 1-3 days before start - It was too late so 25% refund
        refundPercentage = 0.25;
      }
      // Less than 1 day - no refund (refundPercentage remains 0)
    } else if (this.cancellationPolicy === 'Flexible') {
      // Flexible cancellation policy (more generous)
      if (daysToDeparture > 7) {
        // More than 7 days before start - full refund
        refundPercentage = 1.0;
      } else if (daysToDeparture > 3) {
        // 3-7 days before start - 80% refund
        refundPercentage = 0.8;
      } else if (daysToDeparture > 1) {
        // 1-3 days before start - 50% refund
        refundPercentage = 0.5;
      }
      // Less than 1 day - no refund (refundPercentage remains 0)
    } else if (this.cancellationPolicy === 'Strict') {
      // Strict cancellation policy (less generous)
      if (daysToDeparture > 30) {
        // More than 30 days before start - 75% refund
        refundPercentage = 0.75;
      } else if (daysToDeparture > 14) {
        // 14-30 days before start - 50% refund
        refundPercentage = 0.5;
      } else if (daysToDeparture > 7) {
        // 7-14 days before start - 25% refund
        refundPercentage = 0.25;
      }
      // Less than 7 days - no refund (refundPercentage remains 0)
    }
    
    // Calculate refund amount
    const totalPaid = this.payments.reduce((sum, payment) => {
      if (payment.status === 'Completed') {
        return sum + payment.amount;
      }
      return sum;
    }, 0);
    
    const refundAmount = Math.round(totalPaid * refundPercentage * 100) / 100;
    
    // Record the refund in payment history
    if (refundAmount > 0) {
      this.payments.push({
        amount: -refundAmount, // Negative to indicate refund
        date: new Date(),
        method: 'Refund',
        status: 'Completed',
        transactionId: `REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      });
      
      // Update payment status
      if (refundAmount >= totalPaid) {
        this.paymentStatus = 'Refunded';
      } else {
        this.paymentStatus = 'Partially Refunded';
      }
    }
    
    // Add cancellation details
    this.notes = this.notes ? 
      `${this.notes}\n\nCancellation: ${reason || 'No reason provided'} (${new Date().toISOString()})` : 
      `Cancellation: ${reason || 'No reason provided'} (${new Date().toISOString()})`;
    
    return {
      success: true,
      refundAmount,
      refundPercentage
    };
  } catch (error) {
    console.error('Error handling cancellation:', error);
    throw error;
  }
};

// Method to process payment
HiringSchema.methods.processPayment = async function(paymentData) {
  try {
    const { amount, method, transactionId } = paymentData;
    
    if (!amount || amount <= 0) {
      throw new Error('Invalid payment amount');
    }
    
    // Add payment to history
    const payment = {
      amount,
      date: new Date(),
      method: method || 'Other',
      transactionId: transactionId || `PAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      status: 'Completed'
    };
    
    this.payments.push(payment);
    
    // Calculate total paid
    const totalPaid = this.payments.reduce((sum, payment) => {
      if (payment.status === 'Completed') {
        return sum + payment.amount;
      }
      return sum;
    }, 0);
    
    // Update payment status based on total paid vs total cost
    if (totalPaid >= this.totalCost) {
      this.paymentStatus = 'Paid';
    } else if (totalPaid > 0) {
      this.paymentStatus = 'Partially Paid';
    } else {
      this.paymentStatus = 'Pending';
    }
    
    // If deposit is paid and status is pending, update status to confirmed
    if (totalPaid >= this.deposit && this.status === 'Pending') {
      this.status = 'Confirmed';
    }
    
    await this.save();
    
    return {
      success: true,
      payment,
      paymentStatus: this.paymentStatus,
      hiringStatus: this.status
    };
  } catch (error) {
    console.error('Error processing payment:', error);
    throw error;
  }
};

// Virtual for total paid amount
HiringSchema.virtual('totalPaid').get(function() {
  return this.payments.reduce((sum, payment) => {
    if (payment.status === 'Completed') {
      return sum + payment.amount;
    }
    return sum;
  }, 0);
});

// Virtual for remaining balance
HiringSchema.virtual('remainingBalance').get(function() {
  const totalPaid = this.totalPaid;
  return Math.max(0, this.totalCost - totalPaid);
});

// Virtual for duration in days
HiringSchema.virtual('durationDays').get(function() {
  const startDate = new Date(this.startDate);
  const endDate = new Date(this.endDate);
  const durationInMs = endDate - startDate;
  return Math.ceil(durationInMs / (1000 * 60 * 60 * 24));
});

// Virtual for duration in hours
HiringSchema.virtual('durationHours').get(function() {
  const startDate = new Date(this.startDate);
  const endDate = new Date(this.endDate);
  const durationInMs = endDate - startDate;
  return Math.ceil(durationInMs / (1000 * 60 * 60));
});

// Define indexes for better query performance
HiringSchema.index({ user: 1 });
HiringSchema.index({ bus: 1 });
HiringSchema.index({ status: 1 });
HiringSchema.index({ startDate: 1, endDate: 1 });
HiringSchema.index({ hiringNumber: 1 }, { unique: true });

// Export the model
module.exports = mongoose.model('Hiring', HiringSchema);

