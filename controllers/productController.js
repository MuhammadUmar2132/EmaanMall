// controllers/productController.js
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// helper to upload buffer to cloudinary via stream
const uploadToCloudinary = (buffer, folder = 'products') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Create product (accepts many images in `images` field)
exports.createProduct = async (req, res) => {
  try {
    const { title, price, description, category, type } = req.body;

    if (!title || !price) return res.status(400).json({ message: 'title and price are required' });

    const imagesFiles = req.files || []; // multer memory
    const images = [];

    // upload sequentially (could be parallelized)
    for (let file of imagesFiles) {
      const result = await uploadToCloudinary(file.buffer, 'products');
      images.push({ public_id: result.public_id, url: result.secure_url });
    }

    const product = new Product({
      title,
      price,
      description,
      category,
      images,
      type: type || 'regular',
    });

    await product.save();
    res.status(201).json({ message: 'Product created', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all products with filters, pagination, sort
exports.getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, type, search, sortBy } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (category) filter.category = category;
    if (type) filter.type = type; // 'best' or 'new' or 'regular'
    if (search) filter.title = { $regex: search, $options: 'i' };

    let query = Product.find(filter);

    // sort: rating, newest, priceAsc, priceDesc
    if (sortBy === 'rating') query = query.sort({ rating: -1 });
    else if (sortBy === 'newest') query = query.sort({ createdAt: -1 });
    else if (sortBy === 'priceAsc') query = query.sort({ price: 1 });
    else if (sortBy === 'priceDesc') query = query.sort({ price: -1 });
    else query = query.sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);
    const products = await query.skip(Number(skip)).limit(Number(limit)).exec();

    res.json({ total, page: Number(page), perPage: Number(limit), products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single product
exports.getProductById = async (req, res) => {
  try {
    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update product (allows replacing images)
// For replacing images: send new images, and optionally remove old images by providing public_ids_to_remove in body as JSON array
exports.updateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const { title, price, description, category, type, public_ids_to_remove } = req.body;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (title) product.title = title;
    if (price) product.price = price;
    if (description) product.description = description;
    if (category) product.category = category;
    if (type) product.type = type;

    // remove images from Cloudinary and from product.images
    if (public_ids_to_remove) {
      let ids = [];
      try { ids = JSON.parse(public_ids_to_remove); } catch(e) { ids = Array.isArray(public_ids_to_remove) ? public_ids_to_remove : [public_ids_to_remove]; }
      for (let pubId of ids) {
        try { await cloudinary.uploader.destroy(pubId); } catch(e) { console.warn('cloudinary destroy error', e.message); }
        product.images = product.images.filter(img => img.public_id !== pubId);
      }
    }

    // add new uploaded images
    const imagesFiles = req.files || [];
    for (let file of imagesFiles) {
      const result = await uploadToCloudinary(file.buffer, 'products');
      product.images.push({ public_id: result.public_id, url: result.secure_url });
    }

    product.updatedAt = Date.now();
    await product.save();
    res.json({ message: 'Product updated', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete product and its cloudinary images
exports.deleteProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // remove images from cloudinary
    for (let img of product.images) {
      try { await cloudinary.uploader.destroy(img.public_id); } catch (e) { console.warn('cloudinary destroy error', e.message); }
    }

    await product.remove();
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add a review
exports.addReview = async (req, res) => {
  try {
    const id = req.params.id;
    const { user, comment, rating } = req.body;
    if (rating == null) return res.status(400).json({ message: 'rating required' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.reviews.push({ user, comment, rating: Number(rating) });
    product.recalculateRating();
    await product.save();
    res.status(201).json({ message: 'Review added', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete a review by review id
exports.deleteReview = async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.reviews = product.reviews.filter(r => r._id.toString() !== reviewId.toString());
    product.recalculateRating();
    await product.save();
    res.json({ message: 'Review removed', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Shortcut endpoints
exports.getBestProducts = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const products = await Product.find({ type: 'best' }).sort({ rating: -1, createdAt: -1 }).limit(limit);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getNewProducts = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const products = await Product.find({ type: 'new' }).sort({ createdAt: -1 }).limit(limit);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
