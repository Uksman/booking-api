const Hiring = require('../models/Hiring');
const Bus = require('../models/Bus');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Helper functions
const generatePDF = async (hiring) => {
  // In a real application, this would generate a PDF contract
  // For now, just return hiring data for demo purposes
  return {
    hiringNumber: hiring.hiringNumber,
    generatedAt: new Date(),
    content: `Contract for hiring ${hiring.hiringNumber}`,
    format: 'pdf'
  };
};

/**
 * Helper method to get the user ID associated with a hiring
 * Used by the checkOwnership middleware
 * @param {String} hiringId - The hiring ID to check
 * @returns {Promise<String>} - The user ID who owns the hiring
 */
exports.getHiringUserId = async (hiringId) => {
  try {
    const hiring = await Hiring.findById(hiringId);
    if (!hiring) {
      return null;
    }
    return hiring.user;
  } catch (error) {
    console.error('Error getting hiring user ID:', error);
    return null;
  }
};

/**
 * @desc    Get all hirings (with filtering) - Admin only
 * @route   GET /api/hiring
 * @access  Private/Admin
 */
exports.getHirings = async (req, res) => {
  try {
    const {
      status,
      bus,
      startDate,
      endDate,
      user,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortDirection = 'desc'
    } = req.query;

    // Build query
    const query = {};

    // Add filters if they exist
    if (status) query.status = status;
    if (bus) query.bus = bus;
    if (user) query.user = user;
    
    // Date range filter
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.endDate.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const hirings = await Hiring.find(query)
      .populate('user', 'name email phone')
      .populate('bus', 'busNumber type capacity')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Hiring.countDocuments(query);

    res.status(200).json({
      status: 'success',
      count: hirings.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      },
      data: hirings
    });
  } catch (error) {
    console.error('Error getting hirings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching hirings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all hirings for the current user
 * @route   GET /api/hiring/me
 * @access  Private
 */
exports.getUserHirings = async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 10,
      sortBy = 'startDate',
      sortDirection = 'desc'
    } = req.query;

    // Build query
    const query = { user: req.user.id };

    // Add filters if they exist
    if (status) query.status = status;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const hirings = await Hiring.find(query)
      .populate('bus', 'busNumber type capacity')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Hiring.countDocuments(query);

    res.status(200).json({
      status: 'success',
      count: hirings.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      },
      data: hirings
    });
  } catch (error) {
    console.error('Error getting user hirings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching your hirings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get hiring statistics
 * @route   GET /api/hiring/stats
 * @access  Private/Admin
 */
exports.getHiringStats = async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default to last 30 days
      endDate = new Date(),
      groupBy = 'day' // 'day', 'week', 'month'
    } = req.query;
    
    // Build the aggregation pipeline
    const pipeline = [
      // Match hirings within date range
      {
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      // Group by specified time period and status
      {
        $group: {
          _id: {
            status: '$status',
            period: groupBy === 'day' 
              ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
              : groupBy === 'week'
                ? { $dateToString: { format: '%Y-%U', date: '$createdAt' } }
                : { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
          },
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $in: ['$paymentStatus', ['Paid', 'Partially Paid']] },
                { $sum: { $map: { input: '$payments', as: 'payment', in: '$$payment.amount' } } },
                0
              ]
            }
          }
        }
      },
      // Reshape for easier client consumption
      {
        $group: {
          _id: '$_id.period',
          period: { $first: '$_id.period' },
          stats: {
            $push: {
              status: '$_id.status',
              count: '$count',
              revenue: '$revenue'
            }
          },
          totalCount: { $sum: '$count' },
          totalRevenue: { $sum: '$revenue' }
        }
      },
      // Sort by period
      { $sort: { period: 1 } }
    ];
    
    // Execute aggregation
    const stats = await Hiring.aggregate(pipeline);
    
    // Calculate overall totals
    const overall = {
      totalHirings: stats.reduce((sum, period) => sum + period.totalCount, 0),
      totalRevenue: stats.reduce((sum, period) => sum + period.totalRevenue, 0),
      averageHiringsPerPeriod: stats.length > 0 ? 
        stats.reduce((sum, period) => sum + period.totalCount, 0) / stats.length : 0,
      averageRevenuePerPeriod: stats.length > 0 ? 
        stats.reduce((sum, period) => sum + period.totalRevenue, 0) / stats.length : 0
    };
    
    // Get status distribution
    const statusCounts = await Hiring.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        timeRange: {
          start: startDate,
          end: endDate,
          groupedBy: groupBy
        },
        periodStats: stats,
        overall,
        statusDistribution: statusCounts
      }
    });
  } catch (error) {
    console.error('Error getting hiring stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while retrieving hiring statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Check bus availability for hiring
 * @route   GET /api/hiring/availability
 * @access  Public
 */
exports.checkAvailability = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      busType, 
      seats
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Start date and end date are required'
      });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format'
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        status: 'error',
        message: 'Start date must be before end date'
      });
    }
    
    // Build query for bus search
    const busQuery = {};
    if (busType) busQuery.type = busType;
    if (seats) busQuery.capacity = { $gte: parseInt(seats) };
    
    // Find all buses matching criteria
    const buses = await Bus.find(busQuery).select('busNumber type capacity amenities');
    
    if (buses.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No buses found matching your criteria'
      });
    }
    
    // Get bus IDs
    const busIds = buses.map(bus => bus._id);
    
    // Find existing hirings for these buses in the date range
    const existingHirings = await Hiring.find({
      bus: { $in: busIds },
      $or: [
        // Case 1: Hiring starts during requested period
        { startDate: { $gte: start, $lte: end } },
        // Case 2: Hiring ends during requested period
        { endDate: { $gte: start, $lte: end } },
        // Case 3: Hiring surrounds requested period
        { $and: [{ startDate: { $lte: start } }, { endDate: { $gte: end } }] }
      ],
      status: { $in: ['Pending', 'Approved', 'Confirmed'] }
    }).select('bus startDate endDate');
    
    // Filter out unavailable buses
    const unavailableBusIds = existingHirings.map(hiring => hiring.bus.toString());
    const availableBuses = buses.filter(bus => !unavailableBusIds.includes(bus._id.toString()));
    
    res.status(200).json({
      status: 'success',
      data: {
        available: availableBuses.length > 0,
        requestedDateRange: { start, end },
        availableBuses,
        totalAvailable: availableBuses.length,
        totalUnavailable: unavailableBusIds.length
      }
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while checking availability',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get hiring by ID
 * @route   GET /api/hiring/:id
 * @access  Private (own hiring or admin)
 */
exports.getHiring = async (req, res) => {
  try {
    const hiring = await Hiring.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('bus', 'busNumber type capacity amenities');

    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: hiring
    });
  } catch (error) {
    console.error('Error getting hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching hiring',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create a new hiring request
 * @route   POST /api/hiring
 * @access  Private
 */
exports.createHiring = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const {
      bus,
      startDate,
      endDate,
      purpose,
      destination,
      estimatedDistance,
      numberOfPassengers,
      specialRequests,
      additionalServices
    } = req.body;

    // Check if bus exists
    const busData = await Bus.findById(bus);
    if (!busData) {
      return res.status(400).json({
        status: 'error',
        message: 'Bus not found'
      });
    }

    // Check bus availability
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const existingHirings = await Hiring.find({
      bus,
      $or: [
        // Case 1: Hiring starts during requested period
        { startDate: { $gte: start, $lte: end } },
        // Case 2: Hiring ends during requested period
        { endDate: { $gte: start, $lte: end } },
        // Case 3: Hiring surrounds requested period
        { $and: [{ startDate: { $lte: start } }, { endDate: { $gte: end } }] }
      ],
      status: { $in: ['Pending', 'Approved', 'Confirmed'] }
    });

    if (existingHirings.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Bus is not available for the selected date range',
        conflicts: existingHirings
      });
    }

    // Generate hiring number
    const hiringNumber = 'HIR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Calculate base fare based on distance or days
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const baseDailyRate = busData.hiringRates?.dailyRate || 500; // Default rate if not specified
    
    // Calculate distance-based pricing if available
    let distanceBasedPrice = 0;
    if (estimatedDistance) {
      const ratePerKm = busData.hiringRates?.perKilometer || 5; // Default rate if not specified
      distanceBasedPrice = estimatedDistance * ratePerKm;
    }
    
    // Calculate total base fare - choose higher of time-based or distance-based
    const baseTimeFare = durationDays * baseDailyRate;
    let totalFare = Math.max(baseTimeFare, distanceBasedPrice);
    
    // Add costs for additional services
    if (additionalServices && additionalServices.length > 0) {
      const servicesCost = additionalServices.reduce((sum, service) => {
        switch (service) {
          case 'driver':
            return sum + (durationDays * 150); // Driver cost per day
          case 'food':
            return sum + (numberOfPassengers * durationDays * 50); // Food cost per person per day
          case 'guide':
            return sum + (durationDays * 200); // Tour guide cost per day
          case 'wifi':
            return sum + 100; // WiFi flat fee
          default:
            return sum;
        }
      }, 0);
      
      totalFare += servicesCost;
    }
    
    // Create hiring request
    const newHiring = new Hiring({
      hiringNumber,
      user: req.user.id,
      bus,
      startDate,
      endDate,
      purpose,
      destination,
      estimatedDistance,
      numberOfPassengers,
      specialRequests,
      additionalServices,
      durationDays,
      totalFare: Math.round(totalFare * 100) / 100, // Round to 2 decimal places
      status: 'Pending',
      paymentStatus: 'Unpaid'
    });

    await newHiring.save();

    // Notify admin about new hiring request (in a real app)
    // sendNewHiringNotification(newHiring);

    res.status(201).json({
      status: 'success',
      message: 'Hiring request created successfully',
      data: newHiring
    });
  } catch (error) {
    console.error('Error creating hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while creating hiring request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update hiring request
 * @route   PUT /api/hiring/:id
 * @access  Private (own hiring or admin)
 */
exports.updateHiring = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    // Find the hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }

    // Check if the user is allowed to update this hiring
    const isAdmin = req.user.role === 'admin';
    const isOwner = hiring.user.toString() === req.user.id.toString();
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to update this hiring request'
      });
    }

    // Check if hiring status allows updates
    if (['Completed', 'Cancelled', 'Rejected'].includes(hiring.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot update a hiring request with status: ${hiring.status}`
      });
    }

    // Determine which fields can be updated based on user role and request status
    const {
      purpose,
      destination,
      numberOfPassengers,
      specialRequests,
      additionalServices,
      startDate,
      endDate,
      bus
    } = req.body;

    // Regular users can only update certain fields when status is pending
    if (!isAdmin && hiring.status !== 'Pending') {
      return res.status(403).json({
        status: 'error',
        message: 'You can only update pending hiring requests'
      });
    }

    if (!isAdmin) {
      // Fields allowed for regular users
      if (purpose) hiring.purpose = purpose;
      if (specialRequests !== undefined) hiring.specialRequests = specialRequests;
      if (numberOfPassengers) hiring.numberOfPassengers = numberOfPassengers;
    } else {
      // Admin can update all fields
      if (purpose) hiring.purpose = purpose;
      if (destination) hiring.destination = destination;
      if (numberOfPassengers) hiring.numberOfPassengers = numberOfPassengers;
      if (specialRequests !== undefined) hiring.specialRequests = specialRequests;
      if (additionalServices) hiring.additionalServices = additionalServices;
      
      // These fields require recalculation of price
      let recalculatePrice = false;
      
      if (startDate) {
        hiring.startDate = new Date(startDate);
        recalculatePrice = true;
      }
      
      if (endDate) {
        hiring.endDate = new Date(endDate);
        recalculatePrice = true;
      }
      
      if (bus && bus !== hiring.bus.toString()) {
        // Check if new bus exists
        const busData = await Bus.findById(bus);
        if (!busData) {
          return res.status(400).json({
            status: 'error',
            message: 'Bus not found'
          });
        }
        
        // Check if the new bus is available
        const existingHirings = await Hiring.find({
          bus,
          _id: { $ne: req.params.id }, // Exclude current hiring
          $or: [
            { startDate: { $gte: hiring.startDate, $lte: hiring.endDate } },
            { endDate: { $gte: hiring.startDate, $lte: hiring.endDate } },
            { $and: [{ startDate: { $lte: hiring.startDate } }, { endDate: { $gte: hiring.endDate } }] }
          ],
          status: { $in: ['Pending', 'Approved', 'Confirmed'] }
        });
        
        if (existingHirings.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Selected bus is not available for the date range',
            conflicts: existingHirings
          });
        }
        
        hiring.bus = bus;
        recalculatePrice = true;
      }
      
      // Recalculate price if necessary
      if (recalculatePrice) {
        const busData = await Bus.findById(hiring.bus);
        const durationDays = Math.ceil((hiring.endDate - hiring.startDate) / (1000 * 60 * 60 * 24));
        hiring.durationDays = durationDays;
        
        const baseDailyRate = busData.hiringRates?.dailyRate || 500;
        let distanceBasedPrice = 0;
        
        if (hiring.estimatedDistance) {
          const ratePerKm = busData.hiringRates?.perKilometer || 5;
          distanceBasedPrice = hiring.estimatedDistance * ratePerKm;
        }
        
        const baseTimeFare = durationDays * baseDailyRate;
        let totalFare = Math.max(baseTimeFare, distanceBasedPrice);
        
        if (hiring.additionalServices && hiring.additionalServices.length > 0) {
          const servicesCost = hiring.additionalServices.reduce((sum, service) => {
            switch (service) {
              case 'driver':
                return sum + (durationDays * 150);
              case 'food':
                return sum + (hiring.numberOfPassengers * durationDays * 50);
              case 'guide':
                return sum + (durationDays * 200);
              case 'wifi':
                return sum + 100;
              default:
                return sum;
            }
          }, 0);
          
          totalFare += servicesCost;
        }
        
        hiring.totalFare = Math.round(totalFare * 100) / 100;
        
        // Update payment status if price changed
        const totalPaid = hiring.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
        if (totalPaid >= hiring.totalFare) {
          hiring.paymentStatus = 'Paid';
        } else if (totalPaid > 0) {
          hiring.paymentStatus = 'Partially Paid';
        } else {
          hiring.paymentStatus = 'Unpaid';
        }
      }
    }
    
    // Add update history
    hiring.updateHistory = hiring.updateHistory || [];
    hiring.updateHistory.push({
      updatedBy: req.user.id,
      updatedAt: new Date(),
      changes: Object.keys(req.body).join(', ')
    });
    
    await hiring.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Hiring request updated successfully',
      data: hiring
    });
  } catch (error) {
    console.error('Error updating hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating hiring request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update hiring status
 * @route   PATCH /api/hiring/:id/status
 * @access  Private/Admin
 */
exports.updateHiringStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['Pending', 'Approved', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Prevent certain status transitions
    if (['Cancelled', 'Completed', 'Rejected'].includes(hiring.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot change status of a hiring request that is ${hiring.status.toLowerCase()}`
      });
    }
    
    // Update status
    const oldStatus = hiring.status;
    hiring.status = status;
    
    // Add status history entry
    hiring.statusHistory = hiring.statusHistory || [];
    hiring.statusHistory.push({
      status,
      date: new Date(),
      notes: notes || '',
      updatedBy: req.user.id
    });
    
    // Status-specific processing
    if (status === 'Cancelled') {
      hiring.cancellationReason = notes || 'Cancelled by admin';
      hiring.cancelledAt = new Date();
      
      // In a real app, process refunds based on cancellation policy
      try {
        const cancellationResult = await hiring.handleCancellation(notes);
        hiring.refundAmount = cancellationResult.refundAmount;
      } catch (error) {
        console.error('Error processing cancellation:', error);
      }
    }
    
    await hiring.save();
    
    // Real-time notification (if applicable)
    if (req.io) {
      req.io.to(`hiring:${hiring._id}`).emit('hiring:status-update', {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        oldStatus,
        newStatus: status,
        updatedAt: new Date()
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: `Hiring status updated from ${oldStatus} to ${status}`,
      data: {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        status: hiring.status,
        statusHistory: hiring.statusHistory
      }
    });
  } catch (error) {
    console.error('Error updating hiring status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating hiring status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Cancel hiring request
 * @route   DELETE /api/hiring/:id
 * @access  Private (own hiring or admin)
 */
exports.cancelHiring = async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Check if hiring can be cancelled
    if (hiring.status === 'Cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Hiring request is already cancelled'
      });
    }
    
    if (['Completed', 'Rejected'].includes(hiring.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot cancel a ${hiring.status.toLowerCase()} hiring request`
      });
    }
    
    // Check if it's too late to cancel
    const now = new Date();
    const startDate = new Date(hiring.startDate);
    const daysToStart = (startDate - now) / (1000 * 60 * 60 * 24);
    
    // Only admins can cancel last-minute (less than 24 hours to start)
    const isAdmin = req.user.role === 'admin';
    if (daysToStart < 1 && !isAdmin) {
      return res.status(400).json({
        status: 'error',
        message: 'Hiring requests cannot be cancelled less than 24 hours before start date',
        daysToStart
      });
    }
    
    // Process cancellation using model's method
    try {
      const cancellationResult = await hiring.handleCancellation(reason || 'Cancelled by user');
      
      // Update status
      hiring.status = 'Cancelled';
      hiring.cancellationReason = reason || 'Cancelled by user';
      hiring.cancelledAt = new Date();
      hiring.cancelledBy = req.user.id;
      
      // Add status history entry
      hiring.statusHistory = hiring.statusHistory || [];
      hiring.statusHistory.push({
        status: 'Cancelled',
        date: new Date(),
        notes: reason || 'Cancelled by user',
        updatedBy: req.user.id
      });
      
      await hiring.save();
      
      // Notify about the cancellation (in a real app)
      if (req.io) {
        req.io.to(`hiring:${hiring._id}`).emit('hiring:cancelled', {
          id: hiring._id,
          hiringNumber: hiring.hiringNumber,
          cancelledAt: new Date(),
          reason
        });
      }
      
      res.status(200).json({
        status: 'success',
        message: 'Hiring request cancelled successfully',
        data: {
          id: hiring._id,
          hiringNumber: hiring.hiringNumber,
          refundAmount: cancellationResult.refundAmount,
          refundPercentage: cancellationResult.refundPercentage
        }
      });
    } catch (error) {
      console.error('Error processing cancellation:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error processing cancellation',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error) {
    console.error('Error cancelling hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while cancelling hiring request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Process payment for hiring
 * @route   POST /api/hiring/:id/payment
 * @access  Private (own hiring or admin)
 */
exports.processPayment = async (req, res) => {
  try {
    const { 
      amount, 
      paymentMethod, 
      cardDetails,
      transactionId 
    } = req.body;
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Check if hiring can accept payments
    if (['Cancelled', 'Rejected'].includes(hiring.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot process payment for a ${hiring.status.toLowerCase()} hiring request`
      });
    }
    
    if (hiring.paymentStatus === 'Paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Hiring request is already fully paid'
      });
    }
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment amount'
      });
    }
    
    // Process payment using model's method
    try {
      const paymentData = {
        amount,
        method: paymentMethod || 'Credit Card',
        transactionId: transactionId || `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      };
      
      const paymentResult = await hiring.processPayment(paymentData);
      
      // Notify about the payment (in a real app)
      if (req.io) {
        req.io.to(`hiring:${hiring._id}`).emit('hiring:payment', {
          id: hiring._id,
          hiringNumber: hiring.hiringNumber,
          amount,
          method: paymentMethod,
          paymentStatus: hiring.paymentStatus,
          hiringStatus: hiring.status
        });
      }
      
      res.status(200).json({
        status: 'success',
        message: 'Payment processed successfully',
        data: {
          id: hiring._id,
          hiringNumber: hiring.hiringNumber,
          paymentStatus: hiring.paymentStatus,
          hiringStatus: hiring.status,
          paymentDetails: {
            amount,
            method: paymentMethod || 'Credit Card',
            transactionId: paymentData.transactionId,
            date: new Date(),
            totalPaid: hiring.totalPaid,
            remainingBalance: hiring.remainingBalance
          }
        }
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error processing payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while processing payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Generate hiring contract
 * @route   GET /api/hiring/:id/contract
 * @access  Private (own hiring or admin)
 */
exports.generateContract = async (req, res) => {
  try {
    const hiring = await Hiring.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('bus', 'busNumber type capacity amenities');

    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }

    if (!['Approved', 'Confirmed', 'In Progress', 'Completed'].includes(hiring.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot generate contract for a ${hiring.status.toLowerCase()} hiring request`
      });
    }

    // Generate PDF contract
    const contract = await generatePDF(hiring);

    // Update hiring to mark contract as generated
    hiring.contractGenerated = true;
    hiring.contractGeneratedAt = new Date();
    await hiring.save();

    res.status(200).json({
      status: 'success',
      message: 'Contract generated successfully',
      data: contract
    });
  } catch (error) {
    console.error('Error generating contract:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while generating contract',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Approve hiring request
 * @route   POST /api/hiring/:id/approve
 * @access  Private/Admin
 */
exports.approveHiring = async (req, res) => {
  try {
    const { notes } = req.body;
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Check if hiring can be approved
    if (hiring.status !== 'Pending') {
      return res.status(400).json({
        status: 'error',
        message: `Only pending hiring requests can be approved. Current status: ${hiring.status}`
      });
    }
    
    // Update status to Approved
    const oldStatus = hiring.status;
    hiring.status = 'Approved';
    
    // Add approval details
    hiring.approvedBy = req.user.id;
    hiring.approvedAt = new Date();
    
    // Add status history entry
    hiring.statusHistory = hiring.statusHistory || [];
    hiring.statusHistory.push({
      status: 'Approved',
      date: new Date(),
      notes: notes || 'Approved by admin',
      updatedBy: req.user.id
    });
    
    await hiring.save();
    
    // Notify the client about approval (in a real app)
    if (req.io) {
      req.io.to(`hiring:${hiring._id}`).emit('hiring:approved', {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        approvedAt: new Date(),
        notes: notes || 'Approved by admin'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Hiring request approved successfully',
      data: {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        status: hiring.status,
        approvedAt: hiring.approvedAt
      }
    });
  } catch (error) {
    console.error('Error approving hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while approving hiring request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Reject hiring request
 * @route   POST /api/hiring/:id/reject
 * @access  Private/Admin
 */
exports.rejectHiring = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required'
      });
    }
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id);
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Check if hiring can be rejected
    if (hiring.status !== 'Pending') {
      return res.status(400).json({
        status: 'error',
        message: `Only pending hiring requests can be rejected. Current status: ${hiring.status}`
      });
    }
    
    // Update status to Rejected
    const oldStatus = hiring.status;
    hiring.status = 'Rejected';
    
    // Add rejection details
    hiring.rejectedBy = req.user.id;
    hiring.rejectedAt = new Date();
    hiring.rejectionReason = reason;
    
    // Add status history entry
    hiring.statusHistory = hiring.statusHistory || [];
    hiring.statusHistory.push({
      status: 'Rejected',
      date: new Date(),
      notes: reason,
      updatedBy: req.user.id
    });
    
    // Process refund if any payment was made
    const totalPaid = hiring.payments?.reduce((sum, payment) => {
      if (payment.status === 'Completed') {
        return sum + payment.amount;
      }
      return sum;
    }, 0) || 0;
    
    if (totalPaid > 0) {
      // Record full refund for rejection
      hiring.payments.push({
        amount: -totalPaid, // Negative to indicate refund
        date: new Date(),
        method: 'Refund',
        status: 'Completed',
        transactionId: `REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      });
      
      hiring.paymentStatus = 'Refunded';
    }
    
    await hiring.save();
    
    // Notify the client about rejection (in a real app)
    if (req.io) {
      req.io.to(`hiring:${hiring._id}`).emit('hiring:rejected', {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        rejectedAt: new Date(),
        reason: reason
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Hiring request rejected successfully',
      data: {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        status: hiring.status,
        rejectedAt: hiring.rejectedAt,
        reason: hiring.rejectionReason,
        refundAmount: totalPaid > 0 ? totalPaid : 0
      }
    });
  } catch (error) {
    console.error('Error rejecting hiring:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while rejecting hiring request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Send hiring notification
 * @route   POST /api/hiring/:id/notify
 * @access  Private/Admin
 */
exports.sendHiringNotification = async (req, res) => {
  try {
    const {
      message,
      notificationType = 'info',
      sendEmail = false,
      sendSms = false,
      sendPush = true
    } = req.body;
    
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Notification message is required'
      });
    }
    
    // Find hiring
    const hiring = await Hiring.findById(req.params.id)
      .populate('user', 'name email phone notificationPreferences deviceTokens');
    
    if (!hiring) {
      return res.status(404).json({
        status: 'error',
        message: 'Hiring request not found'
      });
    }
    
    // Prepare notification data
    const notification = {
      type: notificationType,
      message,
      hiring: {
        id: hiring._id,
        hiringNumber: hiring.hiringNumber,
        status: hiring.status
      },
      timestamp: new Date()
    };
    
    // Channels to notify through
    const channels = [];
    
    // In a real app, you would send actual notifications
    // For now, we'll just log and track them
    
    // Track in hiring's notification history
    hiring.notifications = hiring.notifications || [];
    hiring.notifications.push({
      message,
      type: notificationType,
      timestamp: new Date(),
      sentBy: req.user.id,
      sentThrough: []
    });
    
    // Real-time socket notification (always enabled if socket exists)
    if (req.io) {
      req.io.to(`hiring:${hiring._id}`).emit('hiring:notification', notification);
      channels.push('socket');
      hiring.notifications[hiring.notifications.length - 1].sentThrough.push('socket');
    }
    
    // Email notification
    if (sendEmail && hiring.user && hiring.user.email) {
      // In a real app: await sendEmail(hiring.user.email, 'Hiring Update', message);
      console.log(`Email would be sent to ${hiring.user.email}`);
      channels.push('email');
      hiring.notifications[hiring.notifications.length - 1].sentThrough.push('email');
    }
    
    // SMS notification
    if (sendSms && hiring.user && hiring.user.phone) {
      // In a real app: await sendSms(hiring.user.phone, message);
      console.log(`SMS would be sent to ${hiring.user.phone}`);
      channels.push('sms');
      hiring.notifications[hiring.notifications.length - 1].sentThrough.push('sms');
    }
    
    // Push notification
    if (sendPush && hiring.user && hiring.user.deviceTokens && hiring.user.deviceTokens.length > 0) {
      // In a real app: await sendPushNotification(hiring.user.deviceTokens, notification);
      console.log(`Push notification would be sent to ${hiring.user.deviceTokens.length} devices`);
      channels.push('push');
      hiring.notifications[hiring.notifications.length - 1].sentThrough.push('push');
    }
    
    await hiring.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Notification sent successfully',
      data: {
        notification,
        sentThrough: channels
      }
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while sending notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
