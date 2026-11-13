import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Send, 
  Minimize2, 
  Maximize2, 
  RefreshCw, 
  ShieldCheck, 
  Trash2, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  Package, 
  Database,
  Lock
} from 'lucide-react';
import { User } from '../types';

interface AiAssistantProps {
  user: User;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isFallback?: boolean;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  // Native Dragging with Pointer Events (Zero external animation dependencies)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({ startX: 0, startY: 0, initX: 0, initY: 0 });
  const hasMovedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'init-1',
        role: 'assistant',
        content: `🥟 **Welcome, ${user?.username || 'Founder'}! I'm MomoMind**, your executive AI Business Intelligence Co-Pilot for MinMomos.

I have **strictly read-only access** to your live Supabase database. You can ask me anything about sales performance, 90-day active MAU retention, bestselling momos, customer LTV, or inventory levels.

*🔒 Read-Only Mandate: I cannot modify code, update orders, or write data.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Strict Role Guard: Only ADMIN and COFOUNDER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'COFOUNDER')) {
    return null;
  }

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only primary mouse click or touch
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position?.x ?? 0,
      initY: position?.y ?? 0
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasMovedRef.current = true;
    }
    const newX = dragStartRef.current.initX + dx;
    const newY = dragStartRef.current.initY + dy;
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (!hasMovedRef.current) {
      setIsOpen(prev => !prev);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          userRole: user.role,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'No response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFallback: data.isFallback
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.error('AI Assistant Query Error:', err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Unable to fetch live response:** ${err.message || 'Network error'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: 'assistant',
        content: `🥟 History cleared. I am ready for your next question! Ask about today's revenue, customer retention, or top dishes.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const quickPrompts = [
    { label: "Today's Revenue & AOV", icon: DollarSign, query: "What is today's total revenue, order count, and AOV?" },
    { label: "Top 5 Bestselling Momos", icon: ShoppingBag, query: "What are our top 5 best-selling momos by quantity and revenue?" },
    { label: "90-Day Active MAU Health", icon: Users, query: "Show me the 90-day active MAU pool size and share percentage." },
    { label: "Top 10 VIP Customers", icon: TrendingUp, query: "Who are our top 10 customers by lifetime value (LTV)?" },
    { label: "Inventory Stock Alerts", icon: Package, query: "Are there any raw materials or inventory items with low stock warnings?" },
    { label: "Payment Method Breakdown", icon: Database, query: "What is the breakdown of sales between UPI, Cash, and Card?" }
  ];

  // Helper to format lightweight markdown inside chat bubbles
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1.5 text-xs leading-relaxed">
        {lines.map((line, idx) => {
          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-black text-sm text-brand-brown uppercase tracking-tight mt-2 mb-1">
                {line.replace('### ', '')}
              </h4>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h3 key={idx} className="font-black text-base text-brand-brown uppercase tracking-tight mt-3 mb-1">
                {line.replace('## ', '')}
              </h3>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            const content = line.substring(2);
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-1 my-0.5">
                <span className="text-brand-red font-bold select-none">•</span>
                <span>{renderInlineStyles(content)}</span>
              </div>
            );
          }
          if (/^\d+\.\s/.test(line)) {
            const match = line.match(/^(\d+)\.\s(.*)/);
            if (match) {
              return (
                <div key={idx} className="flex items-start gap-1.5 pl-1 my-0.5 font-mono">
                  <span className="text-brand-brown/70 font-bold select-none">{match[1]}.</span>
                  <span className="font-sans">{renderInlineStyles(match[2])}</span>
                </div>
              );
            }
          }
          if (line.trim() === '') {
            return <div key={idx} className="h-1" />;
          }
          return <p key={idx}>{renderInlineStyles(line)}</p>;
        })}
      </div>
    );
  };

  const renderInlineStyles = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} className="font-black text-brand-brown">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={pIdx} className="italic text-brand-brown/80">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={pIdx} className="bg-brand-brown/10 text-brand-brown px-1 py-0.5 rounded font-mono text-[11px]">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return (
    <>
      {/* 1. FLOATING DRAGGABLE MOMO BUTTON (BOTTOM-RIGHT DEFAULT) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          transform: position ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined,
          touchAction: 'none'
        }}
        className="fixed bottom-6 right-6 z-50 select-none cursor-grab active:cursor-grabbing transition-transform duration-75"
        title="MomoMind AI (Executive Co-Pilot) • Drag anywhere or click to ask"
      >
        <div className="relative group">
          {/* Animated Glow Rings */}
          <div className="absolute -inset-2 bg-gradient-to-r from-brand-yellow via-amber-400 to-brand-red rounded-full blur-md opacity-70 group-hover:opacity-100 transition duration-500 animate-pulse" />
          
          {/* Momo Icon Circle */}
          <div className="relative w-14 h-14 bg-gradient-to-b from-brand-yellow via-amber-200 to-amber-300 rounded-full shadow-2xl border-2 border-brand-brown flex items-center justify-center p-2 hover:scale-105 transition-all">
            {/* SVG Momo Dumpling */}
            <svg viewBox="0 0 100 100" className="w-9 h-9 drop-shadow-md" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Momo Body */}
              <path 
                d="M 15 65 C 10 45, 25 25, 50 20 C 75 25, 90 45, 85 65 C 80 80, 20 80, 15 65 Z" 
                fill="url(#momoGrad)" 
                stroke="#451a03" 
                strokeWidth="3" 
              />
              {/* Pinched Top Pleat */}
              <path 
                d="M 44 21 C 47 13, 53 13, 56 21 C 53 23, 47 23, 44 21 Z" 
                fill="#fef08a" 
                stroke="#451a03" 
                strokeWidth="2.5" 
              />
              {/* Pleat Curves */}
              <path d="M 50 22 Q 38 45 28 64" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
              <path d="M 50 22 Q 44 48 40 70" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
              <path d="M 50 22 Q 56 48 60 70" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
              <path d="M 50 22 Q 62 45 72 64" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
              {/* Steam waves */}
              <path d="M 38 12 Q 42 6 40 2" stroke="#d97706" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <path d="M 50 10 Q 54 4 52 0" stroke="#d97706" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <path d="M 62 12 Q 66 6 64 2" stroke="#d97706" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <defs>
                <linearGradient id="momoGrad" x1="50" y1="15" x2="50" y2="80" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fef3c7" />
                  <stop offset="0.6" stopColor="#fde68a" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>

            {/* Sparkle AI Badge on bottom right of button */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-red text-brand-yellow rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              <Sparkles className="w-3 h-3 fill-brand-yellow" />
            </div>

            {/* Online Live Status Indicator */}
            <span className="absolute -top-0.5 -left-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. CHAT DIALOG WINDOW */}
      {isOpen && (
        <div
          className={`fixed z-50 bg-white rounded-[2rem] shadow-2xl border-2 border-brand-brown/15 flex flex-col overflow-hidden font-sans transition-all duration-200 animate-in fade-in zoom-in-95 ${
            isExpanded 
              ? 'inset-6 sm:inset-12' 
              : 'bottom-24 right-6 w-[94vw] sm:w-[460px] h-[620px] max-h-[82vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-brown to-stone-900 text-white p-4 px-5 flex items-center justify-between border-b border-brand-yellow/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center text-xl shadow-inner">
                🥟
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                    MomoMind <span className="text-brand-yellow">AI</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Read-Only DB
                  </span>
                </div>
                <p className="text-[10px] font-bold text-stone-300 uppercase tracking-widest mt-0.5">
                  {user.role === 'COFOUNDER' ? 'Cofounder Intelligence' : 'Executive Admin Co-Pilot'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Read-Only Safety Banner */}
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-200/80 flex items-center justify-between text-[10px] font-bold text-amber-900">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Strictly Read-Only Access • Code & Data Writes Permanently Blocked</span>
            </div>
            <span className="font-mono text-amber-700 bg-amber-200/50 px-1.5 py-0.5 rounded text-[9px]">
              Supabase Live
            </span>
          </div>

          {/* Quick Prompt Chips */}
          <div className="p-2.5 px-4 bg-stone-50/80 border-b border-stone-200/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => handleSendMessage(chip.query)}
                className="px-2.5 py-1 rounded-full bg-white hover:bg-brand-brown hover:text-brand-yellow text-brand-brown/80 border border-brand-stone text-[10px] font-bold whitespace-nowrap transition-all shadow-2xs active:scale-95 flex items-center gap-1"
              >
                <chip.icon className="w-2.5 h-2.5 text-brand-red" />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-stone-100/40">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] p-3.5 rounded-2xl shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-brand-brown text-white rounded-tr-xs'
                      : 'bg-white text-stone-800 border border-brand-stone rounded-tl-xs'
                  }`}
                >
                  {renderFormattedText(msg.content)}
                </div>
                <span className="text-[9px] font-mono text-stone-400 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 p-3 bg-white rounded-2xl border border-brand-stone max-w-[75%] shadow-sm animate-pulse">
                <div className="w-5 h-5 rounded-full bg-brand-yellow/30 flex items-center justify-center text-xs">
                  🥟
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-brown">
                  <RefreshCw className="w-3 h-3 animate-spin text-brand-red" />
                  <span>Consulting live backend data...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-brand-stone">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2 bg-stone-50 border border-brand-stone rounded-2xl p-1.5 pl-3 focus-within:border-brand-brown focus-within:ring-2 focus-within:ring-brand-brown/10 transition-all"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about sales, momos, MAU, customers..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs text-brand-brown placeholder:text-stone-400 outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-xl bg-brand-brown hover:bg-brand-red text-brand-yellow hover:text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[9px] font-bold text-stone-400 px-2 pt-1.5">
              <span>Press Enter to send</span>
              <span className="flex items-center gap-1 text-emerald-600">
                <Lock className="w-2.5 h-2.5" /> Zero Code/Write Capabilities
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
