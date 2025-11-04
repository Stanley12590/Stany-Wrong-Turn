const express = require('express');
const fs = require('fs-extra');
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const { Boom } = require("@hapi/boom");

const MESSAGE = process.env.MESSAGE || `
*Hi😊❤️👋Friend*
*Thanks For Choosing Us*
*Please 🙏😊😓⤵️*

𝐅𝐎𝐋𝐋𝐎𝐖 𝐎𝐔𝐑 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐂𝐇𝐀𝐍𝐍𝐄𝐋

> *STANY PROGRAMING HUB*
> https://whatsapp.com/channel/0029VbBy4ON0wajpzLTzom35

> *STANY PROGRAMING HUB2*
> https://whatsapp.com/channel/0029Vb72cVkJ3jv10gzqTn18

> *STANY BETTING AND CASINOS*
> https://whatsapp.com/channel/0029VbBnoamIHphCnwau5Z3E

> 𝐅𝐎𝐑𝐊 𝐀𝐍𝐃 𝐒𝐓𝐀𝐑 𝐓𝐇𝐄 𝐑𝐄𝐏𝐎
> github.com/Stanley12590/STANY_WRONG_TURN_6

> StanyTz🏻
`;

const { upload } = require('./mega');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require("@whiskeysockets/baileys");

// Ensure the directory is empty when the app starts
if (fs.existsSync('./auth_info_baileys')) {
    fs.emptyDirSync(__dirname + '/auth_info_baileys');
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    // Validate phone number
    if (!num) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Phone number is required' 
        });
    }

    // Clean phone number
    num = num.replace(/[^0-9]/g, '');
    if (!num.startsWith('255')) {
        num = '255' + num;
    }

    async function SUHAIL() {
        const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys`);
        try {
            let Smd = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!Smd.authState.creds.registered) {
                await delay(1500);
                
                try {
                    const code = await Smd.requestPairingCode(num);
                    console.log('Pairing code generated:', code);
                    
                    if (!res.headersSent) {
                        res.json({ 
                            status: 'success', 
                            pairingCode: code,
                            message: 'Use this code to pair your device'
                        });
                    }
                } catch (error) {
                    console.log('Error generating pairing code:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ 
                            status: 'error', 
                            message: 'Failed to generate pairing code: ' + error.message 
                        });
                    }
                    return;
                }
            }

            Smd.ev.on('creds.update', saveCreds);
            Smd.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(10000);
                        if (fs.existsSync('./auth_info_baileys/creds.json')) {
                            const auth_path = './auth_info_baileys/';
                            let user = Smd.user.id;

                            function randomMegaId(length = 6, numberLength = 4) {
                                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                                let result = '';
                                for (let i = 0; i < length; i++) {
                                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                                }
                                const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                                return `${result}${number}`;
                            }

                            const mega_url = await upload(fs.createReadStream(auth_path + 'creds.json'), `${randomMegaId()}.json`);
                            const Id_session = mega_url.replace('https://mega.nz/file/', '');
                            const Scan_Id = Id_session;

                            // Send session ID
                            let msgsss = await Smd.sendMessage(user, { text: Scan_Id });

                            // Send banner image with caption
                            await Smd.sendMessage(user, {
                                image: { url: "https://files.catbox.moe/23j7tl.jpg" },
                                caption: MESSAGE,
                                contextInfo: {
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    externalAdReply: {
                                        showAdAttribution: true,
                                        title: "STANY WRONG TURNS",
                                        body: "WhatsApp Channel",
                                        previewType: "PHOTO",
                                        thumbnailUrl: "https://files.catbox.moe/v1lazm.png",
                                        mediaType: 1,
                                        mediaUrl: "https://files.catbox.moe/23j7tl.jpg",
                                        sourceUrl: "https://whatsapp.com/channel/0029VbBy4ON0wajpzLTzom35"
                                    }
                                }
                            }, { quoted: msgsss });

                            await delay(1000);
                        }
                    } catch (e) {
                        console.log("Error during file upload or message send: ", e);
                    }

                    await delay(100);
                    try {
                        await fs.emptyDirSync(__dirname + '/auth_info_baileys');
                    } catch (e) { }
                    
                    // Close connection
                    setTimeout(() => {
                        try {
                            Smd.close();
                        } catch (e) {}
                    }, 3000);
                }

                if (connection === "close") {
                    let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                    if (reason === DisconnectReason.connectionClosed) {
                        console.log("Connection closed!");
                    } else if (reason === DisconnectReason.connectionLost) {
                        console.log("Connection Lost from Server!");
                    } else if (reason === DisconnectReason.restartRequired) {
                        console.log("Restart Required, Restarting...");
                    } else if (reason === DisconnectReason.timedOut) {
                        console.log("Connection TimedOut!");
                    } else {
                        console.log('Connection closed with bot. Please run again.');
                        console.log(reason);
                    }
                    
                    try {
                        await fs.emptyDirSync(__dirname + '/auth_info_baileys');
                    } catch (e) { }
                }
            });

        } catch (err) {
            console.log("Error in SUHAIL function: ", err);
            try {
                await fs.emptyDirSync(__dirname + '/auth_info_baileys');
            } catch (e) { }
            
            if (!res.headersSent) {
                res.status(500).json({ 
                    status: 'error', 
                    message: 'Internal server error. Please try again.' 
                });
            }
        }
    }

    // Call the function
    await SUHAIL();
});

module.exports = router;
