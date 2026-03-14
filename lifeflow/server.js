const express = require('express');
const path = require('path');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'サーバーエラーが発生しました' });
});

app.listen(PORT, () => {
  console.log(`LifeFlow server running on port ${PORT}`);
});
