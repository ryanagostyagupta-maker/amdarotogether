import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import cors from 'cors';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';
const httpServer = createServer(app);

// In production allow any origin (Railway/Render serve frontend too)
const allowedOrigins = IS_PROD
  ? true
  : ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173'];

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Serve built frontend in production
if (IS_PROD) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded PDFs
app.use('/uploads', express.static(uploadsDir));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}.pdf`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// In-memory room store
// rooms[roomId] = { pdfUrl, inviteCode, strokes: [], currentPage: 1, users: Map }
const rooms = new Map();

function generateId(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function generateInviteCode() {
  return `${generateId(3)}-${generateId(3)}-${generateId(3)}`;
}

// Upload PDF and create room
app.post('/api/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const roomId = generateId(12);
  const inviteCode = generateInviteCode();
  const pdfUrl = `/uploads/${req.file.filename}`;

  rooms.set(roomId, {
    pdfUrl,
    inviteCode,
    strokes: [],
    currentPage: 1,
    users: new Map(),
    pdfName: req.file.originalname,
    createdAt: Date.now(),
  });

  // Also index by invite code
  rooms.set(inviteCode, roomId);

  res.json({ roomId, inviteCode, pdfUrl });
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));


// Lookup room by invite code
app.get('/api/room/:inviteCode', (req, res) => {
  const code = req.params.inviteCode.toUpperCase();
  const roomId = rooms.get(code);
  if (!roomId) return res.status(404).json({ error: 'Room not found' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ roomId, pdfUrl: room.pdfUrl, pdfName: room.pdfName });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    pdfUrl: room.pdfUrl,
    pdfName: room.pdfName,
    inviteCode: room.inviteCode,
    currentPage: room.currentPage,
    userCount: room.users.size,
  });
});

// User colors pool
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
];

// Socket.io
io.on('connection', (socket) => {
  let currentRoomId = null;
  let userName = null;
  let userColor = null;

  socket.on('join-room', ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    currentRoomId = roomId;
    userName = name || `User ${Math.floor(Math.random() * 999)}`;
    userColor = USER_COLORS[room.users.size % USER_COLORS.length];

    socket.join(roomId);
    room.users.set(socket.id, { id: socket.id, name: userName, color: userColor });

    // Send existing state to new user
    socket.emit('room-state', {
      strokes: room.strokes,
      currentPage: room.currentPage,
      users: Array.from(room.users.values()),
      pdfUrl: room.pdfUrl,
      pdfName: room.pdfName,
      inviteCode: room.inviteCode,
      myId: socket.id,
      myColor: userColor,
    });

    // Notify others
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      name: userName,
      color: userColor,
    });

    // Broadcast updated user list
    io.to(roomId).emit('users-updated', Array.from(room.users.values()));
  });

  socket.on('draw-start', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('draw-start', { ...data, userId: socket.id });
  });

  socket.on('draw-move', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('draw-move', { ...data, userId: socket.id });
  });

  socket.on('draw-end', (data) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && data.stroke) {
      room.strokes.push({ ...data.stroke, userId: socket.id, userColor });
    }
    socket.to(currentRoomId).emit('draw-end', { ...data, userId: socket.id });
  });

  socket.on('cursor-move', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('cursor-move', {
      ...data,
      userId: socket.id,
      name: userName,
      color: userColor,
    });
  });

  socket.on('page-change', ({ page }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) room.currentPage = page;
    socket.to(currentRoomId).emit('page-change', { page, userId: socket.id });
  });

  socket.on('clear-page', ({ page }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.strokes = room.strokes.filter((s) => s.page !== page);
    }
    io.to(currentRoomId).emit('clear-page', { page });
  });

  socket.on('undo', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      // Remove last stroke from this user on current page
      const idx = [...room.strokes].reverse().findIndex(
        (s) => s.userId === socket.id
      );
      if (idx !== -1) {
        room.strokes.splice(room.strokes.length - 1 - idx, 1);
      }
    }
    io.to(currentRoomId).emit('sync-strokes', { strokes: room ? room.strokes : [] });
  });

  // PDF voting
  socket.on('propose-pdf', ({ pdfUrl, pdfName, proposer }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Store the active proposal on the room
    room.proposal = {
      pdfUrl,
      pdfName,
      proposer,
      votes: { yes: [socket.id], no: [] }, // proposer auto-votes yes
      totalUsers: room.users.size,
    };

    io.to(currentRoomId).emit('pdf-proposal', room.proposal);

    // Auto-accept if only 1 user in room
    if (room.users.size === 1) {
      io.to(currentRoomId).emit('pdf-accepted', { pdfUrl, pdfName });
      room.pdfUrl = pdfUrl;
      room.pdfName = pdfName;
      room.proposal = null;
    }
  });

  socket.on('cast-vote', ({ vote }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !room.proposal) return;

    const { proposal } = room;
    // Remove from both arrays then add to correct
    proposal.votes.yes = proposal.votes.yes.filter(id => id !== socket.id);
    proposal.votes.no  = proposal.votes.no.filter(id => id !== socket.id);
    if (vote === 'yes') proposal.votes.yes.push(socket.id);
    else                proposal.votes.no.push(socket.id);

    proposal.totalUsers = room.users.size;
    const needed = Math.ceil(room.users.size / 2);

    io.to(currentRoomId).emit('pdf-vote-update', proposal);

    if (proposal.votes.yes.length >= needed) {
      io.to(currentRoomId).emit('pdf-accepted', { pdfUrl: proposal.pdfUrl, pdfName: proposal.pdfName });
      room.pdfUrl   = proposal.pdfUrl;
      room.pdfName  = proposal.pdfName;
      room.proposal = null;
    } else if (proposal.votes.no.length >= needed) {
      io.to(currentRoomId).emit('pdf-rejected');
      room.proposal = null;
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.users.delete(socket.id);
      io.to(currentRoomId).emit('user-left', { id: socket.id });
      io.to(currentRoomId).emit('users-updated', Array.from(room.users.values()));
    }
  });
});


// In production, serve React app for any non-API route
if (IS_PROD) {
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Amdaro Together server running on http://localhost:${PORT}\n`);
});
