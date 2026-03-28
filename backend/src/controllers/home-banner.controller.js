const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

// Public — active ads only
exports.getCustomAds = async (req, res, next) => {
  try {
    const [ads] = await pool.query(
      `SELECT id, title, content, extra_text, button_text, button_link, image_url, display_order
       FROM home_banners WHERE status = 1 ORDER BY display_order ASC`
    );
    res.json(ads);
  } catch (e) { next(e); }
};

// Admin — all ads
exports.getAllCustomAds = async (req, res, next) => {
  try {
    const [ads] = await pool.query(
      `SELECT * FROM home_banners ORDER BY display_order ASC`
    );
    res.json(ads);
  } catch (e) { next(e); }
};

// Admin — create
exports.createCustomAd = async (req, res, next) => {
  try {
    const { title, content, extra_text, button_text, button_link, display_order, status } = req.body;
    const image_url = req.file ? `ads/${req.file.filename}` : '';
    const [result] = await pool.query(
      `INSERT INTO home_banners (title, content, extra_text, button_text, button_link, image_url, display_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || '', content || '', extra_text || '',
        button_text || '', button_link || '', image_url,
        parseInt(display_order) || 0, status === '0' ? 0 : 1,
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Custom ad created.' });
  } catch (e) { next(e); }
};

// Admin — update
exports.updateCustomAd = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, extra_text, button_text, button_link, display_order, status } = req.body;

    if (req.file) {
      const [[old]] = await pool.query('SELECT image_url FROM home_banners WHERE id = ?', [id]);
      if (old?.image_url) {
        const oldPath = path.join(__dirname, '../../uploads', old.image_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const fields = [
      ['title', title || ''],
      ['content', content || ''],
      ['extra_text', extra_text || ''],
      ['button_text', button_text || ''],
      ['button_link', button_link || ''],
      ['display_order', parseInt(display_order) || 0],
      ['status', status === '0' ? 0 : 1],
    ];
    if (req.file) fields.push(['image_url', `ads/${req.file.filename}`]);

    const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
    const values = [...fields.map(([, v]) => v), id];
    await pool.query(`UPDATE home_banners SET ${setClauses} WHERE id = ?`, values);
    res.json({ message: 'Custom ad updated.' });
  } catch (e) { next(e); }
};

// Admin — delete
exports.deleteCustomAd = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[ad]] = await pool.query('SELECT image_url FROM home_banners WHERE id = ?', [id]);
    if (ad?.image_url) {
      const imgPath = path.join(__dirname, '../../uploads', ad.image_url);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    await pool.query('DELETE FROM home_banners WHERE id = ?', [id]);
    res.json({ message: 'Custom ad deleted.' });
  } catch (e) { next(e); }
};

// Admin — toggle status
exports.toggleCustomAd = async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE home_banners SET status = 1 - status WHERE id = ?', [id]);
    const [[ad]] = await pool.query('SELECT id, status FROM home_banners WHERE id = ?', [id]);
    res.json(ad);
  } catch (e) { next(e); }
};
