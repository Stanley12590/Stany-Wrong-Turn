const express = require('express');
const fs = require('fs-extra');
const QRCode = require('qrcode');
const { useMultiFileAuthState, makeWASocket, Browsers, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const router = express.Router();

// Store active connections
const activeConnections = new Map();

router.get('/', async (req, res) => {
    try {
        const authFolder = './qr_auth_info';
        
        // Clean previous sessions
        if (fs.existsSync(authFolder)) {
            await fs.emptyDir(authFolder);
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                try {
                    // Generate QR code image
                    const qrImage = await QRCode.toDataURL(qr);
                    activeConnections.set('currentQR', { sock, qr: qrImage });
                    
                    // Send QR code as image
                    if (!res.headersSent) {
                        res.json({ 
                            status: 'success', 
                            qr: qrImage,
                            message: 'Scan QR code with WhatsApp'
                        });
                    }
                } catch (error) {
                    if (!res.headersSent) {
                        res.status(500).json({ 
                            status: 'error', 
                            message: 'QR generation failed: ' + error.message 
                        });
                    }
                }
            }
            
            if (connection === 'open') {
                if (!res.headersSent) {
                    res.json({ 
                        status: 'connected', 
                        message: 'WhatsApp connected successfully!',
                        session: 'STANY_SESSION_' + Date.now()
                    });
                }
                
                // Close connection after success
                setTimeout(() => {
                    sock.close();
                    try {
                        fs.emptyDirSync(authFolder);
                    } catch (e) {}
                }, 5000);
            }

            if (connection === 'close') {
                try {
                    fs.emptyDirSync(authFolder);
                } catch (e) {}
            }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            if (!res.headersSent) {
                res.json({ 
                    status: 'timeout', 
                    message: 'QR code generation timeout' 
                });
            }
            try {
                sock.close();
                fs.emptyDirSync(authFolder);
            } catch (e) {}
        }, 30000);

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ 
                status: 'error', 
                message: error.message 
            });
        }
    }
});

module.exports = router;
