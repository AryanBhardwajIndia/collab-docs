const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const http = require('http');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/collab-editor', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accessToken: String
  }],
  shareToken: { type: String, unique: true, sparse: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const DocumentModel = mongoose.model('Document', documentSchema);

const JWT_SECRET = 'your-secret-key-change-in-production';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { _id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const document = new DocumentModel({
      title,
      content: content || '',
      owner: req.user.userId
    });
    await document.save();
    res.status(201).json(document);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const documents = await DocumentModel.find({
      $or: [
        { owner: req.user.userId },
        { 'sharedWith.user': req.user.userId }
      ]
    }).sort({ updatedAt: -1 });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const document = await DocumentModel.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user.userId },
        { 'sharedWith.user': req.user.userId }
      ]
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const document = await DocumentModel.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { owner: req.user.userId },
          { 'sharedWith.user': req.user.userId }
        ]
      },
      { content, updatedAt: Date.now() },
      { new: true }
    );

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/documents/:id/share', authenticateToken, async (req, res) => {
  try {
    const document = await DocumentModel.findOne({
      _id: req.params.id,
      owner: req.user.userId
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found or unauthorized' });
    }

    const shareToken = jwt.sign(
      { documentId: document._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    document.shareToken = shareToken;
    await document.save();

    res.json({ shareToken });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/documents/access-shared', authenticateToken, async (req, res) => {
  try {
    const { shareToken } = req.body;

    const decoded = jwt.verify(shareToken, JWT_SECRET);
    const document = await DocumentModel.findById(decoded.documentId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const alreadyShared = document.sharedWith.some(
      share => share.user.toString() === req.user.userId
    );

    if (!alreadyShared && document.owner.toString() !== req.user.userId) {
      document.sharedWith.push({
        user: req.user.userId,
        accessToken: shareToken
      });
      await document.save();
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: 'Invalid or expired share link' });
  }
});

app.get('/api/documents/:id/export/pdf', authenticateToken, async (req, res) => {
  try {
    const document = await DocumentModel.findOne({
      _id: req.params.id,
      owner: req.user.userId
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.pdf"`);

    doc.pipe(res);
    doc.fontSize(20).text(document.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(document.content);
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/documents/:id/export/docx', authenticateToken, async (req, res) => {
  try {
    const document = await DocumentModel.findOne({
      _id: req.params.id,
      owner: req.user.userId
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: document.title,
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: document.content,
                size: 24
              })
            ]
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.docx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

const activeConnections = new Map();

wss.on('connection', (ws) => {
  let currentDocId = null;
  let currentUserId = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        currentDocId = data.documentId;
        currentUserId = data.userId;

        if (!activeConnections.has(currentDocId)) {
          activeConnections.set(currentDocId, new Set());
        }
        activeConnections.get(currentDocId).add(ws);

        broadcastCollaborators(currentDocId);
      }

      if (data.type === 'content-change') {
        await DocumentModel.findByIdAndUpdate(
          data.documentId,
          { content: data.content, updatedAt: Date.now() }
        );

        const connections = activeConnections.get(data.documentId);
        if (connections) {
          connections.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'content-update',
                content: data.content
              }));
            }
          });
        }
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  });

  ws.on('close', () => {
    if (currentDocId && activeConnections.has(currentDocId)) {
      activeConnections.get(currentDocId).delete(ws);
      if (activeConnections.get(currentDocId).size === 0) {
        activeConnections.delete(currentDocId);
      } else {
        broadcastCollaborators(currentDocId);
      }
    }
  });
});

function broadcastCollaborators(documentId) {
  const connections = activeConnections.get(documentId);
  if (connections) {
    const collaboratorCount = connections.size;
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'collaborators-update',
          collaborators: Array(collaboratorCount).fill({ active: true })
        }));
      }
    });
  }
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});