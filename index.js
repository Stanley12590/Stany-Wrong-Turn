const express = require('express');
const app = express();
const __path = process.cwd();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;

// Fix: Check if files exist before requiring
let server, code;
try {
    server = require('./qr');
} catch (e) {
    console.log('QR module not found, using basic route');
    server = express.Router();
    server.get('/', (req, res) => res.json({ status: 'QR route working' }));
}

try {
    code = require('./pair');
} catch (e) {
    console.log('Pair module not found, using basic route');
    code = express.Router();
    code.get('/', (req, res) => res.json({ status: 'Pair route working' }));
}

require('events').EventEmitter.defaultMaxListeners = 500;

app.use('/qr', server);
app.use('/code', code);

// HTML Routes
app.use('/pair', (req, res) => {
    res.sendFile(__path + '/pair.html');
});

app.use('/', (req, res) => {
    res.sendFile(__path + '/main.html');
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, () => {
    console.log(`✅ STANY WRONG TURN 6 running on port: ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
});

module.exports = app;
