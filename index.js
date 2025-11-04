const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'qr.html'));
});

// API Routes
app.use('/api/qr', require('./qr'));
app.use('/api/code', require('./pair'));

app.listen(PORT, () => {
    console.log(`✅ STANY WRONG TURN 6 running on port: ${PORT}`);
    console.log(`🌐 Website: http://localhost:${PORT}`);
});

module.exports = app;
