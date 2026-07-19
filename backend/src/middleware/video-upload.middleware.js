const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const videosDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads', 'how-to-play');
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, videosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Only MP4, WebM, OGG, MOV are allowed.'), false);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_VIDEO_SIZE, 10) || 200 * 1024 * 1024 }, // 200 MB
});
