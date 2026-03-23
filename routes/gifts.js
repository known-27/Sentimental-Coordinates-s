const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const GiftDrop = require('../models/GiftDrop');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { isWithinRadius } = require('../utils/haversine');
const { authMiddleware, generateToken } = require('../middleware/auth');
const { createGiftLimiter, verifyLocationLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  },
});

/**
 * POST /api/gifts/create
 * Create a new gift drop
 * Accepts: recipientName, message, mediaFile, lat, lng, radiusMeters, locationName, createdBy
 * Returns: { giftId, shareableLink }
 */
router.post('/create', createGiftLimiter, upload.single('mediaFile'), async (req, res) => {
  try {
    const {
      recipientName,
      message,
      lat,
      lng,
      radiusMeters,
      locationName,
      createdBy,
    } = req.body;

    // Validate required fields
    if (!recipientName || !message || !lat || !lng || !createdBy) {
      // Clean up uploaded file if exists
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['recipientName', 'message', 'lat', 'lng', 'createdBy'],
      });
    }

    // Parse coordinates
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius = radiusMeters ? parseInt(radiusMeters, 10) : 50;

    // Validate coordinate ranges
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid latitude' });
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid longitude' });
    }

    // Upload media to Cloudinary if provided
    let mediaUrl = null;
    let mediaType = 'none';

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.path);
        mediaUrl = uploadResult.secure_url;
        mediaType = uploadResult.resource_type === 'video' ? 'video' : 'image';

        // Clean up local temp file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(500).json({
          error: 'Media upload failed',
          message: uploadError.message,
        });
      }
    }

    // Generate unique gift ID
    const giftId = GiftDrop.generateGiftId(recipientName, new Date());

    // Create gift drop in database
    const giftDrop = new GiftDrop({
      giftId,
      createdBy,
      recipientName,
      message,
      mediaUrl,
      mediaType,
      coordinates: {
        lat: latitude,
        lng: longitude,
        radiusMeters: radius,
        locationName: locationName || '',
      },
    });

    await giftDrop.save();

    // Generate shareable link
    const shareableLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/gift/${giftId}`;

    // Generate JWT token for creator dashboard access
    const creatorToken = generateToken(createdBy, req.body.creatorEmail || '');

    res.status(201).json({
      giftId,
      shareableLink,
      qrCodeData: shareableLink,
      dashboardLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/${giftId}`,
      creatorToken,
    });
  } catch (error) {
    console.error('Gift creation error:', error);
    // Clean up file if exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      error: 'Failed to create gift',
      message: error.message,
    });
  }
});

/**
 * GET /api/gifts/:giftId
 * Get gift metadata (locked state - NO message or media)
 */
router.get('/:giftId', async (req, res) => {
  try {
    const gift = await GiftDrop.findOne({ giftId: req.params.giftId });

    if (!gift) {
      return res.status(404).json({
        error: 'Gift not found',
        message: 'This gift does not exist',
      });
    }

    // Return only location data and locked status - NEVER message or media
    res.json({
      giftId: gift.giftId,
      coordinates: gift.coordinates,
      revealed: gift.revealed,
      recipientName: gift.recipientName,
      createdAt: gift.createdAt,
      isLocked: !gift.revealed,
    });
  } catch (error) {
    console.error('Gift fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch gift',
      message: error.message,
    });
  }
});

/**
 * POST /api/gifts/:giftId/verify-location
 * Verify user's GPS coordinates against gift location
 * If within radius: returns full gift payload and marks as revealed
 * Accepts: { userLat, userLng }
 */
router.post('/:giftId/verify-location', verifyLocationLimiter, async (req, res) => {
  try {
    const { userLat, userLng } = req.body;

    if (userLat === undefined || userLng === undefined) {
      return res.status(400).json({
        error: 'Missing coordinates',
        required: ['userLat', 'userLng'],
      });
    }

    const gift = await GiftDrop.findOne({ giftId: req.params.giftId });

    if (!gift) {
      return res.status(404).json({
        error: 'Gift not found',
      });
    }

    // Calculate distance using Haversine formula
    const { isWithin, distanceMeters } = isWithinRadius(
      gift.coordinates.lat,
      gift.coordinates.lng,
      parseFloat(userLat),
      parseFloat(userLng),
      gift.coordinates.radiusMeters
    );

    if (isWithin) {
      // Mark as revealed
      gift.revealed = true;
      gift.revealedAt = new Date();
      gift.revealedFromCoords = {
        lat: parseFloat(userLat),
        lng: parseFloat(userLng),
      };
      await gift.save();

      // Return full gift payload
      res.json({
        unlocked: true,
        message: gift.message,
        mediaUrl: gift.mediaUrl,
        mediaType: gift.mediaType,
        recipientName: gift.recipientName,
        revealedAt: gift.revealedAt,
        coordinates: gift.coordinates,
      });
    } else {
      // Not within radius
      res.json({
        unlocked: false,
        distanceAway: distanceMeters,
        message: `You're ${distanceMeters}m away from the gift location`,
      });
    }
  } catch (error) {
    console.error('Location verification error:', error);
    res.status(500).json({
      error: 'Location verification failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/gifts/:giftId/status
 * Creator-only endpoint: returns full gift object including reveal status
 * Requires JWT authentication
 */
router.get('/:giftId/status', authMiddleware, async (req, res) => {
  try {
    const gift = await GiftDrop.findOne({ giftId: req.params.giftId });

    if (!gift) {
      return res.status(404).json({
        error: 'Gift not found',
      });
    }

    // Verify creator owns this gift
    if (gift.createdBy !== req.user.creatorId && gift.createdBy !== req.user.email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to view this gift',
      });
    }

    // Return full gift data
    res.json({
      giftId: gift.giftId,
      createdBy: gift.createdBy,
      recipientName: gift.recipientName,
      message: gift.message,
      mediaUrl: gift.mediaUrl,
      mediaType: gift.mediaType,
      coordinates: gift.coordinates,
      revealed: gift.revealed,
      revealedAt: gift.revealedAt,
      revealedFromCoords: gift.revealedFromCoords,
      createdAt: gift.createdAt,
      expiresAt: gift.expiresAt,
      shareableLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/gift/${gift.giftId}`,
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch status',
      message: error.message,
    });
  }
});

module.exports = router;
