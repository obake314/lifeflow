const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads (local/Render only — on Lambda handled separately)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/timeline'));
app.use('/api', require('./routes/follow'));
app.use('/api/upload', require('./routes/upload'));

module.exports = app;
