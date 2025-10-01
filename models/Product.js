// models/Product.js
const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
//   public_id: { type: String, required: true },
  url: { type: String, required: true },
});

const ReviewSchema = new mongoose.Schema({
//   user: { type: String }, // optionally store user id or name
//   comment: { type: String },
//   rating: { type: Number, min: 0, max: 5 },
//   createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String },
  category: { type: String, index: true },
  images: [ImageSchema],
  reviews: [ReviewSchema],
  reviewCount: { type: Number, default: 0 },
  rating: { type: Number, default: 0 }, // mean rating
  type: { type: String, enum: ['regular', 'best', 'new'], default: 'regular', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ProductSchema.methods.recalculateRating = function() {
  if (!this.reviews || this.reviews.length === 0) {
    this.rating = 0;
    this.reviewCount = 0;
  } else {
    const sum = this.reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    this.reviewCount = this.reviews.length;
    this.rating = +(sum / this.reviewCount).toFixed(2);
  }
};

module.exports = mongoose.model('Product', ProductSchema);
