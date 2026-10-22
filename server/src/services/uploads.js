import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { env, cloudinaryConfigured } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

// Files stay in memory (no disk writes on serverless) and are streamed to Cloudinary.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest('Upload a JPG, PNG or WebP image'))),
}).single('image');

export function uploadImage(buffer) {
  if (!cloudinaryConfigured()) throw ApiError.unavailable('Image uploads are not configured. Paste an approved image link instead.', 'UPLOADS_NOT_CONFIGURED');
  cloudinary.config({ cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret, secure: true });
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: env.cloudinary.folder, resource_type: 'image', transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }] }, (err, result) => {
        if (err) return reject(ApiError.unavailable('The image could not be uploaded. Try again.', 'UPLOAD_FAILED'));
        return resolve({ url: result.secure_url, publicId: result.public_id });
      })
      .end(buffer);
  });
}
