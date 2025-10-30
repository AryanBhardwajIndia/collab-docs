import React, { useState, useEffect, useRef } from 'react';
import { FileText, Share2, Download, LogOut, Plus, Users } from 'lucide-react';

const API_URL = 'http://13.51.178.10:5002/api';

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [collaborators, setCollaborators] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const urlParams = new URLSearchParams(window.location.search);
    const shareToken = urlParams.get('share');
    
    if (shareToken) {
      sessionStorage.setItem('pendingShareToken', shareToken);
    }
    
    if (token) {
      fetchUserProfile(token);
    }
  }, []);

  useEffect(() => {
    if (user && view === 'dashboard') {
      const pendingToken = sessionStorage.getItem('pendingShareToken');
      if (pendingToken) {
        sessionStorage.removeItem('pendingShareToken');
        handleAccessSharedDocument(pendingToken);
      }
    }
  }, [user, view]);

  useEffect(() => {
    if (currentDoc && user) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentDoc]);

  const connectWebSocket = () => {
    const ws = new WebSocket(`ws://13.51.178.10:5002`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        documentId: currentDoc._id,
        userId: user._id
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'content-update') {
        setDocContent(data.content);
      } else if (data.type === 'collaborators-update') {
        setCollaborators(data.collaborators);
      }
    };

    wsRef.current = ws;
  };

  const fetchUserProfile = async (token) => {
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setView('dashboard');
        fetchDocuments(token);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAccessSharedDocument = async (shareToken) => {
    try {
      const res = await fetch(`${API_URL}/documents/access-shared`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ shareToken })
      });
      const data = await res.json();
      if (res.ok) {
        window.history.replaceState({}, document.title, '/');
        await fetchDocuments();
        setTimeout(() => {
          handleOpenDocument(data);
        }, 500);
      } else {
        alert('Failed to access shared document: ' + data.message);
      }
    } catch (err) {
      console.error('Share error:', err);
      alert('Failed to access shared document');
    }
  };

  const fetchDocuments = async (token) => {
    try {
      const res = await fetch(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setUser(data.user);
        setView('dashboard');
        fetchDocuments(data.token);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Login failed');
    }
  };

  const handleSignup = async (name, email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Signup successful! Please login.');
        setView('login');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Signup failed');
    }
  };

  const handleCreateDocument = async (title) => {
    try {
      const res = await fetch(`${API_URL}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title, content: '' })
      });
      const data = await res.json();
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (res.ok) {
        alert('Document deleted successfully');
        fetchDocuments();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to delete document');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete document');
    }
  };

  const handleOpenDocument = async (doc) => {
    setCurrentDoc(doc);
    setDocContent(doc.content);
    setView('editor');
  };

  const handleContentChange = (newContent) => {
    setDocContent(newContent);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'content-change',
        documentId: currentDoc._id,
        content: newContent,
        userId: user._id
      }));
    }
  };

  const handleGenerateShareLink = async () => {
    try {
      const res = await fetch(`${API_URL}/documents/${currentDoc._id}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      const shareUrl = `${window.location.origin}?share=${data.shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    } catch (err) {
      alert('Failed to generate share link');
    }
  };

  const handleExport = async (format) => {
    try {
      const res = await fetch(`${API_URL}/documents/${currentDoc._id}/export/${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDoc.title}.${format}`;
      a.click();
    } catch (err) {
      alert('Export failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setView('login');
    setDocuments([]);
    setCurrentDoc(null);
  };

  if (view === 'login') {
    return <LoginForm onLogin={handleLogin} onSwitchToSignup={() => setView('signup')} />;
  }

  if (view === 'signup') {
    return <SignupForm onSignup={handleSignup} onSwitchToLogin={() => setView('login')} />;
  }

  if (view === 'dashboard') {
    return (
      <Dashboard
        user={user}
        documents={documents}
        onCreateDocument={handleCreateDocument}
        onOpenDocument={handleOpenDocument}
        onDeleteDocument={handleDeleteDocument}
        onLogout={handleLogout}
        onAccessShared={handleAccessSharedDocument}
      />
    );
  }

  if (view === 'editor') {
    return (
      <Editor
        document={currentDoc}
        content={docContent}
        collaborators={collaborators}
        user={user}
        onContentChange={handleContentChange}
        onGenerateShareLink={handleGenerateShareLink}
        onExport={handleExport}
        onDelete={handleDeleteDocument}
        onBack={() => setView('dashboard')}
      />
    );
  }
};

const LoginForm = ({ onLogin, onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <FileText className="w-12 h-12 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-6">Login to CollabDocs</h2>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={() => onLogin(email, password)}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Login
          </button>
          <p className="text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <button onClick={onSwitchToSignup} className="text-indigo-600 hover:underline">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const SignupForm = ({ onSignup, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <FileText className="w-12 h-12 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-6">Sign Up for CollabDocs</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={() => onSignup(name, email, password)}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Sign Up
          </button>
          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <button onClick={onSwitchToLogin} className="text-indigo-600 hover:underline">
              Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user, documents, onCreateDocument, onOpenDocument, onDeleteDocument, onLogout, onAccessShared }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [shareLink, setShareLink] = useState('');

  const handleCreate = () => {
    if (newDocTitle.trim()) {
      onCreateDocument(newDocTitle);
      setNewDocTitle('');
      setShowCreateModal(false);
    }
  };

  const handleAccessShare = () => {
    if (shareLink.trim()) {
      const urlParams = new URLSearchParams(new URL(shareLink).search);
      const token = urlParams.get('share');
      if (token) {
        onAccessShared(token);
        setShareLink('');
        setShowShareModal(false);
      } else {
        alert('Invalid share link');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileText className="w-8 h-8 text-indigo-600" />
            <h1 className="text-xl font-bold">CollabDocs</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">Welcome, {user.name}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">My Documents</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Share2 className="w-5 h-5" />
              Access Shared
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus className="w-5 h-5" />
              New Document
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc._id}
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition relative group"
            >
              <div onClick={() => onOpenDocument(doc)} className="cursor-pointer">
                <FileText className="w-8 h-8 text-indigo-600 mb-2" />
                <h3 className="font-semibold text-lg mb-2">{doc.title}</h3>
                <p className="text-sm text-gray-500">
                  Updated {new Date(doc.updatedAt).toLocaleDateString()}
                </p>
                {doc.owner.toString() !== user._id && (
                  <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    Shared with you
                  </span>
                )}
              </div>
              {doc.owner.toString() === user._id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDocument(doc._id);
                  }}
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white p-2 rounded-lg hover:bg-red-600"
                  title="Delete document"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {documents.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No documents yet. Create your first document!
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Document</h3>
            <input
              type="text"
              placeholder="Document Title"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Access Shared Document</h3>
            <p className="text-sm text-gray-600 mb-4">Paste the share link you received</p>
            <input
              type="text"
              placeholder="https://localhost:3000?share=..."
              value={shareLink}
              onChange={(e) => setShareLink(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAccessShare}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Access Document
              </button>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareLink('');
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Editor = ({ document, content, collaborators, user, onContentChange, onGenerateShareLink, onExport, onDelete, onBack }) => {
  const isOwner = document.owner.toString() === user._id;
  
  const handleDelete = () => {
    onDelete(document._id);
    onBack();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-gray-600 hover:text-gray-900">
              ← Back
            </button>
            <h1 className="text-xl font-bold">{document.title}</h1>
            {!isOwner && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                Shared with you
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {collaborators.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-lg">
                <Users className="w-4 h-4" />
                <span className="text-sm">{collaborators.length} online</span>
              </div>
            )}
            {isOwner && (
              <>
                <button
                  onClick={onGenerateShareLink}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <button
                      onClick={() => onExport('docx')}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
                    >
                      Export as DOCX
                    </button>
                    <button
                      onClick={() => onExport('pdf')}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg"
                    >
                      Export as PDF
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  title="Delete document"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl mx-auto w-full p-8">
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className="w-full h-full min-h-[600px] p-6 bg-white rounded-lg shadow-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
          placeholder="Start typing..."
        />
      </div>
    </div>
  );
};

export default App;