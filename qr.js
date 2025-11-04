const express = require('express');
const router = express.Router();
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs-extra');

// QR Code Generation Route
router.get('/', async (req, res) => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
        });

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;
            if (qr) {
                res.json({ 
                    status: 'success', 
                    qr: qr,
                    message: 'Scan QR code with WhatsApp'
                });
            }
            if (connection === 'open') {
                res.json({ 
                    status: 'connected', 
                    message: 'WhatsApp connected successfully!',
                    session: state.creds
                });
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

module.exports = router;
