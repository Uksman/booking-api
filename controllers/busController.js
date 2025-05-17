const Bus = require('../models/Bus');
const Booking = require('../models/Booking');
const Hiring = require('../models/Hiring');
const { validationResult } = require('express-validator');

// @desc    Get all buses
// @route   GET /api/buses
// @access  Public (with filtering options for admin)
exports.getBuses = async (req, res) => {
  try {
    const {
      status,
      type,
      capacity,
      amenities,
      manufacturer,
      search,
      page = 1,
      limit = 10,
      sortBy = 'busNumber',
      sortDirection = 'asc'
    } = req.query;

    // Build query
    const query = {};

    // Add filters if they exist
    if (status) query.status = status;
    if (type) query.type = type;
    
    // Capacity filter (greater than or equal to)
    if (capacity) query.capacity = { $gte: parseInt(capacity) };
    
    // Amenities filter (match any of the provided amenities)
    if (amenities) {
      const amenitiesList = amenities.split(',');
      query.amenities = { $in: amenitiesList };
    }
    
    if (manufacturer) query.manufacturer = manufacturer;
    
    // Search by busNumber or model
    if (search) {
      query.$or = [
        { busNumber: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const buses = await Bus.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Bus.countDocuments(query);

    res.status(200).json({
      status: 'success',
      count: buses.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      },
      data: buses
    });
  } catch (error) {
    console.error('Error getting buses:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching buses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get single bus
// @route   GET /api/buses/:id
// @access  Public
exports.getBus = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id);

    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: bus
    });
  } catch (error) {
    console.error('Error getting bus:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching bus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Create new bus
// @route   POST /api/buses
// @access  Private/Admin
exports.createBus = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    // Check if bus with this registration number already exists
    const existingBus = await Bus.findOne({ 
      $or: [
        { busNumber: req.body.busNumber },
        { registrationNumber: req.body.registrationNumber }
      ] 
    });
    
    if (existingBus) {
      return res.status(400).json({
        status: 'error',
        message: 'Bus with this number or registration already exists'
      });
    }

    // Create bus
    const newBus = new Bus(req.body);
    
    // Generate seating layout if not provided
    if (!req.body.seatingArrangement?.layout || req.body.seatingArrangement.layout.length === 0) {
      const { rows, columns } = req.body.seatingArrangement || { rows: 0, columns: 0 };
      if (rows > 0 && columns > 0) {
        const layout = [];
        for (let i = 0; i < rows; i++) {
          const row = [];
          for (let j = 0; j < columns; j++) {
            // Default seat naming: A1, A2, B1, B2, etc.
            row.push(String.fromCharCode(65 + i) + (j + 1));
          }
          layout.push(row);
        }
        newBus.seatingArrangement.layout = layout;
      }
    }

    await newBus.save();

    res.status(201).json({
      status: 'success',
      message: 'Bus created successfully',
      data: newBus
    });
  } catch (error) {
    console.error('Error creating bus:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while creating bus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update bus
// @route   PUT /api/buses/:id
// @access  Private/Admin
exports.updateBus = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    // Check if updating busNumber or registrationNumber and if they already exist on another bus
    if (req.body.busNumber || req.body.registrationNumber) {
      const existingBus = await Bus.findOne({
        _id: { $ne: req.params.id },
        $or: [
          { busNumber: req.body.busNumber },
          { registrationNumber: req.body.registrationNumber }
        ]
      });

      if (existingBus) {
        return res.status(400).json({
          status: 'error',
          message: 'Bus with this number or registration already exists'
        });
      }
    }

    const bus = await Bus.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Bus updated successfully',
      data: bus
    });
  } catch (error) {
    console.error('Error updating bus:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating bus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete bus
// @route   DELETE /api/buses/:id
// @access  Private/Admin
exports.deleteBus = async (req, res) => {
  try {
    // Check if bus is associated with any bookings
    const bookings = await Booking.find({ 
      bus: req.params.id,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    if (bookings.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete bus with active bookings',
        bookings: bookings.map(b => b.bookingNumber)
      });
    }

    // Check if bus is associated with any hirings
    const hirings = await Hiring.find({
      bus: req.params.id,
      status: { $in: ['Pending', 'Confirmed', 'In Progress'] }
    });

    if (hirings.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete bus with active hirings',
        hirings: hirings.map(h => h.hiringNumber)
      });
    }

    const bus = await Bus.findByIdAndDelete(req.params.id);

    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Bus deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bus:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while deleting bus',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Check bus availability
// @route   GET /api/buses/:id/availability
// @access  Public
exports.checkBusAvailability = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide startDate and endDate parameters'
      });
    }
    
    const bus = await Bus.findById(req.params.id);
    
    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }
    
    // Check bus status
    if (bus.status !== 'Active') {
      return res.status(200).json({
        status: 'success',
        available: false,
        reason: `Bus is ${bus.status.toLowerCase()}`
      });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate date range
    if (start > end) {
      return res.status(400).json({
        status: 'error',
        message: 'Start date must be before end date'
      });
    }
    
    // Check for conflicting bookings
    const bookings = await Booking.find({
      bus: bus._id,
      $or: [
        // Departure date falls within our range
        {
          departureDate: { $lte: end, $gte: start }
        },
        // Return date falls within our range
        {
          returnDate: { $lte: end, $gte: start }
        }
      ],
      status: { $in: ['Confirmed', 'Pending'] }
    });
    
    // Check for conflicting hirings
    const hirings = await Hiring.find({
      bus: bus._id,
      $or: [
        // Start date falls within our range
        {
          startDate: { $lte: end, $gte: start }
        },
        // End date falls within our range
        {
          endDate: { $lte: end, $gte: start }
        }
      ],
      status: { $in: ['Confirmed', 'Pending', 'In Progress'] }
    });
    
    const isAvailable = bookings.length === 0 && hirings.length === 0;
    
    res.status(200).json({
      status: 'success',
      available: isAvailable,
      bus: {
        id: bus._id,
        busNumber: bus.busNumber,
        type: bus.type,
        capacity: bus.capacity
      },
      conflicts: {
        bookings: isAvailable ? [] : bookings.map(b => ({
          bookingNumber: b.bookingNumber,
          departureDate: b.departureDate,
          returnDate: b.returnDate
        })),
        hirings: isAvailable ? [] : hirings.map(h => ({
          hiringNumber: h.hiringNumber,
          startDate: h.startDate,
          endDate: h.endDate
        }))
      }
    });
  } catch (error) {
    console.error('Error checking bus availability:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while checking bus availability',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get bus schedule
// @route   GET /api/buses/:id/schedule
// @access  Public
exports.getBusSchedule = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const bus = await Bus.findById(req.params.id);
    
    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }
    
    // Get all bookings for this bus within date range
    const bookings = await Booking.find({
      bus: bus._id,
      $or: [
        { departureDate: { $gte: start, $lte: end } },
        { returnDate: { $gte: start, $lte: end } }
      ]
    }).populate('route', 'source destination departureTime arrivalTime');
    
    // Get all hirings for this bus within date range
    const hirings = await Hiring.find({
      bus: bus._id,
      $or: [
        { startDate: { $gte: start, $lte: end } },
        { endDate: { $gte: start, $lte: end } }
      ]
    });
    
    // Format schedule as array of events
    const schedule = [
      ...bookings.map(booking => ({
        type: 'booking',
        id: booking._id,
        reference: booking.bookingNumber,
        status: booking.status,
        route: booking.route ? `${booking.route.source} to ${booking.route.destination}` : 'N/A',
        startDateTime: booking.departureDate,
        endDateTime: booking.returnDate || booking.departureDate, // If one-way trip
        passengers: booking.passengers.length,
        isRoundTrip: booking.bookingType === 'Round-Trip'
      })),
      ...hirings.map(hiring => ({
        type: 'hiring',
        id: hiring._id,
        reference: hiring.hiringNumber,
        status: hiring.status,
        customer: hiring.customerName,
        startDateTime: hiring.startDate,
        endDateTime: hiring.endDate,
        destination: hiring.destination,
        purpose: hiring.purpose
      }))
    ];
    
    res.status(200).json({
      status: 'success',
      data: {
        bus: {
          id: bus._id,
          busNumber: bus.busNumber,
          type: bus.type,
          capacity: bus.capacity,
          status: bus.status
        },
        schedule
      }
    });
  } catch (error) {
    console.error('Error getting bus schedule:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting bus schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get maintenance history
// @route   GET /api/buses/:id/maintenance
// @access  Private/Admin
exports.getMaintenanceHistory = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id);
    
    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: bus.maintenanceHistory || []
    });
  } catch (error) {
    console.error('Error getting maintenance history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting maintenance history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Add maintenance record
// @route   POST /api/buses/:id/maintenance
// @access  Private/Admin
exports.addMaintenanceRecord = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id);
    
    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }
    
    const { date, description, cost, odometer, servicedBy, notes } = req.body;
    
    // Validate required fields
    if (!date || !description) {
      return res.status(400).json({
        status: 'error',
        message: 'Date and description are required for maintenance record'
      });
    }
    
    // Create maintenance record
    const maintenanceRecord = {
      date: new Date(date),
      description,
      cost: cost || 0,
      odometer: odometer || 0,
      servicedBy: servicedBy || 'Unknown',
      notes: notes || '',
      addedBy: req.user.id,
      createdAt: new Date()
    };
    
    // Add to maintenance history
    bus.maintenanceHistory.push(maintenanceRecord);
    
    // Update last service date
    bus.lastServiceDate = new Date(date);
    
    // If bus was in maintenance status, check if it should be reactivated
    if (req.body.changeStatus && bus.status === 'Maintenance') {
      bus.status = 'Active';
    }
    
    await bus.save();
    
    res.status(201).json({
      status: 'success',
      message: 'Maintenance record added successfully',
      data: maintenanceRecord
    });
  } catch (error) {
    console.error('Error adding maintenance record:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while adding maintenance record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update bus status
// @route   PUT /api/buses/:id/status
// @access  Private/Admin
exports.updateBusStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['Active', 'Inactive', 'Maintenance', 'Out of Service'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Find bus
    const bus = await Bus.findById(req.params.id);
    
    if (!bus) {
      return res.status(404).json({
        status: 'error',
        message: 'Bus not found'
      });
    }
    
    // Check if status is changing to inactive/maintenance and if there are conflicts
    if (status !== 'Active' && bus.status === 'Active') {
      // Check for upcoming bookings in the next 7 days
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      
      const upcomingBookings = await Booking.find({
        bus: bus._id,
        departureDate: { $gte: today, $lte: nextWeek },
        status: { $in: ['Confirmed', 'Pending'] }
      });
      
      const upcomingHirings = await Hiring.find({
        bus: bus._id,
        startDate: { $gte: today, $lte: nextWeek },
        status: { $in: ['Confirmed', 'Pending'] }
      });
      
      if (upcomingBookings.length > 0 || upcomingHirings.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot change status. Bus has upcoming bookings or hirings in the next 7 days',
          conflicts: {
            bookings: upcomingBookings.map(b => b.bookingNumber),
            hirings: upcomingHirings.map(h => h.hiringNumber)
          }
        });
      }
    }
    
    // Update status
    bus.status = status;
    bus.statusUpdatedAt = new Date();
    
    // Add status change to history
    bus.statusHistory.push({
      status,
      date: new Date(),
      notes: notes || '',
      updatedBy: req.user.id
    });
    
    await bus.save();
    
    res.status(200).json({
      status: 'success',
      message: `Bus status updated to ${status}`,
      data: {
        status: bus.status,
        statusUpdatedAt: bus.statusUpdatedAt
      }
    });
  } catch (error) {
    console.error('Error updating bus status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating bus status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get bus types and total count
// @route   GET /api/buses/types
// @access  Public
exports.getBusTypes = async (req, res) => {
  try {
    const types = await Bus.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: types.map(type => ({
        type: type._id,
        count: type.count
      }))
    });
  } catch (error) {
    console.error('Error getting bus types:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting bus types',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get bus statistics
// @route   GET /api/buses/statistics
// @access  Private/Admin
exports.getBusStatistics = async (req, res) => {
  try {
    // Get total buses count
    const totalBuses = await Bus.countDocuments();
    
    // Get buses count by status
    const statusCounts = await Bus.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Format status counts
    const byStatus = {};
    statusCounts.forEach(status => {
      byStatus[status._id] = status.count;
    });
    
    // Get buses count by type
    const typeCounts = await Bus.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    
    // Format type counts
    const byType = {};
    typeCounts.forEach(type => {
      byType[type._id] = type.count;
    });
    
    // Get buses count by capacity range
    const capacityRanges = await Bus.aggregate([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ['$capacity', 20] }, then: '1-20' },
                { case: { $lte: ['$capacity', 35] }, then: '21-35' },
                { case: { $lte: ['$capacity', 50] }, then: '36-50' },
                { case: { $gt: ['$capacity', 50] }, then: '50+' }
              ],
              default: 'Unknown'
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format capacity range counts
    const byCapacity = {};
    capacityRanges.forEach(range => {
      byCapacity[range._id] = range.count;
    });
    
    // Get newest buses (added in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newBuses = await Bus.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Get buses that need maintenance (over 6 months since last service)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const needMaintenance = await Bus.countDocuments({
      lastServiceDate: { $lt: sixMonthsAgo },
      status: 'Active'
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        totalBuses,
        byStatus,
        byType,
        byCapacity,
        newBusesLast30Days: newBuses,
        needMaintenance
      }
    });
  } catch (error) {
    console.error('Error getting bus statistics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting bus statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

