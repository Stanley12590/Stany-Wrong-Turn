// Base64 Session Generator for WASI-MD - Production Ready
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Production-ready logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '5');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '20'); // 20 requests per window

// Configure Socket.IO with production settings
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:']
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public', {
  maxAge: NODE_ENV === 'production' ? '1d' : 0
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// Store for active sessions
const activeSessions = new Map();
const sessionConnectionCount = new Map();

// Cleanup function for old sessions
async function cleanupOldSessions() {
  try {
    const sessionsDir = path.join(__dirname, 'sessions');
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionPath = path.join(sessionsDir, entry.name);
        const stats = await fs.stat(sessionPath);
        const daysOld = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        
        // Delete sessions older than 7 days
        if (daysOld > 7) {
          await fs.rm(sessionPath, { recursive: true, force: true });
          logger.info({ sessionId: entry.name }, 'Deleted old session');
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error cleaning up old sessions');
  }
}

// Run cleanup every 24 hours
setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000);

// Initialize WhatsApp connection
async function mrwasidevStartConnection(sessionId) {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  
  try {
    // Create session directory
    await fs.mkdir(sessionDir, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined
    });

    // Save credentials whenever they update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        // Generate QR code and send to client
        try {
          const qrCodeImage = await qrcode.toDataURL(qr);
          io.to(sessionId).emit('qr', qrCodeImage);
          logger.info({ sessionId }, 'QR generated');
        } catch (error) {
          logger.error({ error, sessionId }, 'Error generating QR code');
        }
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          logger.info({ sessionId }, 'Reconnecting...');
          setTimeout(() => mrwasidevStartConnection(sessionId), 3000);
        } else {
          logger.info({ sessionId }, 'Logged out');
          io.to(sessionId).emit('error', 'WhatsApp disconnected. Please refresh and try again.');
          activeSessions.delete(sessionId);
          sessionConnectionCount.delete(sessionId);
        }
      } else if (connection === 'open') {
        logger.info({ sessionId }, 'Connected!');
        io.to(sessionId).emit('connected', true);
        
        // Wait a bit then send session data
        setTimeout(async () => {
          try {
            await mrwasidevSendSessionData(sessionId);
          } catch (err) {
            logger.error({ error: err, sessionId }, 'Error sending session data');
          }
        }, 2000);
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.remoteJid && msg.key.remoteJid !== 'status@broadcast') {
          logger.debug({ sessionId, remoteJid: msg.key.remoteJid }, 'Message received');
        }
      }
    });

    activeSessions.set(sessionId, { sock, saveCreds });
    return sock;
  } catch (error) {
    logger.error({ error, sessionId }, 'Error starting connection');
    throw error;
  }
}

// Send session data to user
async function mrwasidevSendSessionData(sessionId) {
  try {
    const sessionDir = path.join(__dirname, 'sessions', sessionId);
    const credsPath = path.join(sessionDir, 'creds.json');
    
    // Check if creds exist
    try {
      await fs.access(credsPath);
    } catch {
      logger.debug({ sessionId }, 'Creds not ready yet');
      return;
    }
    
    // Read creds.json as buffer for file sending
    const credsBuffer = await fs.readFile(credsPath);
    
    // Get bot phone number from credentials
    const credsData = await fs.readFile(credsPath, 'utf8');
    const creds = JSON.parse(credsData);
    const botNumber = creds.me?.id?.split(':')[0] || 'Unknown';
    
    // Find the socket for this session
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
      logger.warn({ sessionId }, 'Session data not found');
      return;
    }
    
    // Send instructions message first
    await sessionData.sock.sendMessage(
      `${botNumber}@s.whatsapp.net`,
      {
        text: `✅ *Session Generated Successfully!*\n\n🔐 *Session ID:*\n\`\`\`\n${sessionId}\n\`\`\`\n\n💡 *Instructions:*\n1. Download the creds.json file below\n2. Create \`session\` folder in your bot directory\n3. Save the downloaded file inside session folder\n4. Run your bot - it will connect automatically!\n\n📁 *File location:*\n\\\`session/creds.json\\\`\n\n🎉 *Enjoy your bot!*\n\n📦 *Download creds.json:*`
      }
    );
    
    // Send the creds.json file
    await sessionData.sock.sendMessage(
      `${botNumber}@s.whatsapp.net`,
      {
        document: credsBuffer,
        fileName: 'creds.json',
        mimetype: 'application/json'
      }
    );
    
    logger.info({ sessionId, botNumber }, 'Session data sent successfully');
    
    io.to(sessionId).emit('success', {
      sessionId,
      botNumber,
      message: 'Session generated! Check your WhatsApp!'
    });
    
  } catch (error) {
    logger.error({ error, sessionId }, 'Error sending session data');
    io.to(sessionId).emit('error', 'Failed to send session data');
  }
}

// Socket connection handling with rate limiting
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');
  
  // Track connection count per IP
  const clientIp = socket.handshake.address;
  const currentConnections = sessionConnectionCount.get(clientIp) || 0;
  
  if (currentConnections >= MAX_CONNECTIONS) {
    logger.warn({ clientIp, connections: currentConnections }, 'Max connections reached');
    socket.emit('error', 'Maximum connections reached for this IP. Please try again later.');
    socket.disconnect();
    return;
  }
  
  sessionConnectionCount.set(clientIp, currentConnections + 1);
  
  socket.on('generate', async (data) => {
    // Generate unique session ID
    const sessionId = data.sessionId || `session_${Date.now()}`;
    logger.info({ sessionId, socketId: socket.id }, 'Generating session');
    
    socket.join(sessionId);
    
    try {
      await mrwasidevStartConnection(sessionId);
    } catch (error) {
      logger.error({ error, sessionId }, 'Error starting connection');
      socket.emit('error', 'Failed to start WhatsApp connection');
    }
  });
  
  socket.on('disconnect', () => {
    const clientIp = socket.handshake.address;
    const currentConnections = sessionConnectionCount.get(clientIp) || 1;
    sessionConnectionCount.set(clientIp, Math.max(0, currentConnections - 1));
    
    logger.info({ socketId: socket.id, clientIp }, 'Client disconnected');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ error: err }, 'Unhandled error');
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('SIGTERM or SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close all WhatsApp connections
    for (const [sessionId, sessionData] of activeSessions) {
      if (sessionData.sock) {
        sessionData.sock.end();
      }
    }
    
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, () => {
  logger.info({ port: PORT, environment: NODE_ENV }, 'Server started');
});
