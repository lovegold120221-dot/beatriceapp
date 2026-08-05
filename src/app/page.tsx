"use client";
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { auth, database, storage } from '../lib/firebase';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { ref as dbRef, set, push, get, query, orderByChild, equalTo, remove, onValue, off } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Menu, 
  MoreVertical, 
  Plus, 
  Mic, 
  X, 
  Camera, 
  Image as ImageIcon, 
  FileText, 
  Search, 
  BookOpen, 
  Cpu, 
  Grid,
  Send,
  Loader2,
  Brain,
  Radio,
  Square,
  ChevronLeft,
  Settings,
  User,
  Shield,
  PhoneOff,
  AudioWaveform,
  PenTool,
  Code,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { 
  generateChatResponse, 
  analyzeImage, 
  textToSpeech, 
  transcribeAudio,
  connectLive,
  editImage,
} from '../services/gemini';
import { generateChatResponseStream } from '../services/ollama';
import { generateImage } from '../services/flux';
import { tools, executeTool } from "../services/tools";
import { pairDevice, getDevices, sendTaskToPhone, latestProgressMessage } from '../services/phoneBridge';
import type { DevicePairing, TaskBrief, TaskRecord } from '../services/taskQueue';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface Message {
  role: 'user' | 'model';
  text: string;
  image?: string;
  audio?: string;
  isImageGen?: boolean;
  groundingMetadata?: any;
  originalPrompt?: string;
}

type ViewState = 'splash' | 'auth' | 'home' | 'chat';

const EBURON_VOICES = [
  { name: 'Aoede', alias: 'Wonder Woman' },
  { name: 'Puck', alias: 'Spider-Man' },
  { name: 'Zephyr', alias: 'Storm' },
  { name: 'Charon', alias: 'Batman' },
  { name: 'Kore', alias: 'Captain Marvel' },
  { name: 'Fenrir', alias: 'Wolverine' },
  { name: 'Leda', alias: 'Black Widow' },
  { name: 'Orus', alias: 'Thor' },
  { name: 'Sulafat', alias: 'Iron Man' },
];

const EBURON_LANGUAGES = [
  'Flemish', 'Abkhaz', 'Acehnese', 'Acholi', 'Afar', 'Afrikaans', 'Albanian', 'Alur',
  'Amharic', 'Arabic', 'Armenian', 'Assamese', 'Avar', 'Awadhi', 'Aymara', 'Azerbaijani',
  'Balinese', 'Baluchi', 'Bambara', 'Baoulé', 'Bashkir', 'Basque', 'Batak Karo',
  'Batak Simalungun', 'Batak Toba', 'Belarusian', 'Bemba', 'Bengali', 'Betawi',
  'Bhojpuri', 'Bikol', 'Bosnian', 'Breton', 'Bulgarian', 'Buryat', 'Cantonese',
  'Catalan', 'Cebuano', 'Chamorro', 'Chechen', 'Chichewa', 'Chinese (Simplified)',
  'Chinese (Traditional)', 'Chuukese', 'Chuvash', 'Corsican', 'Crimean Tatar (Cyrillic)',
  'Crimean Tatar (Latin)', 'Croatian', 'Czech', 'Danish', 'Dari', 'Dhivehi', 'Dinka',
  'Dogri', 'Dombe', 'Dutch', 'Dyula', 'Dzongkha', 'English', 'Esperanto', 'Estonian',
  'Ewe', 'Faroese', 'Fijian', 'Filipino', 'Finnish', 'Fon', 'French', 'French (Canada)',
  'Frisian', 'Friulian', 'Fulani', 'Ga', 'Galician', 'Georgian', 'German', 'Greek',
  'Guarani', 'Gujarati', 'Haitian Creole', 'Hakha Chin', 'Hausa', 'Hawaiian', 'Hebrew',
  'Hiligaynon', 'Hindi', 'Hmong', 'Hungarian', 'Hunsrik', 'Iban', 'Icelandic', 'Igbo',
  'Ilocano', 'Indonesian', 'Inuktut (Latin)', 'Inuktut (Syllabics)', 'Irish', 'Italian',
  'Jamaican Patois', 'Japanese', 'Javanese', 'Jingpo', 'Kalaallisut', 'Kannada',
  'Kanuri', 'Kapampangan', 'Kazakh', 'Khasi', 'Khmer', 'Kiga', 'Kikongo',
  'Kinyarwanda', 'Kituba', 'Kokborok', 'Komi', 'Konkani', 'Korean', 'Krio',
  'Kurdish (Kurmanji)', 'Kurdish (Sorani)', 'Kyrgyz', 'Lao', 'Latgalian', 'Latin',
  'Latvian', 'Ligurian', 'Limburgish', 'Lingala', 'Lithuanian', 'Lombard', 'Luganda',
  'Luo', 'Luxembourgish', 'Macedonian', 'Madurese', 'Maithili', 'Makassar',
  'Malagasy', 'Malay', 'Malay (Jawi)', 'Malayalam', 'Maltese', 'Mam', 'Manx',
  'Maori', 'Marathi', 'Marshallese', 'Marwadi', 'Mauritian Creole', 'Meadow Mari',
  'Meiteilon (Manipuri)', 'Minang', 'Mizo', 'Mongolian', 'Myanmar (Burmese)',
  'Nahuatl (Eastern Huasteca)', 'Ndau', 'Ndebele (South)', 'Nepalbhasa (Newari)',
  'Nepali', 'NKo', 'Norwegian', 'Nuer', 'Occitan', 'Odia (Oriya)', 'Oromo',
  'Ossetian', 'Pangasinan', 'Papiamento', 'Pashto', 'Persian', 'Polish',
  'Portuguese (Brazil)', 'Portuguese (Portugal)', 'Punjabi (Gurmukhi)',
  'Punjabi (Shahmukhi)', 'Quechua', 'Qʼeqchiʼ', 'Romani', 'Romanian', 'Rundi',
  'Russian', 'Sami (North)', 'Samoan', 'Sango', 'Sanskrit', 'Santali (Latin)',
  'Santali (Ol Chiki)', 'Scots Gaelic', 'Sepedi', 'Serbian', 'Sesotho',
  'Seychellois Creole', 'Shan', 'Shona', 'Sicilian', 'Silesian', 'Sindhi',
  'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Spanish', 'Sundanese', 'Susu',
  'Swahili', 'Swati', 'Swedish', 'Tahitian', 'Tajik', 'Tamazight',
  'Tamazight (Tifinagh)', 'Tamil', 'Tatar', 'Telugu', 'Tetum', 'Thai', 'Tibetan',
  'Tigrinya', 'Tiv', 'Tok Pisin', 'Tongan', 'Tshiluba', 'Tsonga', 'Tswana',
  'Tulu', 'Tumbuka', 'Turkish', 'Turkmen', 'Tuvan', 'Twi', 'Udmurt', 'Ukrainian',
  'Urdu', 'Uyghur', 'Uzbek', 'Venda', 'Venetian', 'Vietnamese', 'Waray', 'Welsh',
  'Wolof', 'Xhosa', 'Yakut', 'Yiddish', 'Yoruba', 'Yucatec Maya', 'Zapotec', 'Zulu',
];

const CodeBlock = ({ className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const isInline = !match && !String(children).includes('\n');
  const language = match ? match[1] : '';
  const isHtml = language === 'html' || language === 'xml';
  const codeString = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(isHtml);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isInline) {
    return <code className="bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono text-blue-300" {...props}>{children}</code>;
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-neutral-800 bg-[#121212]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-neutral-800">
        <div className="flex items-center space-x-4">
          <span className="text-xs font-medium text-neutral-400 uppercase">{language || 'code'}</span>
          {isHtml && (
            <div className="flex items-center space-x-2 bg-black/20 rounded-lg p-0.5">
              <button 
                onClick={() => setShowPreview(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${!showPreview ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Code
              </button>
              <button 
                onClick={() => setShowPreview(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${showPreview ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Preview
              </button>
            </div>
          )}
        </div>
        <button 
          onClick={handleCopy}
          className="text-xs text-neutral-400 hover:text-white transition-colors flex items-center space-x-1"
        >
          {copied ? <span>Copied!</span> : <span>Copy</span>}
        </button>
      </div>
      
      {!showPreview ? (
        <div className="p-4 overflow-x-auto text-sm font-mono text-neutral-300 whitespace-pre">
          <code className={className} {...props}>{children}</code>
        </div>
      ) : (
        <div className="bg-white w-full h-[400px]">
          <iframe 
            srcDoc={codeString} 
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<ViewState>('splash');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'account' | 'settings' | 'data' | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ url: string, type: string } | null>(null);
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  
  // Image options
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  const [userContext, setUserContext] = useState('');
  const [responseStyle, setResponseStyle] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [ollamaModel, setOllamaModel] = useState('');
  const [voiceName, setVoiceName] = useState('Aoede');
  const [language, setLanguage] = useState('English');

  // ─── Beatrice Voice ↔ Phone bridge state ───────────────────
  const [pairedDevices, setPairedDevices] = useState<DevicePairing[]>([]);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [pairingStatus, setPairingStatus] = useState('');
  const [pendingProposal, setPendingProposal] = useState<TaskBrief | null>(null);
  const [proposalConfirming, setProposalConfirming] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null);
  const [taskStatus, setTaskStatus] = useState('');
  const pendingToolCallRef = useRef<{ id: string; name: string; session: any } | null>(null);
  const taskUnsubRef = useRef<(() => void) | null>(null);
  const lastSpokenMsgRef = useRef('');

  useEffect(() => {
    const savedUserContext = localStorage.getItem('eburon_userContext');
    const savedResponseStyle = localStorage.getItem('eburon_responseStyle');
    const savedTheme = localStorage.getItem('eburon_theme') as 'light' | 'dark' | 'system' || 'system';
    const savedOllamaModel = localStorage.getItem('eburon_ollamaModel');
    const savedVoiceName = localStorage.getItem('eburon_voiceName') || 'Aoede';
    const savedLanguage = localStorage.getItem('eburon_language') || 'English';
    if (savedUserContext) setUserContext(savedUserContext);
    if (savedResponseStyle) setResponseStyle(savedResponseStyle);
    setTheme(savedTheme);
    if (savedOllamaModel) setOllamaModel(savedOllamaModel);
    setVoiceName(savedVoiceName);
    setLanguage(savedLanguage);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('eburon_userContext', userContext);
    localStorage.setItem('eburon_responseStyle', responseStyle);
    localStorage.setItem('eburon_theme', theme);
    localStorage.setItem('eburon_ollamaModel', ollamaModel);
    localStorage.setItem('eburon_voiceName', voiceName);
    localStorage.setItem('eburon_language', language);
    setActiveModal(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setView('home');
        getDevices(firebaseUser.uid)
          .then(setPairedDevices)
          .catch(() => setPairedDevices([]));
      } else {
        setPairedDevices([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Splash → auth auto-transition
  useEffect(() => {
    if (view === 'splash') {
      const timer = setTimeout(() => {
        if (user) {
          setView('home');
        } else {
          setView('auth');
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [view, user]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    setAuthLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      setAuthError('');
    } catch (err: any) {
      setAuthError(err.message || 'Sign up failed');
    }
    setAuthLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (err: any) {
      setAuthError(err.message || 'Sign in failed');
    }
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError(err.message || 'Google sign in failed');
      }
    }
    setAuthLoading(false);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [inputLevels, setInputLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const [outputLevels, setOutputLevels] = useState<number[]>([0, 0, 0, 0, 0]);

  const startLevelMonitor = () => {
    const readLevels = () => {
      const input = inputAnalyserRef.current;
      const output = outputAnalyserRef.current;
      if (input) {
        const data = new Uint8Array(input.frequencyBinCount);
        input.getByteFrequencyData(data);
        const bins = data.length;
        const step = Math.floor(bins / 5);
        setInputLevels([
          Math.max(4, (data[0] + data[1]) / 512 * 60),
          Math.max(4, (data[step] + data[step + 1]) / 512 * 60),
          Math.max(4, (data[step * 2] + data[step * 2 + 1]) / 512 * 60),
          Math.max(4, (data[step * 3] + data[step * 3 + 1]) / 512 * 60),
          Math.max(4, (data[step * 4] + data[Math.min(step * 4 + 1, bins - 1)]) / 512 * 60),
        ]);
      }
      if (output) {
        const data = new Uint8Array(output.frequencyBinCount);
        output.getByteFrequencyData(data);
        const len = data.length;
        const step = Math.floor(len / 5);
        setOutputLevels([
          Math.max(4, (data[0] + data[1]) / 512 * 80),
          Math.max(4, (data[step] + data[step + 1]) / 512 * 80),
          Math.max(4, (data[step * 2] + data[step * 2 + 1]) / 512 * 80),
          Math.max(4, (data[step * 3] + data[step * 3 + 1]) / 512 * 80),
          Math.max(4, (data[step * 4] + data[Math.min(step * 4 + 1, len - 1)]) / 512 * 80),
        ]);
      }
      animFrameRef.current = requestAnimationFrame(readLevels);
    };
    readLevels();
  };

  const stopLevelMonitor = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setInputLevels([0, 0, 0, 0, 0]);
    setOutputLevels([0, 0, 0, 0, 0]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, view]);

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  const clearChat = () => {
    stopLiveSession();
    setMessages([]);
    setCurrentChatId(null);
    setView('home');
    setIsHeaderMenuOpen(false);
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;

    try {
      await remove(dbRef(database, `users/${user.uid}/chats/${chatId}`));
      if (currentChatId === chatId) {
        clearChat();
      }
      fetchChatHistory();
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  // Audio resampling utility - resample from 24kHz to target sample rate
  const resampleAudio = (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexInt = Math.floor(srcIndex);
      const frac = srcIndex - srcIndexInt;
      if (srcIndexInt + 1 < input.length) {
        output[i] = input[srcIndexInt] * (1 - frac) + input[srcIndexInt + 1] * frac;
      } else {
        output[i] = input[srcIndexInt];
      }
    }
    return output;
  };

  // Fetch recent conversation history from Firebase for long-term memory
  const fetchConversationMemory = async (): Promise<string> => {
    if (!user) return '';
    try {
      const snapshot = await get(
        query(
          dbRef(database, `users/${user.uid}/chats`),
          orderByChild('created_at')
        )
      );
      if (!snapshot.exists()) return '';

      const recentChats: string[] = [];
      let count = 0;
      // Get last 3 chats (most recent)
      const allChats: { key: string; val: any }[] = [];
      snapshot.forEach((child) => { allChats.push({ key: child.key!, val: child.val() }); return false; });
      allChats.reverse();

      for (const chat of allChats) {
        if (count >= 3) break;
        const msgSnapshot = await get(
          query(
            dbRef(database, `users/${user.uid}/chats/${chat.key}/messages`),
            orderByChild('created_at')
          )
        );
        if (msgSnapshot.exists()) {
          const messages: string[] = [];
          msgSnapshot.forEach((msgChild) => {
            const m = msgChild.val();
            messages.push(`${m.role === 'user' ? 'User' : 'Beatrice'}: ${m.text}`);
          });
          if (messages.length > 0) {
            recentChats.push(`[Previous conversation - ${chat.val.title || 'Chat'}]\n${messages.slice(-6).join('\n')}`);
            count++;
          }
        }
      }
      return recentChats.length > 0
        ? `\n\nHere is context from your past conversations with this user (for memory):\n${recentChats.join('\n\n')}`
        : '';
    } catch (err) {
      console.error('Failed to fetch conversation memory', err);
      return '';
    }
  };

  // ─── Beatrice Voice ↔ Phone bridge handlers ────────────────
  // Speak a short announcement using the Gemini TTS model.
  const speakText = async (text: string) => {
    try {
      const audioUrl = await textToSpeech(text);
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        await audio.play();
      }
    } catch (err) {
      console.error('TTS announcement failed:', err);
    }
  };

  // Route a tool response back to the live session so the model can
  // continue the conversation naturally.
  const sendToolResult = (session: any, id: string | undefined, name: string | undefined, result: any) => {
    if (!session || !id || !name) return;
    try {
      session.sendToolResponse({
        functionResponses: [{ id, name, response: { result } }],
      });
    } catch (err) {
      console.error('sendToolResponse failed:', err);
    }
  };

  // Intercept tool calls from live session messages. Only
  // `proposePhoneTask` needs UI confirmation; the rest pass through.
  const handleLiveToolCall = (message: any) => {
    const functionCalls =
      message.toolCall?.functionCalls ||
      message.serverContent?.toolCall?.functionCalls;
    if (!functionCalls?.length) return;

    for (const fc of functionCalls) {
      if (fc.name === 'proposePhoneTask') {
        const args = fc.args || {};
        pendingToolCallRef.current = {
          id: fc.id || 'fc',
          name: fc.name,
          session: liveSessionRef.current,
        };
        setPendingProposal({
          goal: String(args.goal || ''),
          steps: Array.isArray(args.steps) ? args.steps.map(String) : [],
          app: args.app ? String(args.app) : undefined,
          priority: (['low', 'normal', 'high', 'urgent'].includes(args.priority)
            ? args.priority
            : 'normal') as TaskBrief['priority'],
          context: args.context ? String(args.context) : undefined,
        });
      }
    }
  };

  const handlePairDevice = async () => {
    if (!user) return;
    setPairingStatus('Linking...');
    try {
      const device = await pairDevice(pairingCodeInput, user.uid);
      if (device) {
        setPairingStatus(`Linked ${device.name}. You can now send tasks to this phone.`);
        setPairingCodeInput('');
        setPairedDevices(await getDevices(user.uid));
        speakText('Your phone is linked. I can send tasks to it now.');
      } else {
        setPairingStatus('No device found with that code. Check the code shown on your phone.');
      }
    } catch (err: any) {
      setPairingStatus(err?.message || 'Failed to link device.');
    }
  };

  const handleProposalConfirm = async () => {
    if (!pendingProposal || !user) return;
    const toolCall = pendingToolCallRef.current;
    setProposalConfirming(true);
    try {
      const device = pairedDevices[0];
      if (!device) {
        setTaskStatus('No linked phone found. Link one in Settings first.');
        sendToolResult(toolCall?.session, toolCall?.id, toolCall?.name, {
          status: 'error',
          message: 'No linked phone found. The user needs to pair a device first.',
        });
        pendingToolCallRef.current = null;
        setPendingProposal(null);
        setProposalConfirming(false);
        return;
      }

      setTaskStatus(`Sending task to ${device.name}...`);
      speakText(`Okay, sending that to your phone now.`);

      taskUnsubRef.current?.();
      lastSpokenMsgRef.current = '';

      const handle = await sendTaskToPhone(
        pendingProposal,
        user.uid,
        device.deviceId,
        (task) => {
          setActiveTask(task);
          if (!task) return;
          const msg = latestProgressMessage(task);
          if (msg && msg !== lastSpokenMsgRef.current) {
            lastSpokenMsgRef.current = msg;
            speakText(msg);
          }
          if (task.state === 'done') {
            const summary = task.result?.summary || msg || 'The task is done.';
            if (summary !== lastSpokenMsgRef.current) {
              lastSpokenMsgRef.current = summary;
              speakText(`Done. ${summary}`);
            }
            setTaskStatus('Task completed on your phone.');
          } else if (task.state === 'failed') {
            setTaskStatus('Task failed on your phone.');
          } else if (task.state === 'cancelled') {
            setTaskStatus('Task was cancelled.');
          }
        },
      );

      if (handle) {
        taskUnsubRef.current = handle.unsubscribe;
        setTaskStatus('Task sent to phone.');
        sendToolResult(toolCall?.session, toolCall?.id, toolCall?.name, {
          status: 'sent',
          taskId: handle.taskId,
          message: `Task sent to ${device.name} for execution.`,
        });
      } else {
        setTaskStatus('Could not send task. Try again.');
        sendToolResult(toolCall?.session, toolCall?.id, toolCall?.name, {
          status: 'error',
          message: 'Failed to create the task.',
        });
      }
    } catch (err: any) {
      console.error('Proposal confirm failed:', err);
      setTaskStatus(err?.message || 'Failed to send task.');
      sendToolResult(toolCall?.session, toolCall?.id, toolCall?.name, {
        status: 'error',
        message: err?.message || 'Failed to send task.',
      });
    }
    pendingToolCallRef.current = null;
    setPendingProposal(null);
    setProposalConfirming(false);
  };

  const handleProposalCancel = () => {
    const toolCall = pendingToolCallRef.current;
    sendToolResult(toolCall?.session, toolCall?.id, toolCall?.name, {
      status: 'cancelled',
      message: 'Task proposal declined by user.',
    });
    pendingToolCallRef.current = null;
    setPendingProposal(null);
    setProposalConfirming(false);
  };

  const startChatLiveSession = async () => {
    try {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
      // Use default sample rate (typically 44100 or 48000) instead of 24000
      // Browsers don't reliably support 24000 Hz sample rate
      audioContextRef.current = new AudioContext();

      // Fetch long-term memory from past conversations
      const memoryContext = await fetchConversationMemory();
      const sessionUserContext = userContext + memoryContext;

      const sessionPromise = connectLive(
        () => {
          console.log("Chat live session opened");
          setIsLiveActive(true);
          startLevelMonitor();
        },
        (message) => {
          if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const pcmData = new Int16Array(bytes.buffer);
            audioQueueRef.current.push(pcmData);
            if (!isPlayingRef.current) playNextInQueue();
          }

          if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
            const text = message.serverContent.modelTurn.parts[0].text;
            setLiveTranscription(text);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'model' && last.text !== '' && !last.isImageGen) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + text };
                return updated;
              } else {
                return [...prev, { role: 'model', text }];
              }
            });
          }

          // Save complete model turn to Firebase when turn is done
          if (message.serverContent?.turnComplete) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'model' && last.text) {
                saveMessageToDb(last);
              }
              return prev;
            });
          }

          if (message.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }

          // Handle tool calls (e.g. proposePhoneTask →
          // user confirmation modal, then send to their phone).
          handleLiveToolCall(message);
        },
        (err) => console.error("Chat live error:", err),
        () => {
          console.log("Chat live session closed");
          liveSessionRef.current = null;
          setIsLiveActive(false);
        },
        sessionUserContext,
        responseStyle,
        voiceName,
        language
      );

      liveSessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start chat live session:", err);
    }
  };

  const startLiveSession = async () => {
    try {
      setMicError(null);

      // Check if we're in a secure context (required for getUserMedia).
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('Microphone requires HTTPS. This page must be served over a secure connection.');
      }

      // Check if getUserMedia is available.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support microphone access. Try Chrome, Edge, or Safari.');
      }

      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }

      // Request microphone access with a clear error if denied.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
      } catch (micErr: any) {
        if (micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError') {
          setMicError('Microphone access was denied. Click the camera icon in your browser address bar to allow it, then try again.');
        } else if (micErr?.name === 'NotFoundError' || micErr?.name === 'DevicesNotFoundError') {
          setMicError('No microphone found. Connect a microphone and try again.');
        } else if (micErr?.name === 'NotReadableError' || micErr?.name === 'TrackStartError') {
          setMicError('Your microphone is being used by another app. Close it and try again.');
        } else {
          setMicError(`Could not access microphone: ${micErr?.message || 'Unknown error'}`);
        }
        setIsVoiceOpen(false);
        return;
      }

      // Create and resume AudioContext (browsers start it suspended).
      audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Energy-based VAD — tuned for low-latency real-time conversation.
      // Lower hangover = faster turn detection (less waiting after user stops).
      let vadSilenceFrames = 0;
      const VAD_THRESHOLD = 0.006;
      const VAD_HANGOVER = 6; // ~250ms — fast enough for natural turn-taking

      const sessionPromise = connectLive(
        (sessionPromise) => {
          console.log("Live session opened");
          setIsLiveActive(true);

          // Beatrice speaks first — a natural, casual greeting like a friend
          // picking up a phone, not an assistant greeting a user.
          const greetings = [
            "Hey... what's up?",
            "Oh hey! What's going on?",
            "Heyy, sige — what's on your mind?",
            "Oh, hi! I'm here. What's up?",
            "Hey — talk to me.",
          ];
          const greeting = greetings[Math.floor(Math.random() * greetings.length)];
          sessionPromise.then((session) => {
            session.sendClientContent({ turns: greeting, turnComplete: true });
          });

          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const inputAnalyser = audioContextRef.current!.createAnalyser();
          inputAnalyser.fftSize = 64;
          const processor = audioContextRef.current!.createScriptProcessor(2048, 1, 1);
          source.connect(inputAnalyser);
          inputAnalyser.connect(processor);
          inputAnalyserRef.current = inputAnalyser;
          startLevelMonitor();

          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);

            // VAD: compute RMS energy
            let rms = 0;
            for (let i = 0; i < inputData.length; i++) {
              rms += inputData[i] * inputData[i];
            }
            rms = Math.sqrt(rms / inputData.length);
            const isSpeech = rms > VAD_THRESHOLD;

            if (isSpeech) {
              vadSilenceFrames = 0;
            } else {
              vadSilenceFrames++;
            }

            // Skip sending silence frames after hangover
            if (!isSpeech && vadSilenceFrames > VAD_HANGOVER) return;

            // Downsample 24kHz → 16kHz (ratio 3:2) for Eburon live API
            const outLen = Math.floor(inputData.length * 2 / 3);
            const pcmData = new Int16Array(outLen);
            for (let j = 0; j < outLen; j++) {
              const idx = j * 1.5;
              const i = Math.floor(idx);
              const frac = idx - i;
              const sample = i + 1 < inputData.length
                ? inputData[i] * (1 - frac) + inputData[i + 1] * frac
                : inputData[i] || 0;
              pcmData[j] = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
            }
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            sessionPromise.then((session) => {
              session.sendRealtimeInput({
                media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
              });
            });
          };

          source.connect(processor);
          processor.connect(audioContextRef.current!.destination);

          streamRef.current = stream;
          processorRef.current = processor;
        },
        (message) => {
          if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const pcmData = new Int16Array(bytes.buffer);
            audioQueueRef.current.push(pcmData);
            if (!isPlayingRef.current) playNextInQueue();
          }

          if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
            const text = message.serverContent.modelTurn.parts[0].text;
            setLiveTranscription(prev => prev + ' ' + text);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'model' && last.text !== '' && !last.isImageGen) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + text };
                return updated;
              } else {
                return [...prev, { role: 'model', text }];
              }
            });
          }

          if (message.serverContent?.inputAudioTranscription?.text) {
            const userText = message.serverContent.inputAudioTranscription.text;
            setLiveTranscription(userText);
            // Save user's spoken words to Firebase as a user message
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'user' && last.text === userText) return prev; // dedupe
              const userMsg: Message = { role: 'user', text: userText };
              saveMessageToDb(userMsg);
              return [...prev, userMsg];
            });
          }

          // Save complete model turn to Firebase when turn is done
          if (message.serverContent?.turnComplete) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'model' && last.text) {
                saveMessageToDb(last);
              }
              return prev;
            });
          }

          if (message.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
            nextPlayTime = 0;
          }

          // Handle tool calls (e.g. proposePhoneTask →
          // user confirmation modal, then send to their phone).
          handleLiveToolCall(message);
        },
        (err) => console.error("Live error:", err),
        () => {
          console.log("Live session closed");
          stopLiveSession();
        },
        userContext,
        responseStyle,
        voiceName,
        language
      );

      liveSessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Failed to start live session:", err);
      const errMsg = err?.message || 'Could not connect to Beatrice. Please try again.';
      setMicError(errMsg);
      setIsVoiceOpen(false);
      // Clean up any partial state.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  };

  // Low-latency audio playback — schedules chunks back-to-back without gaps.
  // Uses a shared timeline so consecutive chunks play seamlessly.
  let nextPlayTime = 0;

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      // Reset the timeline when queue empties.
      nextPlayTime = 0;
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    const pcmData = audioQueueRef.current.shift()!;
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 0x7FFF;
    }

    const targetSampleRate = audioContextRef.current.sampleRate;
    const resampledData = resampleAudio(float32Data, 24000, targetSampleRate);

    const buffer = audioContextRef.current.createBuffer(1, resampledData.length, targetSampleRate);
    buffer.getChannelData(0).set(resampledData);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    const outputAnalyser = audioContextRef.current.createAnalyser();
    outputAnalyser.fftSize = 64;
    source.connect(outputAnalyser);
    outputAnalyser.connect(audioContextRef.current.destination);
    outputAnalyserRef.current = outputAnalyser;

    // Schedule back-to-back: if this is the first chunk or queue was empty,
    // start now. Otherwise, append to the previous chunk's end time.
    const now = audioContextRef.current.currentTime;
    if (nextPlayTime < now) {
      nextPlayTime = now;
    }
    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;

    source.onended = () => {
      outputAnalyserRef.current = null;
      // Immediately schedule the next chunk (no setTimeout gap).
      playNextInQueue();
    };
  };

  // Natural interruption handling - when user speaks while agent is speaking
  const handleUserInterruption = () => {
    console.log('Handling user interruption...');
    
    // 1. Clear audio queue and stop current playback
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    nextPlayTime = 0;
    
    // 2. Send a brief, natural backchannel — the kind a real person makes
    // when someone interrupts them on a phone call. Don't send a full sentence.
    if (liveSessionRef.current) {
      const backchannels = [
        "mm-hmm",
        "yeah",
        "ah huh",
        "right",
        "go on",
        "diba",
        "uh-huh",
        "hmm",
        "sge",
        "oh?",
        "wait—",
        "yeah, yeah",
      ];
      const backchannel = backchannels[Math.floor(Math.random() * backchannels.length)];
      
      liveSessionRef.current.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: backchannel }] }],
        turnComplete: false  // Don't complete the turn — let the user keep talking
      });
    }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch(e) {}
      liveSessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect();
      audioWorkletRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    stopLevelMonitor();
    setIsLiveActive(false);
    setIsVoiceOpen(false);
    setIsSpeaking(false);
    setLiveTranscription('');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const toggleVoiceMode = async (active: boolean) => {
    if (active) {
      setIsVoiceOpen(true);
      await startLiveSession();
    } else {
      stopLiveSession();
    }
  };

  const handleRetryImage = (prompt: string) => {
    setInput(prompt);
    sendMessage(prompt);
  };

  const handleEditImage = (prompt: string, imageUrl: string) => {
    setAttachment({ url: imageUrl, type: 'image/png' });
    setInput(`Edit this image: `);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  useEffect(() => {
    if (user) {
      fetchChatHistory();
    } else {
      setChatHistory([]);
      setCurrentChatId(null);
    }
  }, [user]);

  const fetchChatHistory = async () => {
    if (!user) return;
    try {
      const snapshot = await get(
        query(
          dbRef(database, `users/${user.uid}/chats`),
          orderByChild('created_at')
        )
      );
      if (snapshot.exists()) {
        const data: any[] = [];
        snapshot.forEach((child) => {
          data.push({ id: child.key, ...child.val() });
        });
        // RTDB returns ascending order; reverse for newest first
        setChatHistory(data.reverse());
      } else {
        setChatHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch chat history', err);
    }
  };

  const loadChat = async (chatId: string) => {
    setIsLoading(true);
    setIsSidebarOpen(false);
    setCurrentChatId(chatId);

    try {
      const snapshot = await get(
        query(
          dbRef(database, `users/${user?.uid}/chats/${chatId}/messages`),
          orderByChild('created_at')
        )
      );
      if (snapshot.exists()) {
        const formattedMessages: Message[] = [];
        snapshot.forEach((child) => {
          const m = child.val();
          formattedMessages.push({
            role: m.role,
            text: m.text,
            image: m.image_url || undefined,
            isImageGen: m.is_image_gen || undefined,
            originalPrompt: m.original_prompt || undefined,
          });
        });
        setMessages(formattedMessages);
        setView('chat');
      }
    } catch (err) {
      console.error('Failed to load chat', err);
    }
    setIsLoading(false);
  };

  const createNewChat = (initialText?: string) => {
    setMessages([]);
    setCurrentChatId(null);
    setView('home');
    setIsSidebarOpen(false);
  };

  const saveMessageToDb = async (msg: Message) => {
    if (!user) return;
    try {
      let chatId = currentChatId;

      if (!chatId) {
        // Create new chat in RTDB
        const title = msg.text.slice(0, 30) + (msg.text.length > 30 ? '...' : '');
        const chatsRef = push(dbRef(database, `users/${user.uid}/chats`));
        await set(chatsRef, {
          title: title,
          created_at: Date.now(),
        });
        chatId = chatsRef.key!;
        setCurrentChatId(chatId);
        fetchChatHistory();
      }

      let imageUrl = msg.image;
      if (msg.image && msg.image.startsWith('data:image')) {
        // Upload to Firebase Storage
        const base64Data = msg.image.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const fileName = `chat-images/${user.uid}/${Date.now()}.png`;

        const uploadResult = await uploadBytes(storageRef(storage, fileName), blob);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      // Save message to RTDB
      const messagesRef = push(dbRef(database, `users/${user.uid}/chats/${chatId}/messages`));
      await set(messagesRef, {
        role: msg.role,
        text: msg.text,
        image_url: imageUrl || null,
        is_image_gen: msg.isImageGen || null,
        original_prompt: msg.originalPrompt || null,
        created_at: Date.now(),
      });
    } catch (e) {
      console.error('Failed to save message to DB', e);
    }
  };

  const sendMessage = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() && !attachment) return;
    
    if (view === 'home') setView('chat');
    
    const userMessage: Message = { role: 'user', text: textToSend };
    if (attachment) {
      userMessage.image = attachment.url;
    }
    setMessages(prev => [...prev, userMessage]);
    saveMessageToDb(userMessage);
    setInput('');

    // Route all text through Eburon live audio (multimodal — responds with voice + text)
    if (!attachment) {
      if (!liveSessionRef.current) {
        await startChatLiveSession();
      }
      if (liveSessionRef.current) {
        try {
          liveSessionRef.current.sendClientContent({ turns: textToSend, turnComplete: true });
        } catch (e) {
          console.error('Failed to send text to live session', e);
        }
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      if (attachment) {
        const base64 = attachment.url.split(',')[1];
        const imageUrl = await editImage(textToSend, base64, attachment.type);
        if (imageUrl) {
          const modelMessage: Message = { role: 'model', text: 'Here is your edited image:', image: imageUrl, isImageGen: true, originalPrompt: textToSend };
          setMessages(prev => [...prev, modelMessage]);
          saveMessageToDb(modelMessage);
        } else {
           const modelMessage: Message = { role: 'model', text: 'Sorry, I could not edit the image.' };
           setMessages(prev => [...prev, modelMessage]);
           saveMessageToDb(modelMessage);
        }
        setAttachment(null);
      } else if (textToSend.toLowerCase().startsWith('create an image') || textToSend.toLowerCase().startsWith('generate an image') || textToSend.toLowerCase().startsWith('edit this image')) {
        const isBasic = imageSize === '1K' && aspectRatio === '1:1';
        if (!isBasic && window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await window.aistudio.openSelectKey();
          }
        }
        const imageUrl = await generateImage(textToSend, imageSize, aspectRatio);
        if (imageUrl) {
          const modelMessage: Message = { role: 'model', text: 'Here is your generated image:', image: imageUrl, isImageGen: true, originalPrompt: textToSend };
          setMessages(prev => [...prev, modelMessage]);
          saveMessageToDb(modelMessage);
        }
      } else {
        // Format history to ensure strictly alternating roles and valid text for memory
        const history: any[] = [];
        let expectedRole = 'user';
        
        for (const m of messages) {
          if (!m.text || m.isImageGen) continue;
          
          if (m.role === expectedRole) {
            history.push({
              role: m.role,
              parts: [{ text: m.text }]
            });
            expectedRole = expectedRole === 'user' ? 'model' : 'user';
          } else if (history.length > 0) {
            // If we get consecutive messages of the same role, append to the last one
            const lastMsg = history[history.length - 1];
            lastMsg.parts[0].text += '\n\n' + m.text;
          }
        }
        
        // Ensure history ends with 'model' so the new prompt can be 'user'
        if (history.length > 0 && history[history.length - 1].role === 'user') {
          history.pop();
        }
        
        // Initialize an empty model message
        const modelMessage: Message = { 
          role: 'model', 
          text: '',
        };
        
        setMessages(prev => [...prev, modelMessage]);
        
        let fullText = '';
        let groundingMetadata = null;
        
        try {
          const stream = generateChatResponseStream(textToSend, history, isThinking, isFastMode, userContext, responseStyle, [], ollamaModel || undefined);
          for await (const chunk of stream) {
            fullText += chunk.text || '';
            if (chunk.groundingMetadata) {
              groundingMetadata = chunk.groundingMetadata;
            }
            
            // Update the last message in the list
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.role === 'model') {
                lastMsg.text = fullText;
                lastMsg.groundingMetadata = groundingMetadata;
              }
              return newMessages;
            });
          }
          
          // Save the final message to DB
          const finalMessage = { ...modelMessage, text: fullText, groundingMetadata };
          saveMessageToDb(finalMessage);
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          // Fallback to non-streaming if needed or handle error
          throw streamError;
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const errorMessage: Message = { role: 'model', text: `Sorry, something went wrong. ${errMsg}` };
      setMessages(prev => [...prev, errorMessage]);
      saveMessageToDb(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      setVoiceStatus("Recording...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setVoiceStatus("Processing...");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsLoading(true);
          try {
            const transcription = await transcribeAudio(base64, 'audio/webm');
            if (transcription) {
              const lowerTranscript = transcription.toLowerCase().trim();
              
              // Voice Commands
              if (lowerTranscript.includes('create new chat') || lowerTranscript.includes('start new chat')) {
                createNewChat();
                setVoiceStatus(null);
                return;
              }
              if (lowerTranscript.includes('clear history') || lowerTranscript.includes('delete history')) {
                setMessages([]);
                setVoiceStatus(null);
                return;
              }
              if (lowerTranscript.includes('open settings') || lowerTranscript.includes('show settings')) {
                setActiveModal('settings');
                setVoiceStatus(null);
                return;
              }
              
              setInput(transcription);
              if (textareaRef.current) {
                textareaRef.current.focus();
              }
              sendMessage(transcription);
              setVoiceStatus(null);
            } else {
              setVoiceStatus("Could not transcribe audio.");
              setTimeout(() => setVoiceStatus(null), 3000);
            }
          } catch (error) {
            console.error(error);
            setVoiceStatus("Transcription failed.");
            setTimeout(() => setVoiceStatus(null), 3000);
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setVoiceStatus("Microphone access denied.");
      setTimeout(() => setVoiceStatus(null), 3000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (view === 'home') setView('chat');
    setIsMenuOpen(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const mimeType = file.type;
      
      const userMsg: Message = { role: 'user', text: `Analyzed ${file.name}`, image: event.target?.result as string };
      setMessages(prev => [...prev, userMsg]);
      saveMessageToDb(userMsg);
      setIsLoading(true);
      try {
        const response = await analyzeImage("What is in this image?", base64, mimeType);
        const modelMsg: Message = { role: 'model', text: response || '' };
        setMessages(prev => [...prev, modelMsg]);
        saveMessageToDb(modelMsg);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setIsMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: cameraFacing } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const switchCamera = async () => {
    const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(newFacing);
    
    // Stop current stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    // Start new stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: newFacing } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error switching camera:", err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setAttachment({ url: dataUrl, type: 'image/png' });
        if (view === 'home') setView('chat');
        stopCamera();
      }
    }
  };

  const triggerAction = (prompt: string) => {
    setInput(prompt);
    setIsMenuOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="flex justify-center h-[100dvh] overflow-hidden bg-zinc-900 font-sans">
      <div className="w-full max-w-md bg-black flex flex-col relative h-[100dvh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        {view !== 'splash' && view !== 'auth' && (
        <header className="flex justify-between items-center px-4 py-4 z-20 bg-black/80 backdrop-blur-md absolute top-0 w-full">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-11 h-11 bg-[#212121] rounded-full flex items-center justify-center text-white hover:bg-[#2f2f2f] transition-colors"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 8h16M4 16h10"></path></svg>
          </button>
          <div className="h-11 bg-[#212121] rounded-full flex items-center px-2 space-x-1">
            <button 
              onClick={() => setIsFastMode(!isFastMode)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isFastMode ? 'text-emerald-400 bg-emerald-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Fast Mode"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle></svg>
            </button>
            <button 
              onClick={() => setIsThinking(!isThinking)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isThinking ? 'text-blue-400 bg-blue-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Thinking Mode"
            >
              <Brain size={18} className={isThinking ? 'animate-pulse' : ''} />
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="w-9 h-9 flex items-center justify-center text-neutral-300 hover:text-white rounded-full"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="18" r="1.5"></circle></svg>
              </button>
              
              <AnimatePresence>
                {isHeaderMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setIsHeaderMenuOpen(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-2xl shadow-2xl z-40 overflow-hidden"
                    >
                      <button 
                        onClick={clearChat}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-400/10 transition-colors flex items-center space-x-2"
                      >
                        <X size={16} />
                        <span>Clear Chat</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        )}

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {view === 'splash' ? (
              <motion.main
                key="splash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setView(user ? 'home' : 'auth')}
                className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black cursor-pointer"
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="flex flex-col items-center"
                >
                  <div className="relative w-28 h-28 mb-6">
                    <motion.div
                      animate={{ boxShadow: ['0 0 20px rgba(255,255,255,0.1)', '0 0 40px rgba(255,255,255,0.2)', '0 0 20px rgba(255,255,255,0.1)'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="w-full h-full rounded-full border-2 border-white/20 bg-white/5 backdrop-blur-sm flex items-center justify-center"
                    >
                      <div className="relative w-16 h-16">
                        <Image
                          src="https://eburon.ai/icon-eburon.svg"
                          alt="Beatrice OS"
                          fill
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </motion.div>
                  </div>
                  <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="text-3xl font-bold tracking-tight text-white mb-2"
                  >
                    Beatrice OS
                  </motion.h1>
                  <motion.p
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                    className="text-sm text-neutral-500 font-medium tracking-wider uppercase"
                  >
                    Eburon AI mobile use Agent
                  </motion.p>
                </motion.div>
              </motion.main>
            ) : view === 'auth' ? (
              <motion.main
                key="auth"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center px-6 z-10 bg-black"
              >
                <div className="w-full max-w-sm">
                  <div className="flex flex-col items-center mb-10">
                    <div className="relative w-16 h-16 mb-4 rounded-full border-2 border-white/10 bg-white/5 flex items-center justify-center">
                      <div className="relative w-9 h-9">
                        <Image
                          src="https://eburon.ai/icon-eburon.svg"
                          alt="Beatrice OS"
                          fill
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                      {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
                    </h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      {authMode === 'signup' ? 'Sign up to get started with Beatrice' : 'Sign in to continue with Beatrice'}
                    </p>
                  </div>

                  {authError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-red-400 text-xs text-center">{authError}</p>
                    </div>
                  )}

                  <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                    <input
                      type="email"
                      placeholder="Email"
                      value={authEmail}
                      onChange={(e) => { setAuthEmail(e.target.value); setAuthError(''); }}
                      className="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl p-3.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={authPassword}
                      onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                      className="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl p-3.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
                    />
                    {authMode === 'signup' && (
                      <input
                        type="password"
                        placeholder="Confirm password"
                        value={authConfirmPassword}
                        onChange={(e) => { setAuthConfirmPassword(e.target.value); setAuthError(''); }}
                        className="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl p-3.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors"
                      />
                    )}
                    <button
                      type="submit"
                      onClick={authMode === 'signup' ? handleSignUp : handleSignIn}
                      disabled={authLoading}
                      className="w-full py-3 bg-white text-black rounded-xl font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50 text-sm"
                    >
                      {authLoading ? (
                        <span className="flex items-center justify-center space-x-2">
                          <Loader2 size={16} className="animate-spin" />
                          <span>{authMode === 'signup' ? 'Creating account...' : 'Signing in...'}</span>
                        </span>
                      ) : (
                        <span>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                      )}
                    </button>
                  </form>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-800" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-black px-4 text-xs text-neutral-600">or continue with</span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleSignIn}
                    disabled={authLoading}
                    className="w-full py-3 bg-[#1a1a1a] border border-neutral-800 rounded-xl font-medium hover:bg-[#252525] transition-colors disabled:opacity-50 flex items-center justify-center space-x-3"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-sm text-white font-medium">Google</span>
                  </button>

                  <div className="mt-8 text-center">
                    <button
                      onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); setAuthConfirmPassword(''); }}
                      className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                    >
                      {authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                    </button>
                  </div>
                </div>
              </motion.main>
            ) : view === 'home' ? (
              <motion.main
                key="home"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="absolute inset-0 flex flex-col items-center justify-center pb-20 pt-20 z-10"
              >
                <div className="mb-6 relative w-24 h-24 p-4 rounded-full border-2 border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <div className="relative w-full h-full">
                    <Image 
                      src="https://eburon.ai/icon-eburon.svg" 
                      alt="Beatrice OS Logo"
                      fill 
                      className="object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <h1 className="text-[28px] font-bold tracking-tight text-white mb-2">Beatrice OS</h1>
                <p className="text-sm font-medium text-neutral-400 mb-6">Eburon AI mobile use Agent</p>
                <div className="flex flex-col items-center space-y-1">
                  <p className="text-base text-neutral-200 font-medium"></p>
                  <p className="text-xs text-neutral-500 italic"></p>
                </div>
              </motion.main>
            ) : (
              <motion.main 
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                ref={scrollRef}
                className="absolute inset-0 overflow-y-auto hide-scrollbar pt-24 pb-24 px-4 z-10 flex flex-col space-y-6"
              >
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-[#2f2f2f] text-white rounded-tr-sm' : 'bg-transparent text-neutral-200'}`}>
                      {msg.role === 'model' ? (
                        <div className="flex items-start">
                          <div className="w-6 h-6 mr-3 shrink-0 rounded-md bg-white text-black flex items-center justify-center font-bold text-xs">E</div>
                          <div className="flex-1 overflow-hidden">
                            {msg.image && (
                              <div className="relative group mb-4">
                                <img src={msg.image} alt="Generated" className="rounded-xl w-full object-cover shadow-lg border border-white/10 cursor-pointer" referrerPolicy="no-referrer" onClick={() => window.open(msg.image, '_blank')} />
                                <div className="absolute top-2 right-2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                  <img src={msg.image} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-white/20" />
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                                  {msg.isImageGen && (
                                    <>
                                      <button
                                        onClick={() => msg.originalPrompt && handleRetryImage(msg.originalPrompt)}
                                        className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full transition-colors"
                                        title="Retry"
                                      >
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                      </button>
                                      <button
                                        onClick={() => msg.originalPrompt && handleEditImage(msg.originalPrompt, msg.image!)}
                                        className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full transition-colors"
                                        title="Edit"
                                      >
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                      </button>
                                    </>
                                  )}
                                  <a 
                                    href={msg.image} 
                                    download="generated-image.png"
                                    className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full font-medium text-sm transition-colors flex items-center space-x-2"
                                  >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                                    <span>Download</span>
                                  </a>
                                </div>
                              </div>
                            )}
                            <div className="markdown-body text-neutral-200">
                              <Markdown components={{ code: CodeBlock }}>{msg.text}</Markdown>
                            </div>
                            {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-white/10">
                                <p className="text-xs text-neutral-400 mb-2 flex items-center">
                                  <Search size={12} className="mr-1.5" /> Sources
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {msg.groundingMetadata.groundingChunks.map((chunk: any, idx: number) => {
                                    const web = chunk.web;
                                    if (!web) return null;
                                    return (
                                      <a 
                                        key={idx} 
                                        href={web.uri} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="inline-flex items-center max-w-full bg-[#2a2a2a] hover:bg-[#333] rounded-lg px-2.5 py-1.5 transition-colors text-xs text-blue-300 border border-white/5"
                                      >
                                        <span className="truncate max-w-[200px]">{web.title}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.image && <img src={msg.image} alt="Upload" className="rounded-lg mb-2 max-w-full" referrerPolicy="no-referrer" />}
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center space-x-3 text-neutral-400 text-sm">
                    <div className="w-6 h-6 shrink-0 rounded-md bg-white/10 text-white flex items-center justify-center">
                      <Loader2 size={14} className="animate-spin" />
                    </div>
                    <span>Beatrice is thinking...</span>
                  </div>
                )}
              </motion.main>
            )}
          </AnimatePresence>
        </div>

        {/* Live Transcription Bar */}
        {isLiveActive && liveTranscription && (
          <div className="absolute bottom-20 left-4 right-4 z-30 flex justify-center pointer-events-none">
            <div className="bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 max-w-[80%]">
              <p className="text-white/80 text-sm text-center line-clamp-3 leading-snug">
                {liveTranscription.trim()}
              </p>
            </div>
          </div>
        )}

        {/* Bottom Input Area */}
        {view !== 'splash' && view !== 'auth' && (
        <footer className="absolute bottom-0 px-4 pb-5 z-20 w-full bg-gradient-to-t from-black via-black to-transparent pt-6">
          <div className="flex items-end space-x-2">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="w-12 h-12 bg-[#212121] rounded-full flex items-center justify-center text-neutral-300 shrink-0 hover:bg-[#2f2f2f] transition-colors"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
            </button>

            <div className="flex-1 bg-[#212121] rounded-[24px] flex flex-col justify-end p-2 relative min-h-[52px]">
              {isThinking && (
                <div className="absolute -top-[42px] left-0 bg-[#202936] text-[#4ba1ff] rounded-full px-3 py-1.5 flex items-center space-x-2 w-max transition-opacity z-10">
                  <Brain size={16} className="animate-pulse" />
                  <span className="text-[13px] font-medium tracking-wide">Thinking</span>
                  <button onClick={() => setIsThinking(false)} className="text-[#4ba1ff] hover:text-blue-300 ml-1" title="Turn off thinking mode">
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex items-end w-full pr-1 pb-1">
                <AnimatePresence>
                  {attachment && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute -top-16 left-4 bg-[#2a2a2a] p-1 rounded-xl border border-neutral-700 shadow-lg flex items-center space-x-2"
                    >
                      <img src={attachment.url} alt="Attachment" className="w-12 h-12 object-cover rounded-lg" />
                      <button 
                        onClick={() => setAttachment(null)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  )}
                  {showImageSettings && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute -top-14 left-0 right-0 flex justify-center space-x-2 px-4"
                    >
                      <div className="flex items-center space-x-2 bg-[#1a1a1a] p-1 rounded-full border border-neutral-800 shadow-2xl">
                        <div className="flex items-center space-x-1 px-2 border-r border-neutral-800">
                          <ImageIcon size={14} className="text-purple-400" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Image Gen</span>
                        </div>
                        <select 
                          value={imageSize} 
                          onChange={(e) => setImageSize(e.target.value as any)}
                          className="bg-transparent text-[11px] font-medium text-white rounded-full px-2 py-1 focus:outline-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <select 
                          value={aspectRatio} 
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="bg-transparent text-[11px] font-medium text-white rounded-full px-2 py-1 focus:outline-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="1:1">1:1</option>
                          <option value="16:9">16:9</option>
                          <option value="9:16">9:16</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                        </select>
                        <button 
                          onClick={() => setShowImageSettings(false)}
                          className="p-1 text-neutral-500 hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center w-full">
                  <button 
                    onClick={() => setShowImageSettings(!showImageSettings)}
                    className={`p-1.5 ml-1 rounded-lg transition-colors ${showImageSettings ? 'text-purple-400 bg-purple-400/10' : 'text-neutral-500 hover:text-white'}`}
                    title="Image Generation Settings"
                  >
                    <PenTool size={18} />
                  </button>
                  <textarea 
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1} 
                    className="flex-1 bg-transparent text-white placeholder-neutral-400 text-[15px] focus:outline-none pl-2 py-1.5 hide-scrollbar"
                    placeholder={showImageSettings ? "Describe the image you want to create..." : "Ask Beatrice AI"}
                  />
                </div>
                
                {input.trim().length === 0 ? (
                  <>
                    <button 
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={`w-9 h-9 flex items-center justify-center shrink-0 transition-colors ${isRecording ? 'text-red-500' : 'text-neutral-400 hover:text-white'}`}
                    >
                      {isRecording ? <Square size={20} /> : <Mic size={20} />}
                    </button>
                    {voiceStatus && (
                      <div className="absolute bottom-16 left-4 bg-neutral-800 text-white text-xs px-2 py-1 rounded">
                        {voiceStatus}
                      </div>
                    )}
                    <button
                      onClick={() => toggleVoiceMode(true)}
                      className="w-[34px] h-[34px] bg-white rounded-full flex items-center justify-center shrink-0 ml-1 hover:scale-105 transition-transform relative"
                    >
                      <AudioWaveform size={16} className="text-black" />
                      {isLiveActive && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      )}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => sendMessage()}
                    className="w-[34px] h-[34px] bg-white text-black rounded-full flex items-center justify-center shrink-0 ml-1 hover:bg-neutral-200"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
        )}

        {/* Voice Mode Overlay */}
        <AnimatePresence>
          {isVoiceOpen && (
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden"
            >
              {/* Animated Background Gradients */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] transition-opacity duration-1000 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#F3E1C2]/10 rounded-full blur-[100px] transition-opacity duration-1000 ${isLiveActive && !isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
              </div>

              <div className="p-6 flex justify-between items-center text-neutral-400 relative z-10">
                <div className="flex items-center space-x-3 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                  <div className={`w-2.5 h-2.5 rounded-full ${!isLiveActive ? 'bg-yellow-400 animate-pulse' : isSpeaking ? 'bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]' : 'bg-[#D3B58B] shadow-[0_0_10px_rgba(211,181,139,0.8)]'}`} />
                  <span className="text-sm font-medium text-white">
                    {!isLiveActive ? 'Connecting to Beatrice...' : isSpeaking ? 'Beatrice is speaking' : 'Beatrice is listening'}
                  </span>
                </div>
                <button 
                  onClick={stopLiveSession}
                  className="p-2.5 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors backdrop-blur-md"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                <div className="relative flex items-center justify-center w-64 h-64">
                  {/* Listening Radar Ping */}
                  <AnimatePresence>
                    {isLiveActive && !isSpeaking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 2 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className="absolute inset-0 border-2 border-[#F3E1C2]/30 rounded-full"
                      />
                    )}
                  </AnimatePresence>

                  {/* Playback Progress Ring */}
                  <AnimatePresence>
                    {isSpeaking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 border-2 border-blue-500/20 rounded-full shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                      >
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-[-2px] border-t-2 border-l-2 border-blue-400 rounded-full"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Central Waveform — real-time audio visualizer */}
                  <div className="flex items-center space-x-2 h-24 relative z-10">
                    {/* Pluto-inspired warm color palette for the 5 bars */}
                    {(() => {
                      const plutoColors = [
                        '#F3E1C2', // Ivory / Warm Cream
                        '#D3B58B', // Champagne Beige
                        '#B89467', // Soft Gold / Sand
                        '#79604A', // Taupe Brown
                        '#2C1C14', // Dark Espresso Brown
                      ];
                      return (isSpeaking ? outputLevels : inputLevels).map((level, i) => (
                        <div
                          key={i}
                          className="w-3 rounded-full transition-all duration-75"
                          style={{
                            height: Math.max(4, level),
                            backgroundColor: plutoColors[i % plutoColors.length],
                            boxShadow: `0 0 10px ${plutoColors[i % plutoColors.length]}80`,
                          }}
                        />
                      ));
                    })()}
                  </div>
                </div>
                
                <div className="mt-16 px-8 w-full max-w-md text-center flex flex-col justify-center">
                  <AnimatePresence mode="wait">
                    {liveTranscription ? (
                      <motion.p
                        key="transcription"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-white text-xl font-medium leading-relaxed line-clamp-3"
                      >
                        "{liveTranscription.trim()}"
                      </motion.p>
                    ) : (
                      <motion.p 
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        className="text-white/60 text-sm tracking-[0.2em] uppercase font-medium"
                      >
                        {isLiveActive ? 'Start speaking...' : 'Establishing connection...'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="p-10 flex justify-center pb-16 relative z-10">
                <button 
                  onClick={stopLiveSession}
                  className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all hover:scale-105"
                >
                  <PhoneOff size={28} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar Menu */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="absolute inset-0 bg-black/60 z-50"
              />
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 left-0 w-[75%] h-full bg-[#111] z-50 flex flex-col"
              >
                <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <div className="relative w-8 h-8">
                      <Image 
                        src="https://eburon.ai/icon-eburon.svg" 
                        alt="Beatrice AI Logo" 
                        fill 
                        className="object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="font-semibold text-lg">Beatrice OS</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-neutral-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                
                <div className="p-4 border-b border-neutral-800">
                  <button 
                    onClick={() => createNewChat()}
                    className="w-full flex items-center justify-center space-x-2 bg-white text-black p-3 rounded-xl font-medium hover:bg-neutral-200 transition-colors"
                  >
                    <Plus size={18} />
                    <span>New Chat</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-2">History</div>
                  {chatHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm px-2 py-4 italic">No chat history yet</div>
                  ) : (
                    chatHistory.map((chat) => (
                      <button 
                        key={chat.id}
                        onClick={() => loadChat(chat.id)}
                        className={`w-full text-left p-3 rounded-xl transition-colors group flex items-center space-x-3 ${currentChatId === chat.id ? 'bg-[#212121] text-white' : 'text-neutral-400 hover:bg-[#212121] hover:text-white'}`}
                      >
                        <div className="flex-1 truncate text-sm font-medium">{chat.title}</div>
                        <div className="flex items-center space-x-2">
                          <div className="text-[10px] text-neutral-600 group-hover:text-neutral-400">
                            {new Date(chat.created_at).toLocaleDateString()}
                          </div>
                          <button 
                            onClick={(e) => deleteChat(e, chat.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-neutral-800 space-y-2">
                  <button onClick={() => setActiveModal('account')} className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors text-sm ${activeModal === 'account' ? 'bg-white text-black' : 'hover:bg-[#212121] text-neutral-300'}`}>
                    <User size={18} />
                    <span>Account</span>
                  </button>
                  <button onClick={() => setActiveModal('settings')} className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-colors text-sm ${activeModal === 'settings' ? 'bg-white text-black' : 'hover:bg-[#212121] text-neutral-300'}`}>
                    <Settings size={18} />
                    <span>Settings</span>
                  </button>
                  {user && (
                    <button onClick={handleSignOut} className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-[#212121] text-red-400 transition-colors text-sm">
                      <PhoneOff size={18} />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Settings Modals */}
        <AnimatePresence>
          {activeModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0a0a0a] z-[70] flex flex-col"
            >
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-[#1a1a1a] w-full h-full flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                  <h3 className="font-semibold text-white">
                    {activeModal === 'account' && 'Account Settings'}
                    {activeModal === 'settings' && 'Settings'}
                    {activeModal === 'data' && 'Data Controls'}
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-neutral-400 hover:text-white p-1">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto">
                  {activeModal === 'account' && (
                    <div className="space-y-4 text-sm text-neutral-300">
                      {user ? (
                        <>
                          <div className="flex items-center space-x-4 mb-6">
                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-lg font-semibold uppercase">
                              {user.email?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="text-white font-medium">User Account</p>
                              <p className="text-neutral-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="font-medium text-white">Subscription</p>
                            <p>Beatrice Plus (Active)</p>
                          </div>
                          <button onClick={handleSignOut} className="mt-4 w-full py-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors font-medium">
                            Sign Out
                          </button>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-white font-medium mb-4 text-center">
                            {authMode === 'signup' ? 'Create your account' : 'Sign in to your account'}
                          </p>
                          {authError && <p className="text-red-400 text-xs text-center">{authError}</p>}
                          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                            <input 
                              type="email" 
                              placeholder="Email" 
                              value={authEmail}
                              onChange={(e) => { setAuthEmail(e.target.value); setAuthError(''); }}
                              className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                            />
                            <input 
                              type="password" 
                              placeholder="Password" 
                              value={authPassword}
                              onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                              className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                            />
                            {authMode === 'signup' && (
                              <input 
                                type="password" 
                                placeholder="Confirm password" 
                                value={authConfirmPassword}
                                onChange={(e) => { setAuthConfirmPassword(e.target.value); setAuthError(''); }}
                                className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                              />
                            )}
                            <div className="space-y-2 pt-2">
                              {authMode === 'signup' ? (
                                <button 
                                  onClick={handleSignUp}
                                  disabled={authLoading}
                                  className="w-full py-2.5 bg-white text-black rounded-xl font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
                                >
                                  Create Account
                                </button>
                              ) : (
                                <button 
                                  onClick={handleSignIn}
                                  disabled={authLoading}
                                  className="w-full py-2.5 bg-white text-black rounded-xl font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
                                >
                                  Sign In
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); setAuthConfirmPassword(''); }}
                                className="w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
                              >
                                {authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                  {activeModal === 'settings' && (
                    <div className="space-y-4">
                      <p className="text-sm text-white mb-2">What would you like Beatrice to know about you to provide better responses?</p>
                      <textarea 
                        value={userContext}
                        onChange={(e) => setUserContext(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600 min-h-[120px]"
                        placeholder="e.g., I'm a software developer..."
                      />
                      <p className="text-sm text-white mt-4 mb-2">How would you like Beatrice to respond?</p>
                      <textarea
                        value={responseStyle}
                        onChange={(e) => setResponseStyle(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600 min-h-[120px]"
                        placeholder="e.g., Keep responses concise and use code examples..."
                      />

                      {/* Phone pairing — Beatrice Voice task queue */}
                      <p className="text-sm text-white mt-4 mb-2">Phones (send tasks)</p>
                      {pairedDevices.length === 0 ? (
                        <p className="text-xs text-neutral-500 mb-2">
                          No phone linked yet. Open the Beatrice OS app on your Android
                          phone to get a pairing code.
                        </p>
                      ) : (
                        <div className="space-y-2 mb-2">
                          {pairedDevices.map((d) => (
                            <div key={d.deviceId} className="flex items-center justify-between bg-[#212121] border border-neutral-800 rounded-xl p-3">
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">{d.name}</p>
                                <p className="text-xs text-neutral-500 truncate">{d.deviceId}</p>
                              </div>
                              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full shrink-0 ml-2">
                                Linked
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex space-x-2">
                        <input
                          value={pairingCodeInput}
                          onChange={(e) => setPairingCodeInput(e.target.value.toUpperCase())}
                          placeholder="Enter pairing code"
                          className="flex-1 bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600 uppercase tracking-widest"
                        />
                        <button
                          onClick={handlePairDevice}
                          disabled={!user || pairingCodeInput.trim().length < 4}
                          className="px-4 py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-neutral-200 disabled:opacity-40 transition-colors"
                        >
                          Link
                        </button>
                      </div>
                      {pairingStatus && (
                        <p className="text-xs mt-2 text-neutral-400">{pairingStatus}</p>
                      )}

                      {/* Voice selection */}
                      <p className="text-sm text-white mt-4 mb-2">Voice</p>
                      <select
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                      >
                        {EBURON_VOICES.map((v) => (
                          <option key={v.name} value={v.name}>{v.alias}</option>
                        ))}
                      </select>

                      {/* Language selection */}
                      <p className="text-sm text-white mt-4 mb-2">Language</p>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                      >
                        {EBURON_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>

                      <p className="text-sm text-white mt-4 mb-2">Theme</p>
                      <div className="flex bg-[#212121] p-1 rounded-xl border border-neutral-800">
                        {(['light', 'dark', 'system'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={`flex-1 py-2 text-sm rounded-lg capitalize ${theme === t ? 'bg-white text-black font-medium' : 'text-neutral-400 hover:text-white'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={saveSettings}
                        className="w-full py-3 bg-white text-black rounded-xl font-medium hover:bg-neutral-200 transition-colors mt-4"
                      >
                        Save Settings
                      </button>
                    </div>
                  )}
                  {activeModal === 'data' && (
                    <div className="space-y-6 text-sm text-neutral-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium mb-1">Chat History & Training</p>
                          <p className="text-xs text-neutral-500">Save new chats to your history and allow them to be used to improve our models.</p>
                        </div>
                        <div className="w-10 h-6 bg-emerald-500 rounded-full relative cursor-pointer shrink-0 ml-4">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-neutral-800">
                        <button className="text-white font-medium hover:underline">Export Data</button>
                        <p className="text-xs text-neutral-500 mt-1">Get a copy of your data sent to your email.</p>
                      </div>
                      <div className="pt-4 border-t border-neutral-800">
                        <button className="text-red-500 font-medium hover:underline">Delete Account</button>
                        <p className="text-xs text-neutral-500 mt-1">Permanently delete your account and all data.</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explore Apps Screen */}
        <AnimatePresence>
          {isAppsOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-[#0a0a0a] z-[60] flex flex-col"
            >
              <div className="flex items-center p-4 border-b border-neutral-800">
                <button 
                  onClick={() => setIsAppsOpen(false)}
                  className="p-2 text-white hover:bg-[#212121] rounded-full mr-2"
                >
                  <ChevronLeft size={24} />
                </button>
                <h2 className="text-lg font-semibold">Explore Apps</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div 
                  onClick={() => { triggerAction('Help me write a marketing copy for...'); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-xl">✍️</div>
                  <div>
                    <h3 className="font-medium">Copywriter</h3>
                    <p className="text-xs text-neutral-400">Generate marketing copy</p>
                  </div>
                </div>
                <div 
                  onClick={() => { triggerAction('Debug this code for me: '); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-xl">💻</div>
                  <div>
                    <h3 className="font-medium">Code Guru</h3>
                    <p className="text-xs text-neutral-400">Debug and write software</p>
                  </div>
                </div>
                <div 
                  onClick={() => { triggerAction('Create a creative image of...'); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-xl">🎨</div>
                  <div>
                    <h3 className="font-medium">Artisan</h3>
                    <p className="text-xs text-neutral-400">Creative image generation</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera Overlay */}
        <AnimatePresence>
          {isCameraOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-[100] flex flex-col"
            >
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
                  <button 
                    onClick={stopCamera}
                    className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                  >
                    <X size={20} />
                  </button>
                  <button 
                    onClick={switchCamera}
                    className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              </div>
              
              <div className="h-32 bg-black flex items-center justify-center px-10">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-1"
                >
                  <div className="w-full h-full rounded-full border-4 border-black bg-white"></div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment Bottom Sheet */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                className="absolute inset-0 bg-black/60 z-30"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 w-full bg-[#1a1a1a] rounded-t-[28px] z-40 flex flex-col pb-6 px-4"
              >
                <div className="w-full flex justify-center pt-3 pb-5">
                  <div className="w-10 h-1 bg-[#444] rounded-full"></div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <button 
                    onClick={startCamera}
                    className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors"
                  >
                    <Camera size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Camera</span>
                  </button>
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <ImageIcon size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Photos</span>
                  </label>
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                    <FileText size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Files</span>
                  </label>
                </div>

                <div className="w-full h-px bg-[#333] my-2"></div>

                <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col pt-2 max-h-[40vh]">
                  <button 
                    onClick={() => triggerAction('Create an image of...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Create image</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Visualize anything</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Search the web for recent news regarding...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Web search</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Find real-time news and info</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Teach me a new concept about...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Study and learn</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Learn a new concept</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Activate agent mode to help me format...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Agent mode</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Get work done for you</div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => { setIsMenuOpen(false); setIsAppsOpen(true); }}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Explore apps</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ─── Task proposal confirmation modal ──────────────── */}
        <AnimatePresence>
          {pendingProposal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#1a1a1a] border border-neutral-800 rounded-2xl p-6 w-full max-w-md"
              >
                <h3 className="text-white font-semibold mb-1">Send this task to your phone?</h3>
                <p className="text-sm text-neutral-300 mb-4">{pendingProposal.goal}</p>
                {pendingProposal.steps.length > 0 && (
                  <ol className="text-xs text-neutral-400 space-y-1 mb-4 list-decimal list-inside">
                    {pendingProposal.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
                {pendingProposal.app && (
                  <p className="text-xs text-neutral-500 mb-4">App: {pendingProposal.app}</p>
                )}
                <div className="flex space-x-3">
                  <button
                    onClick={handleProposalCancel}
                    disabled={proposalConfirming}
                    className="flex-1 py-3 bg-[#212121] text-neutral-300 rounded-xl text-sm font-medium hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors"
                  >
                    Not now
                  </button>
                  <button
                    onClick={handleProposalConfirm}
                    disabled={proposalConfirming || pairedDevices.length === 0}
                    className="flex-1 py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-neutral-200 disabled:opacity-40 transition-colors"
                  >
                    {proposalConfirming ? 'Sending...' : 'Send to phone'}
                  </button>
                </div>
                {pairedDevices.length === 0 && !proposalConfirming && (
                  <p className="text-xs text-amber-400/80 mt-3">
                    No linked phone. Link one in Settings (gear icon) first.
                  </p>
                )}
                {taskStatus && !proposalConfirming && (
                  <p className="text-xs text-neutral-400 mt-3">{taskStatus}</p>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
