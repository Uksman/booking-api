const Route = require('../models/Route');
const Bus = require('../models/Bus');
const Booking = require('../models/Booking');
const { validationResult } = require('express-validator');

/**
 * Helper function to determine if a given time is during peak hours
 * @param {Date} date - The date to check
 * @returns {Boolean} - Whether the time is during peak hours
 */
const isPeakTime = (date) => {
  const hours = date.getHours();
  // Define peak hours as 7-9 AM and 4-7 PM
  return (hours >= 7 && hours <= 9) || (hours >= 16 && hours <= 19);
};

/**
 * Helper function to determine if a given date falls on a weekend
 * @param {Date} date - The date to check
 * @returns {Boolean} - Whether the date is a weekend (Saturday or Sunday)
 */
const isWeekend = (date) => {
  const day = date.getDay();
  // 0 is Sunday, 6 is Saturday
  return day === 0 || day === 6;
};

// @desc    Get all routes
// @route   GET /api/routes
// @access  Public
exports.getRoutes = async (req, res) => {
  try {
    const {
      source,
      destination,
      operatingDay,
      bus,
      minPrice,
      maxPrice,
      isActive,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortDirection = 'desc'
    } = req.query;

    // Build query
    const query = {};

    // Add filters if they exist
    if (source) query.source = { $regex: source, $options: 'i' };
    if (destination) query.destination = { $regex: destination, $options: 'i' };
    if (operatingDay) query.operatingDays = operatingDay;
    if (bus) query.bus = bus;
    
    // Price filters
    if (minPrice || maxPrice) {
      query.baseFare = {};
      if (minPrice) query.baseFare.$gte = parseFloat(minPrice);
      if (maxPrice) query.baseFare.$lte = parseFloat(maxPrice);
    }
    
    // Active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true' || isActive === true;
    }
    
    // Search by source, destination, or name
    if (search) {
      query.$or = [
        { source: { $regex: search, $options: 'i' } },
        { destination: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { routeCode: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

    // Execute query with pagination
    const routes = await Route.find(query)
      .populate('bus', 'busNumber type capacity status')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Route.countDocuments(query);

    res.status(200).json({
      status: 'success',
      count: routes.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      },
      data: routes
    });
  } catch (error) {
    console.error('Error getting routes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching routes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get single route
// @route   GET /api/routes/:id
// @access  Public
exports.getRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('bus', 'busNumber type capacity status');

    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: route
    });
  } catch (error) {
    console.error('Error getting route:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Create new route
// @route   POST /api/routes
// @access  Private/Admin
exports.createRoute = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    // Check if route with this code already exists
    const existingRoute = await Route.findOne({ routeCode: req.body.routeCode });
    if (existingRoute) {
      return res.status(400).json({
        status: 'error',
        message: 'Route with this code already exists'
      });
    }

    // Check if bus exists and is active
    if (req.body.bus) {
      const bus = await Bus.findById(req.body.bus);
      if (!bus) {
        return res.status(400).json({
          status: 'error',
          message: 'Bus not found'
        });
      }

      if (bus.status !== 'Active') {
        return res.status(400).json({
          status: 'error',
          message: `Cannot assign a bus with status: ${bus.status}`
        });
      }
    }

    // Create route
    const newRoute = new Route(req.body);
    await newRoute.save();

    res.status(201).json({
      status: 'success',
      message: 'Route created successfully',
      data: newRoute
    });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while creating route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update route
// @route   PUT /api/routes/:id
// @access  Private/Admin
exports.updateRoute = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    // Check if updating routeCode and if it already exists
    if (req.body.routeCode) {
      const existingRoute = await Route.findOne({
        _id: { $ne: req.params.id },
        routeCode: req.body.routeCode
      });

      if (existingRoute) {
        return res.status(400).json({
          status: 'error',
          message: 'Route with this code already exists'
        });
      }
    }

    // Check if bus exists and is active if being updated
    if (req.body.bus) {
      const bus = await Bus.findById(req.body.bus);
      if (!bus) {
        return res.status(400).json({
          status: 'error',
          message: 'Bus not found'
        });
      }

      if (bus.status !== 'Active') {
        return res.status(400).json({
          status: 'error',
          message: `Cannot assign a bus with status: ${bus.status}`
        });
      }
    }

    const route = await Route.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Route updated successfully',
      data: route
    });
  } catch (error) {
    console.error('Error updating route:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while updating route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete route
// @route   DELETE /api/routes/:id
// @access  Private/Admin
exports.deleteRoute = async (req, res) => {
  try {
    // Check if route has any active bookings
    const bookings = await Booking.find({ 
      route: req.params.id,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    if (bookings.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete route with active bookings',
        bookings: bookings.map(b => b.bookingNumber)
      });
    }

    const route = await Route.findByIdAndDelete(req.params.id);

    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Route deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while deleting route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Check route availability on a specific date
// @route   GET /api/routes/:id/availability
// @access  Public
exports.checkRouteAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    
    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a date parameter'
      });
    }
    
    const route = await Route.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }
    
    // Use the model's method for checking availability
    const availability = await route.checkAvailability(new Date(date));
    
    res.status(200).json({
      status: 'success',
      data: availability
    });
  } catch (error) {
    console.error('Error checking route availability:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while checking route availability',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get route schedule for a specific date range
// @route   GET /api/routes/:id/schedule
// @access  Public
exports.getRouteSchedule = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to next 7 days if no dates provided
    const today = new Date();
    const start = startDate ? new Date(startDate) : today;
    const end = endDate ? new Date(endDate) : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const route = await Route.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }
    
    // Generate schedule based on operating days within the date range
    const schedule = [];
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dayOfWeek = currentDate.toLocaleString('en-us', { weekday: 'long' });
      
      // Check if route operates on this day
      if (route.operatingDays.includes(dayOfWeek)) {
        // Check availability for this date
        const availability = await route.checkAvailability(new Date(currentDate));
        
        schedule.push({
          date: new Date(currentDate),
          dayOfWeek,
          departureTime: route.departureTime,
          arrivalTime: route.arrivalTime,
          available: availability.available,
          availableSeats: availability.availableSeats || 0,
          totalCapacity: availability.totalCapacity || 0
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.status(200).json({
      status: 'success',
      count: schedule.length,
      data: schedule
    });
  } catch (error) {
    console.error('Error getting route schedule:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while getting route schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Search routes by source and destination
// @route   GET /api/routes/search
// @access  Public
exports.searchRoutes = async (req, res) => {
  try {
    const { source, destination, date, passengers = 1 } = req.query;
    
    // Validate required parameters
    if (!source || !destination) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide source and destination parameters'
      });
    }
    
    // Build search query
    const query = {
      source: { $regex: source, $options: 'i' },
      destination: { $regex: destination, $options: 'i' },
      isActive: true
    };
    
    // Find matching routes
    const routes = await Route.find(query)
      .populate('bus', 'busNumber type capacity status amenities');
    
    // If a specific date is provided, check availability for each route
    let availableRoutes = routes;
    
    if (date) {
      const searchDate = new Date(date);
      const dayOfWeek = searchDate.toLocaleString('en-us', { weekday: 'long' });
      
      // Filter routes that operate on the specified day
      availableRoutes = routes.filter(route => route.operatingDays.includes(dayOfWeek));
      
      // Check availability for each route
      const routesWithAvailability = await Promise.all(
        availableRoutes.map(async route => {
          const availability = await route.checkAvailability(searchDate);
          
          // Make sure there are enough seats for the requested number of passengers
          const isAvailableForPassengers = 
            availability.available && 
            availability.availableSeats >= parseInt(passengers);
            
          return {
            ...route.toObject(),
            availability: {
              ...availability,
              availableForPassengers: isAvailableForPassengers
            },
            fare: route.calculateFare({
              isPeakTime: isPeakTime(searchDate),
              isWeekend: isWeekend(searchDate),
              isHoliday: false // Would need a holiday service to determine this
            })
          };
        })
      );
      
      // Only return routes that are available on the specified date
      availableRoutes = routesWithAvailability.filter(
        route => route.availability.available
      );
    }
    
    res.status(200).json({
      status: 'success',
      count: availableRoutes.length,
      data: availableRoutes
    });
  } catch (error) {
    console.error('Error searching routes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while searching routes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get popular routes by booking count
// @route   GET /api/routes/popular
// @access  Public
exports.getPopularRoutes = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    // Aggregate booking data to find most popular routes
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
      },
      {
        $limit: parseInt(limit)
      }
    ]);
    
    // Get route details for the popular routes
    const routeIds = popularRoutes.map(item => item._id);
    const routes = await Route.find({ _id: { $in: routeIds } });
    
    // Combine booking count with route data
    const result = routes.map(route => {
      const popularRoute = popularRoutes.find(item => item._id.equals(route._id));
      return {
        _id: route._id,
        routeCode: route.routeCode,
        source: route.source,
        destination: route.destination,
        distance: route.distance,
        departureTime: route.departureTime,
        arrivalTime: route.arrivalTime,
        baseFare: route.baseFare,
        bookingCount: popularRoute ? popularRoute.count : 0
      };
    });
    
    // Sort by booking count (highest first)
    result.sort((a, b) => b.bookingCount - a.bookingCount);
    
    res.status(200).json({
      status: 'success',
      count: result.length,
      data: result
    });
  } catch (error) {
    console.error('Error getting popular routes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error while fetching popular routes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
