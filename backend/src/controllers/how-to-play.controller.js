const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * GET /api/how-to-play
 * Returns all active how-to-play videos for the user-facing frontend.
 */
exports.getVideos = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description_en, description_hi, video_path, thumbnail_path, display_order, created_at
       FROM how_to_play_videos
       WHERE is_active = 1
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json({ videos: rows });
  } catch (err) {
    next(err);
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/how-to-play/admin/all
 * Returns all videos (active + inactive) for admin management.
 */
exports.getAdminVideos = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description_en, description_hi, video_path, thumbnail_path,
              display_order, is_active, created_at
       FROM how_to_play_videos
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json({ videos: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/how-to-play/admin
 * Create a new video entry. Expects multipart/form-data with field `video`.
 */
exports.createVideo = async (req, res, next) => {
  try {
    const { title, description_en, description_hi, display_order } = req.body;
    if (!title || !req.file) {
      return res.status(400).json({ error: 'Title and video file are required.' });
    }

    const videoPath = `how-to-play/${req.file.filename}`;
    const order = parseInt(display_order, 10) || 0;

    const [result] = await pool.query(
      `INSERT INTO how_to_play_videos (title, description_en, description_hi, video_path, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [title.trim(), description_en?.trim() || null, description_hi?.trim() || null, videoPath, order]
    );
    res.status(201).json({ message: 'Video created.', id: result.insertId });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/how-to-play/admin/:id
 * Update metadata (title, descriptions, order). Optionally replace video file.
 */
exports.updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description_en, description_hi, display_order } = req.body;

    const [[existing]] = await pool.query('SELECT * FROM how_to_play_videos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Video not found.' });

    let videoPath = existing.video_path;

    if (req.file) {
      // delete old file
      const oldFile = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads', existing.video_path || '');
      if (existing.video_path && fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      videoPath = `how-to-play/${req.file.filename}`;
    }

    const order = parseInt(display_order, 10) || existing.display_order;

    await pool.query(
      `UPDATE how_to_play_videos
       SET title = ?, description_en = ?, description_hi = ?, video_path = ?, display_order = ?
       WHERE id = ?`,
      [
        (title || existing.title).trim(),
        description_en?.trim() ?? existing.description_en,
        description_hi?.trim() ?? existing.description_hi,
        videoPath,
        order,
        id,
      ]
    );
    res.json({ message: 'Video updated.' });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/how-to-play/admin/:id/toggle
 * Toggle active/inactive.
 */
exports.toggleVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.query('SELECT id, is_active FROM how_to_play_videos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Video not found.' });

    await pool.query('UPDATE how_to_play_videos SET is_active = ? WHERE id = ?', [existing.is_active ? 0 : 1, id]);
    res.json({ message: `Video ${existing.is_active ? 'deactivated' : 'activated'}.` });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/how-to-play/admin/:id
 * Delete record and video file.
 */
exports.deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.query('SELECT * FROM how_to_play_videos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Video not found.' });

    if (existing.video_path) {
      const filePath = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads', existing.video_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM how_to_play_videos WHERE id = ?', [id]);
    res.json({ message: 'Video deleted.' });
  } catch (err) {
    next(err);
  }
};
