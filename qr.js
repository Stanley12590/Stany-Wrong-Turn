const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        // Simple QR code generation for now
        const qrData = 'https://your-website-url.com/pair';
        const qrImage = await QRCode.toDataURL(qrData);
        
        res.json({ 
            status: 'success',
            qr: qrImage,
            message: 'Scan QR to generate session'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

module.exports = router;
