const express = require('express');
const { getVenue } = require('../venue');

const router = express.Router();

router.get('/venue', async (_req, res) => {
  try {
    const venue = await getVenue();
    res.json(venue);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load venue' });
  }
});

module.exports = router;
