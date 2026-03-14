import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  setDoc,
  getDocs,
  limit,
  deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { ChatSession, Message, SessionType } from './types';
import { generateChatResponse, generateImage, explainCode } from './services/gemini';
import { 
  MessageSquare, 
  Image as ImageIcon, 
  Code, 
  LogOut, 
  Plus, 
  Send, 
  User as UserIcon,
  Trash2,
  Menu,
  X,
  Sparkles,
  ChevronRight,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Sync user to Firestore
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sess = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      setSessions(sess);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!activeSession) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'sessions', activeSession.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });
    return unsubscribe;
  }, [activeSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createNewSession = async (type: SessionType) => {
    if (!user) return;
    const docRef = await addDoc(collection(db, 'sessions'), {
      userId: user.uid,
      title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      createdAt: serverTimestamp()
    });
    setActiveSession({ id: docRef.id, userId: user.uid, title: 'New Session', type, createdAt: new Date() });
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeSession?.id === id) setActiveSession(null);
    await deleteDoc(doc(db, 'sessions', id));
  };

  const handleSend = async () => {
    if (!input.trim() || !user || !activeSession || isGenerating) return;

    const userMsg = input;
    setInput('');
    setIsGenerating(true);

    try {
      // Add user message
      await addDoc(collection(db, 'sessions', activeSession.id, 'messages'), {
        role: 'user',
        content: userMsg,
        type: activeSession.type === 'code' ? 'code' : 'text',
        createdAt: serverTimestamp()
      });

      let aiResponse = '';
      let msgType: 'text' | 'image_url' | 'code' = 'text';

      if (activeSession.type === 'chat') {
        const history = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));
        aiResponse = await generateChatResponse(userMsg, history);
      } else if (activeSession.type === 'image') {
        aiResponse = await generateImage(userMsg);
        msgType = 'image_url';
      } else if (activeSession.type === 'code') {
        aiResponse = await explainCode(userMsg);
        msgType = 'text';
      }

      // Add AI response
      await addDoc(collection(db, 'sessions', activeSession.id, 'messages'), {
        role: 'model',
        content: aiResponse,
        type: msgType,
        createdAt: serverTimestamp()
      });

      // Update session title if it's the first message
      if (messages.length === 0) {
        await setDoc(doc(db, 'sessions', activeSession.id), {
          title: userMsg.slice(0, 30) + (userMsg.length > 30 ? '...' : '')
        }, { merge: true });
      }

    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a]">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-emerald-500"
        >
          <Sparkles size={48} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-4">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <Sparkles size={48} className="text-emerald-500" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4 tracking-tight">Loop AI</h1>
          <p className="text-zinc-400 mb-8 text-lg">
            The professional multimodal AI platform for creators, developers, and thinkers.
          </p>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-4 px-6 rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="fixed md:relative z-50 w-72 h-full bg-[#111111] border-r border-white/5 flex flex-col"
          >
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xl">
                <Sparkles className="text-emerald-500" size={24} />
                <span>Loop AI</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 hover:bg-white/5 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-2 space-y-2">
              <button 
                onClick={() => createNewSession('chat')}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
              >
                <Plus size={18} />
                <span className="font-medium">New Chat</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => createNewSession('image')}
                  className="flex items-center justify-center gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-sm"
                >
                  <ImageIcon size={16} />
                  <span>Image</span>
                </button>
                <button 
                  onClick={() => createNewSession('code')}
                  className="flex items-center justify-center gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 text-sm"
                >
                  <Code size={16} />
                  <span>Code</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 mt-4 space-y-1">
              <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">History</div>
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s)}
                  className={cn(
                    "w-full flex items-center justify-between group p-3 rounded-xl transition-all text-sm",
                    activeSession?.id === s.id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {s.type === 'chat' && <MessageSquare size={16} />}
                    {s.type === 'image' && <ImageIcon size={16} />}
                    {s.type === 'code' && <Code size={16} />}
                    <span className="truncate">{s.title}</span>
                  </div>
                  <Trash2 
                    size={14} 
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                    onClick={(e) => deleteSession(e, s.id)}
                  />
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-white/5">
              <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-white/10" alt="" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium truncate">{user.displayName}</div>
                  <div className="text-xs text-zinc-500 truncate">{user.email}</div>
                </div>
                <button onClick={logout} className="p-2 hover:text-red-400 transition-all">
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-bottom border-white/5 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-lg">
                <Menu size={20} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-400">
                {activeSession ? (
                  <div className="flex items-center gap-2">
                    {activeSession.type === 'chat' && <MessageSquare size={18} />}
                    {activeSession.type === 'image' && <ImageIcon size={18} />}
                    {activeSession.type === 'code' && <Code size={18} />}
                    <span className="text-white">{activeSession.title}</span>
                  </div>
                ) : 'Select a session'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-medium border border-emerald-500/20">
              <Sparkles size={12} />
              Gemini 3.1 Flash
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          {!activeSession ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <Sparkles size={64} className="text-emerald-500/20" />
              <div>
                <h2 className="text-2xl font-bold mb-2">Welcome to Loop AI</h2>
                <p className="text-zinc-500 max-w-md">
                  Choose a mode to start creating. Chat with text, generate stunning images, or analyze complex code.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                {[
                  { icon: MessageSquare, title: 'Chat', desc: 'Natural conversations', type: 'chat' },
                  { icon: ImageIcon, title: 'Generate', desc: 'AI Image creation', type: 'image' },
                  { icon: Code, title: 'Code', desc: 'Analyze & Explain', type: 'code' },
                ].map((item) => (
                  <button
                    key={item.type}
                    onClick={() => createNewSession(item.type as SessionType)}
                    className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-left group"
                  >
                    <item.icon className="text-emerald-500 mb-4 group-hover:scale-110 transition-transform" size={24} />
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={m.id || idx}
                  className={cn(
                    "flex gap-4 md:gap-6 max-w-4xl mx-auto",
                    m.role === 'user' ? "flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    m.role === 'user' ? "bg-emerald-500 text-white" : "bg-white/10 text-emerald-500"
                  )}>
                    {m.role === 'user' ? <UserIcon size={16} /> : <Sparkles size={16} />}
                  </div>
                  <div className={cn(
                    "flex-1 space-y-2",
                    m.role === 'user' ? "text-right" : ""
                  )}>
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {m.role === 'user' ? 'You' : 'Loop AI'}
                    </div>
                    <div className={cn(
                      "prose prose-invert max-w-none text-zinc-200 leading-relaxed",
                      m.role === 'user' ? "bg-white/5 p-4 rounded-2xl inline-block text-left" : ""
                    )}>
                      {m.type === 'image_url' ? (
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                          <img src={m.content} alt="Generated" className="w-full h-auto" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isGenerating && (
                <div className="flex gap-4 md:gap-6 max-w-4xl mx-auto">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Loop AI</div>
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        {activeSession && (
          <div className="p-4 md:p-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
            <div className="max-w-4xl mx-auto relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                {activeSession.type === 'chat' && <MessageSquare size={20} />}
                {activeSession.type === 'image' && <ImageIcon size={20} />}
                {activeSession.type === 'code' && <Terminal size={20} />}
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  activeSession.type === 'image' 
                    ? "Describe the image you want to create..." 
                    : activeSession.type === 'code'
                    ? "Paste your code here to analyze..."
                    : "Ask anything..."
                }
                className="w-full bg-[#111111] border border-white/10 rounded-2xl py-4 pl-12 pr-16 focus:outline-none focus:border-emerald-500/50 transition-all resize-none min-h-[60px] max-h-[200px]"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all"
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-center text-[10px] text-zinc-600 mt-4 uppercase tracking-widest">
              Loop AI can make mistakes. Verify important information.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
