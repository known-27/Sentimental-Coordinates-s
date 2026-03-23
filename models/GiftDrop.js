const mongoose = require('mongoose');

const giftDropSchema = new mongoose.Schema({
  giftId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  recipientName: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
  },
  mediaUrl: {
    type: String,
    default: null,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'none'],
    default: 'none',
  },
  coordinates: {
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    radiusMeters: {
      type: Number,
      default: 50,
      min: 10,
      max: 5000,
    },
    locationName: {
      type: String,
      default: '',
    },
  },
  revealed: {
    type: Boolean,
    default: false,
  },
  revealedAt: {
    type: Date,
    default: null,
  },
  revealedFromCoords: {
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Index for efficient geospatial queries
giftDropSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
giftDropSchema.index({ giftId: 1 });
giftDropSchema.index({ revealed: 1, createdAt: -1 });

// Static method to generate unique gift ID
giftDropSchema.statics.generateGiftId = function(recipientName, date) {
  const slug = recipientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `${slug}-${dateStr}-${random}`;
};

module.exports = mongoose.model('GiftDrop', giftDropSchema);
