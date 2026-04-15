import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageCircle, 
  ChefHat, 
  BookOpen, 
  Send, 
  Soup, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Camera,
  Heart,
  Activity,
  X,
  Plus,
  FileText,
  Download,
  Calendar as CalendarIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  Map as MapIcon,
  Globe,
  Sparkles,
  Star,
  Mic,
  CloudRain,
  Flame,
  Trees,
  Waves,
  Music,
  Play,
  Pause,
  Volume2
} from 'lucide-react';
import { Mood, Recipe, DiaryEntry } from './types';
import { MoodIcon } from './components/MoodIcons';
import { get, set } from 'idb-keyval';
import { REGIONAL_FOODS } from './constants/regions';
import { chatAsFriend, chatAsCookingAgent, chatAsNutritionist, generateRecipe, generateFoodImage, generateStepFeedback, generateCookingSummary, initializeGemini } from './services/gemini';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';
import { GachaCapsule } from './components/GachaCapsule';
import { Key } from 'lucide-react';

const WHITE_NOISES = [
  { id: 'rain', name: '雨声', icon: CloudRain, url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' },
  { id: 'fire', name: '柴火', icon: Flame, url: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg' },
  { id: 'forest', name: '森林', icon: Trees, url: 'https://actions.google.com/sounds/v1/ambiences/forest_daybreak.ogg' },
  { id: 'ocean', name: '海浪', icon: Waves, url: 'https://actions.google.com/sounds/v1/water/waves_crashing_on_shore.ogg' },
];

const VOICE_PERSONAS = [
  { id: 'Kore', name: '温柔女声', description: '如微风般的轻柔陪伴' },
  { id: 'Charon', name: '清冷陪伴音', description: '沉稳安静的守护' },
  { id: 'Puck', name: '元气朋友感', description: '充满活力的鼓励' },
];

const playPCMBase64 = async (base64: string, sampleRate: number = 24000): Promise<AudioBufferSourceNode> => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const float32Data = new Float32Array(bytes.length / 2);
  const dataView = new DataView(bytes.buffer);
  for (let i = 0; i < float32Data.length; i++) {
    float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
  }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = audioCtx.createBuffer(1, float32Data.length, sampleRate);
  audioBuffer.getChannelData(0).set(float32Data);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start();
  return source;
};

export default function App() {
  const [view, setView] = useState<'chat' | 'cooking' | 'diary' | 'map' | 'recipes'>('chat');
  const [chatMode, setChatMode] = useState<'friend' | 'cooking' | 'nutrition'>('friend');
  const [messages, setMessages] = useState<{ 
    role: 'user' | 'agent'; 
    content: string; 
    mood?: Mood; 
    imageUrl?: string;
    gacha?: {
      dish: string;
      imageUrl?: string;
      isOpened: boolean;
    }
  }[]>([
    { role: 'agent', content: '你好呀！今天过得怎么样？有什么开心的或者烦心的事情，都可以跟我说说哦。' }
  ]);
  const [input, setInput] = useState('');
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [currentMood, setCurrentMood] = useState<Mood | null>(null);
  const [postMood, setPostMood] = useState<Mood | null>(null);
  const [recommendedDish, setRecommendedDish] = useState<string | null>(null);
  const [currentRecipe, setCurrentRecipe] = useState<Recipe | null>(null);
  const [cookingStep, setCookingStep] = useState(0);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedDayEntries, setSelectedDayEntries] = useState<DiaryEntry[] | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<typeof REGIONAL_FOODS[0] | null>(null);
  const [diaryMode, setDiaryMode] = useState<'wall' | 'calendar'>('wall');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [manualEntryData, setManualEntryData] = useState({
    foodName: '',
    mood: 'happy' as Mood,
    reflection: '',
    images: [] as string[],
    region: ''
  });

  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeNoise, setActiveNoise] = useState<string | null>(null);
  const [isNoisePlaying, setIsNoisePlaying] = useState(false);
  const [stepImages, setStepImages] = useState<Record<number, string>>({});
  const stepImageInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedEntry) {
      setCurrentImageIndex(0);
    }
  }, [selectedEntry]);

  const moodMap: Record<Mood, { label: string }> = {
    happy: { label: '开心' },
    sad: { label: '伤心' },
    tired: { label: '疲惫' },
    stressed: { label: '压力' },
    anxious: { label: '焦虑' },
    lonely: { label: '孤独' },
    neutral: { label: '平静' },
  };

  const exportToTxt = () => {
    if (!currentRecipe) return;
    
    let content = `食愈 Healing - ${currentRecipe.title}\n`;
    content += `====================================\n\n`;
    content += `【简介】\n${currentRecipe.description}\n\n`;
    content += `【食材清单】\n`;
    currentRecipe.ingredients.forEach(ing => {
      content += `- ${ing}\n`;
    });
    content += `\n【烹饪步骤】\n`;
    currentRecipe.steps.forEach((step, index) => {
      content += `${index + 1}. ${step.instruction}\n`;
    });
    content += `\n\n-- 愿美食带给你好心情 --`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentRecipe.title}_食谱.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToPdf = () => {
    window.print();
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load diary, recipes and API key from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedApiKey = await get('gemini_api_key');
        if (savedApiKey) {
          setApiKey(savedApiKey);
          initializeGemini(savedApiKey);
        } else if (!process.env.GEMINI_API_KEY) {
          setShowApiKeyModal(true);
        }

        const savedDiary = await get('food_healing_diary');
        if (savedDiary) {
          const parsed = typeof savedDiary === 'string' ? JSON.parse(savedDiary) : savedDiary;
          const migrated = parsed.map((entry: any) => ({
            ...entry,
            recipeImageUrls: entry.recipeImageUrls || (entry.recipeImageUrl ? [entry.recipeImageUrl] : []),
            moodAfter: entry.moodAfter || entry.moodBefore || 'neutral',
            summary: entry.summary || entry.thought || ''
          }));
          setDiaryEntries(migrated);
        }
        
        const savedRecipeBook = await get('food_healing_recipes');
        if (savedRecipeBook) {
          const parsed = typeof savedRecipeBook === 'string' ? JSON.parse(savedRecipeBook) : savedRecipeBook;
          setSavedRecipes(parsed);
        }
      } catch (e) {
        console.error("Failed to load data from IndexedDB", e);
      }
    };
    loadData();
  }, []);

  const saveDiary = async (newEntries: DiaryEntry[]) => {
    setDiaryEntries(newEntries);
    try {
      await set('food_healing_diary', newEntries);
    } catch (e) {
      console.error("Failed to save diary to IndexedDB", e);
    }
  };

  const saveRecipes = async (newRecipes: Recipe[]) => {
    setSavedRecipes(newRecipes);
    try {
      await set('food_healing_recipes', newRecipes);
    } catch (e) {
      console.error("Failed to save recipes to IndexedDB", e);
    }
  };

  const handleSaveApiKey = async () => {
    if (!tempApiKey.trim()) return;
    setApiKey(tempApiKey);
    initializeGemini(tempApiKey);
    await set('gemini_api_key', tempApiKey);
    setShowApiKeyModal(false);
  };

  const handleModeSwitch = (mode: 'friend' | 'cooking' | 'nutrition') => {
    setChatMode(mode);
    setRecommendedDish(null);
    let openingMessage = '';
    if (mode === 'friend') {
      openingMessage = '你好呀！今天过得怎么样？有什么开心的或者烦心的事情，都可以跟我说说哦。';
    } else if (mode === 'cooking') {
      openingMessage = '今天想吃点什么？或者告诉我你手头有什么食材，我来帮你搭配一份美味吧！';
    } else if (mode === 'nutrition') {
      openingMessage = '你好！我是你的专属营养师。请告诉我你今天的饮食情况，或者上传食物照片，我来帮你分析热量和营养搭配。';
    }
    setMessages([{ role: 'agent', content: openingMessage }]);
  };

  const handleSend = async () => {
    if ((!input.trim() && !chatImage) || isTyping) return;

    const userMsg = input;
    const currentImage = chatImage;
    
    setInput('');
    setChatImage(null);
    setMessages(prev => [...prev, { role: 'user', content: userMsg, imageUrl: currentImage || undefined }]);
    setIsTyping(true);

    const historyStr = messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n');

    try {
      if (chatMode === 'nutrition') {
        const { messages: replyMessages } = await chatAsNutritionist(historyStr, userMsg, currentImage || undefined);
        for (let i = 0; i < replyMessages.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
          setMessages(prev => [...prev, { role: 'agent', content: replyMessages[i] }]);
        }
      } else if (chatMode === 'cooking') {
        const { messages: replyMessages, recommendation, mood } = await chatAsCookingAgent(historyStr, userMsg);
        if (mood) setCurrentMood(mood);
        
        for (let i = 0; i < replyMessages.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
          setMessages(prev => [...prev, { role: 'agent', content: replyMessages[i], mood: i === replyMessages.length - 1 ? mood : undefined }]);
        }
        
        if (recommendation) {
          setRecommendedDish(recommendation);
          setTimeout(() => {
            setMessages(prev => [...prev, { 
              role: 'agent', 
              content: `👇 你的专属美食盲盒已送达，点击开启！`,
              mood: mood,
              gacha: { dish: recommendation, isOpened: false }
            }]);
            
            // Generate image in background
            generateFoodImage(recommendation).then(imageUrl => {
              setMessages(prev => prev.map(msg => 
                msg.gacha?.dish === recommendation ? { ...msg, gacha: { ...msg.gacha, imageUrl } } : msg
              ));
            }).catch(err => console.error("Failed to generate food image", err));
          }, 1000);
        }
      } else {
        // friend mode
        const { messages: replyMessages, switchToCooking, mood } = await chatAsFriend(historyStr, userMsg);
        if (mood) setCurrentMood(mood);

        for (let i = 0; i < replyMessages.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
          setMessages(prev => [...prev, { role: 'agent', content: replyMessages[i], mood: i === replyMessages.length - 1 ? mood : undefined }]);
        }

        if (switchToCooking) {
          setChatMode('cooking');
        }
      }
    } catch (error: any) {
      console.error(error);
      let errorMessage = "抱歉，厨房开小差了，能再说一遍吗？";
      
      if (error.message === "AI_QUOTA_EXCEEDED") {
        errorMessage = "抱歉，食愈 AI 正在休息中（配额已达上限），请稍后再来找我聊天吧。";
      } else if (error.message === "API_KEY_MISSING") {
        errorMessage = "抱歉，我需要您的 Gemini API Key 才能开始工作。请点击右上角的钥匙图标进行设置。";
        setShowApiKeyModal(true);
      }
      
      setMessages(prev => [...prev, { role: 'agent', content: errorMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const [cookingPhase, setCookingPhase] = useState<'mindfulness' | 'prep' | 'cooking'>('mindfulness');
  const [mindfulnessTimer, setMindfulnessTimer] = useState(30);
  const [mindfulnessStarted, setMindfulnessStarted] = useState(false);
  const [stepFeedback, setStepFeedback] = useState<{ text: string, id: number } | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (view === 'cooking' && cookingPhase === 'mindfulness' && mindfulnessStarted && mindfulnessTimer > 0) {
      interval = setInterval(() => {
        setMindfulnessTimer(prev => prev - 1);
      }, 1000);
    } else if (mindfulnessTimer === 0 && cookingPhase === 'mindfulness') {
      setCookingPhase('prep');
    }
    return () => clearInterval(interval);
  }, [view, cookingPhase, mindfulnessTimer, mindfulnessStarted]);

  const voiceSequenceRef = useRef(0);

  const playStepVoice = (text: string) => {
    if (!isVoiceEnabled) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (currentAudioSource.current) {
      currentAudioSource.current.stop();
      currentAudioSource.current = null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95; // Slightly slower for healing vibe
    utterance.pitch = 1.0;
    
    setIsVoicePlaying(true);
    
    utterance.onend = () => {
      setIsVoicePlaying(false);
    };
    
    utterance.onerror = () => {
      setIsVoicePlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleOpenGacha = (index: number) => {
    setMessages(prev => prev.map((msg, i) => 
      i === index && msg.gacha ? { ...msg, gacha: { ...msg.gacha, isOpened: true } } : msg
    ));
  };

  const startCooking = async () => {
    if (!recommendedDish || !currentMood) return;
    setIsTyping(true);
    try {
      const recipe = await generateRecipe(recommendedDish, currentMood);
      // Generate main image
      const mainImg = await generateFoodImage(recipe.title);
      recipe.mainImageUrl = mainImg;
      
      // Generate first step image
      const firstStepImg = await generateFoodImage(recipe.steps[0].imagePrompt);
      recipe.steps[0].imageUrl = firstStepImg;

      setCurrentRecipe(recipe);
      setCookingStep(0);
      setCookingPhase('mindfulness');
      setMindfulnessTimer(30);
      setMindfulnessStarted(false);
      setActiveNoise(WHITE_NOISES[0].url);
      setIsNoisePlaying(true);
      setView('cooking');
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message === "AI_QUOTA_EXCEEDED"
        ? "抱歉，食愈 AI 正在休息中（配额已达上限），请稍后再来找我聊天吧。"
        : "抱歉，我刚才在厨房里迷路了，没能准备好食谱。请再试一次好吗？";
      setMessages(prev => [...prev, { role: 'agent', content: errorMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const startActualCooking = () => {
    setCookingPhase('cooking');
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    if (isVoiceEnabled && currentRecipe) {
      playStepVoice(currentRecipe.steps[0].instruction);
    }
  };

  const nextStep = () => {
    // Stop any ongoing speech immediately
    window.speechSynthesis.cancel();
    if (currentAudioSource.current) {
      currentAudioSource.current.stop();
      currentAudioSource.current = null;
    }

    if (!currentRecipe || cookingStep >= currentRecipe.steps.length - 1) {
      // Pre-fill uploadedImages with step images
      const stepImagesArray = Object.values(stepImages);
      if (stepImagesArray.length > 0) {
        setUploadedImages(stepImagesArray);
      }
      setShowReflection(true);
      return;
    }

    const nextIdx = cookingStep + 1;
    const completedStepInstruction = currentRecipe.steps[cookingStep].instruction;
    setCookingStep(nextIdx);

    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    if (isVoiceEnabled) {
      // Delay voice slightly until cloud starts appearing (1.5 seconds)
      voiceTimeoutRef.current = setTimeout(() => {
        playStepVoice(currentRecipe.steps[nextIdx].instruction);
      }, 1500);
    }

    // Run async tasks in background
    (async () => {
      const moodToUse = currentMood || 'neutral';
      
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);

      // Show a quick placeholder so the cloud appears immediately
      const placeholders = ["做得真棒！", "很有大厨范儿呢~", "闻到香味了吗？", "继续保持这个节奏。"];
      const randomPlaceholder = placeholders[Math.floor(Math.random() * placeholders.length)];
      setStepFeedback({ text: randomPlaceholder, id: Date.now() });

      try {
        const feedbackText = await generateStepFeedback(completedStepInstruction, moodToUse);
        // Update with real AI feedback
        setStepFeedback({ text: feedbackText, id: Date.now() });
      } catch (e) {
        console.error("Failed to generate feedback", e);
      } finally {
        feedbackTimeoutRef.current = setTimeout(() => setStepFeedback(null), 5000);
      }
    })();

    if (!currentRecipe.steps[nextIdx].imageUrl) {
      generateFoodImage(currentRecipe.steps[nextIdx].imagePrompt)
        .then(img => {
          setCurrentRecipe(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            updated.steps[nextIdx].imageUrl = img;
            return updated;
          });
        })
        .catch(error => {
          console.error("Failed to generate step image:", error);
        });
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isNoisePlaying && activeNoise) {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isNoisePlaying, activeNoise]);

  useEffect(() => {
    if (view !== 'cooking') {
      setIsNoisePlaying(false);
    }
  }, [view]);

  const isProcessingRef = useRef(false);
  const finishCooking = () => {
    // 1. UI FIRST - No matter what, close the modal and switch view immediately
    // This solves the "stuck" issue for the user
    setShowReflection(false);
    setView('diary');

    // 2. Check if we are already processing to prevent double saves
    if (isProcessingRef.current) {
      return;
    }
    
    // 3. Fallback for missing data instead of aborting
    // If currentMood is missing (e.g. started from regional foods), default to 'neutral'
    const effectiveMood = currentMood || 'neutral';
    
    if (!currentRecipe) {
      console.warn("Finish cooking: missing recipe, but UI closed anyway");
      return;
    }
    
    isProcessingRef.current = true;
    
    // Capture state values for background task
    const entryId = Math.random().toString(36).substring(7);
    const finalPostMood = postMood || 'neutral';
    const finalReflection = reflectionText;
    const dishTitle = currentRecipe.title;
    const dishRegion = currentRecipe.region;
    const dishMainImage = currentRecipe.mainImageUrl || '';
    const finalImages = uploadedImages.length > 0 ? uploadedImages : [dishMainImage];
    const currentRecipeObj = currentRecipe;
    const currentDiaryEntries = [...diaryEntries];
    const currentSavedRecipes = [...savedRecipes];

    // 4. Clear temporary states
    setReflectionText('');
    setUploadedImages([]);
    setStepImages({});
    setPostMood(null);

    // 5. Background processing
    setTimeout(async () => {
      try {
        const newEntry: DiaryEntry = {
          id: entryId,
          date: new Date().toLocaleDateString(),
          recipeTitle: dishTitle,
          recipeImageUrls: finalImages,
          moodBefore: effectiveMood,
          moodAfter: finalPostMood,
          reflection: finalReflection,
          thought: '', 
          summary: "正在感悟这段时光...", 
          region: dishRegion
        };

        await saveDiary([newEntry, ...currentDiaryEntries]);
        
        if (!currentSavedRecipes.find(r => r.title === dishTitle)) {
          await saveRecipes([currentRecipeObj, ...currentSavedRecipes]);
        }

        try {
          const summary = await generateCookingSummary(effectiveMood, finalPostMood, dishTitle, finalReflection);
          setDiaryEntries(prev => {
            const next = prev.map(e => e.id === entryId ? { ...e, summary } : e);
            set('food_healing_diary', next).catch(err => console.error("Failed to persist background summary", err));
            return next;
          });
        } catch (error) {
          console.error("Background summary generation failed", error);
          setDiaryEntries(prev => prev.map(e => e.id === entryId ? { ...e, summary: '' } : e));
        }
      } catch (error) {
        console.error("Background save failed", error);
      } finally {
        isProcessingRef.current = false;
      }
    }, 100);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setManualEntryData(prev => ({ 
          ...prev, 
          images: [...prev.images, reader.result as string] 
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleManualSubmit = async () => {
    if (!manualEntryData.foodName || manualEntryData.images.length === 0) {
      alert('请填写食物名称并上传至少一张照片');
      return;
    }

    setIsSaving(true);
    try {
      const newEntry: DiaryEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        date: new Date().toLocaleDateString(),
        recipeTitle: manualEntryData.foodName,
        recipeImageUrls: manualEntryData.images,
        moodBefore: manualEntryData.mood,
        moodAfter: manualEntryData.mood,
        reflection: manualEntryData.reflection,
        thought: '',
        summary: manualEntryData.reflection, // Use reflection as summary for manual entries
        region: manualEntryData.region
      };

      await saveDiary([newEntry, ...diaryEntries]);
      setShowManualEntry(false);
      setManualEntryData({
        foodName: '',
        mood: 'happy',
        reflection: '',
        images: [],
        region: ''
      });
      setView('diary');
    } catch (error) {
      console.error("Manual submit failed", error);
      alert("保存失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStepImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setStepImages(prev => ({ ...prev, [cookingStep]: reader.result as string }));
    };
    reader.readAsDataURL(file);
    // Reset input value so the same file can be selected again if needed
    if (stepImageInputRef.current) {
      stepImageInputRef.current.value = '';
    }
  };

  const moodStyles: Record<Mood | 'default', { bg: string, animation: string, padding: string }> = {
    happy: { bg: 'bg-amber-50/80', animation: 'animate-bounce-slow', padding: 'p-6' },
    sad: { bg: 'bg-blue-50/50', animation: 'animate-pulse-slow', padding: 'p-8' },
    anxious: { bg: 'bg-stone-50/60', animation: 'animate-breathe', padding: 'p-10' },
    tired: { bg: 'bg-indigo-50/40', animation: 'animate-pulse-slow', padding: 'p-8' },
    stressed: { bg: 'bg-teal-50/40', animation: 'animate-breathe', padding: 'p-10' },
    lonely: { bg: 'bg-orange-50/60', animation: 'animate-pulse-slow', padding: 'p-8' },
    neutral: { bg: 'bg-brand-cream', animation: '', padding: 'p-6' },
    default: { bg: 'bg-brand-cream', animation: '', padding: 'p-6' },
  };

  const currentMoodStyle = currentMood ? moodStyles[currentMood] : moodStyles.default;

  return (
    <div className="h-screen w-full bg-brand-cream flex flex-col items-center justify-center p-6 md:p-16 overflow-hidden">
      <div className={cn("w-full max-w-6xl h-full flex flex-col shadow-2xl relative overflow-hidden print:hidden transition-colors duration-1000 rounded-[32px] md:rounded-[40px]", currentMoodStyle.bg)}>
      <audio 
        ref={audioRef} 
        src={activeNoise || undefined} 
        className="hidden" 
        loop
        onError={(e) => console.error("White noise failed to load:", activeNoise, e)}
      />
      {/* Background Decoration */}
      <div 
        className={cn("absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] max-w-96 max-h-96 bg-brand-olive/5 rounded-full blur-3xl transition-all duration-1000", currentMoodStyle.animation)} 
      />
      <div 
        className={cn("absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] bg-brand-olive/10 rounded-full blur-3xl transition-all duration-1000", currentMoodStyle.animation)} 
      />

      {/* Steam Effect */}
      <AnimatePresence>
        {view === 'cooking' && cookingPhase === 'cooking' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-0 mix-blend-screen"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 100%, rgba(255,255,255,0.8) 0%, transparent 60%)',
              filter: 'blur(40px)',
              animation: 'breathe 8s infinite alternate'
            }}
          />
        )}
      </AnimatePresence>

      {/* Warm Light Effect */}
      <AnimatePresence>
        {showReflection && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-40 mix-blend-overlay"
            style={{
              background: 'radial-gradient(circle at 50% 40%, rgba(255, 200, 100, 0.4) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={cn(
        "p-6 flex justify-between items-center border-b border-brand-olive/10 z-20 bg-white/50 backdrop-blur-sm relative flex-shrink-0 transition-all duration-300",
        selectedRegion ? "opacity-0 -translate-y-full pointer-events-none" : "opacity-100 translate-y-0"
      )}>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-olive rounded-full flex items-center justify-center text-white">
            <Soup size={20} />
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight">食愈 Healing</h1>
        </div>
        <nav className="flex gap-4">
          <button 
            onClick={() => setView('chat')}
            className={cn("p-2 rounded-full transition-colors", view === 'chat' ? "bg-brand-olive text-white" : "hover:bg-brand-olive/10")}
          >
            <MessageCircle size={20} />
          </button>
          <button 
            onClick={() => setView('recipes')}
            className={cn("p-2 rounded-full transition-colors", view === 'recipes' ? "bg-brand-olive text-white" : "hover:bg-brand-olive/10")}
            title="食谱本"
          >
            <ChefHat size={20} />
          </button>
          <button 
            onClick={() => setView('diary')}
            className={cn("p-2 rounded-full transition-colors", view === 'diary' ? "bg-brand-olive text-white" : "hover:bg-brand-olive/10")}
          >
            <BookOpen size={20} />
          </button>
          <button 
            onClick={() => setView('map')}
            className={cn("p-2 rounded-full transition-colors", view === 'map' ? "bg-brand-olive text-white" : "hover:bg-brand-olive/10")}
          >
            <MapIcon size={20} />
          </button>
          <div className="w-px h-4 bg-brand-olive/10 self-center mx-1" />
          <button 
            onClick={() => {
              setTempApiKey(apiKey);
              setShowApiKeyModal(true);
            }}
            className={cn("p-2 rounded-full transition-colors hover:bg-brand-olive/10 text-brand-olive/60")}
            title="设置 API Key"
          >
            <Key size={20} />
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden z-0">
        <AnimatePresence mode="wait">
          {view === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col h-full"
            >
              <div className={cn("flex-1 overflow-y-auto custom-scrollbar pt-10 space-y-6 flex flex-col transition-all duration-1000", currentMoodStyle.padding)}>
                <div className="flex flex-col gap-4">
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "max-w-[85%] md:max-w-[70%] p-4 rounded-2xl",
                        msg.role === 'user' 
                          ? "self-end bg-brand-olive text-white rounded-tr-none" 
                          : "self-start bg-white border border-brand-olive/10 rounded-tl-none shadow-sm"
                      )}
                    >
                      <div className="prose prose-sm prose-stone">
                        {msg.imageUrl && (
                          <img src={msg.imageUrl} alt="User upload" className="rounded-xl mb-2 max-w-full h-auto max-h-48 object-cover" />
                        )}
                        <Markdown>{msg.content}</Markdown>
                      </div>
                      {msg.mood && (
                        <div className="mt-2 text-[10px] uppercase tracking-widest opacity-60 font-bold">
                          当前情绪: {msg.mood}
                        </div>
                      )}
                      {msg.gacha && (
                        <GachaCapsule 
                          dish={msg.gacha.dish} 
                          imageUrl={msg.gacha.imageUrl} 
                          isOpened={msg.gacha.isOpened} 
                          onOpen={() => handleOpenGacha(i)} 
                        />
                      )}
                    </motion.div>
                  ))}
                  {isTyping && (
                    <div className="self-start bg-white p-4 rounded-2xl animate-pulse">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-brand-olive/40 rounded-full" />
                        <div className="w-2 h-2 bg-brand-olive/40 rounded-full" />
                        <div className="w-2 h-2 bg-brand-olive/40 rounded-full" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {recommendedDish && !isTyping && messages.some(m => m.gacha?.dish === recommendedDish && m.gacha?.isOpened) && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white border-2 border-brand-olive/20 p-6 rounded-3xl flex flex-col items-center text-center gap-4"
                  >
                    <ChefHat size={40} className="text-brand-olive" />
                    <div>
                      <h3 className="text-xl font-serif font-bold">准备好开始烹饪了吗？</h3>
                      <p className="text-sm text-brand-ink/60">我们将一步步引导你完成这道 {recommendedDish}</p>
                    </div>
                    <button 
                      onClick={startCooking}
                      className="bg-brand-olive text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                    >
                      进入“陪你做饭”模式 <ArrowRight size={18} />
                    </button>
                  </motion.div>
                )}
              </div>

              <div className="px-6 pb-8 pt-2">
                <div className="relative flex flex-col bg-white border border-brand-olive/20 rounded-[28px] p-2 focus-within:ring-2 focus-within:ring-brand-olive/50 transition-all shadow-sm">
                  {chatImage && (
                    <div className="relative self-start mb-2 ml-2 mt-2">
                      <img src={chatImage} alt="Preview" className="h-20 w-20 object-cover rounded-xl border-2 border-brand-olive/20" />
                      <button 
                        onClick={() => setChatImage(null)}
                        className="absolute -top-2 -right-2 bg-brand-ink text-white rounded-full p-1 hover:scale-110 transition-transform"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  
                  <textarea 
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // Auto-resize
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                        // Reset height
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                      }
                    }}
                    placeholder="有问题，尽管问"
                    rows={1}
                    className="w-full bg-transparent py-2 px-4 focus:outline-none resize-none min-h-[40px] max-h-[150px] overflow-y-auto custom-scrollbar leading-relaxed"
                  />
                  
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 px-2">
                      <label className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-olive/10 cursor-pointer transition-colors text-brand-ink/60">
                        <Plus size={20} />
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setChatImage(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      
                      <div className="w-[1px] h-4 bg-brand-olive/20 mx-1"></div>
                      
                      <button onClick={() => handleModeSwitch('friend')} className={cn("flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", chatMode === 'friend' ? "bg-brand-olive/10 text-brand-olive" : "text-brand-ink/60 hover:bg-brand-olive/5")}>
                        <MessageCircle size={14} /> 心灵树洞
                      </button>
                      <button onClick={() => handleModeSwitch('cooking')} className={cn("flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", chatMode === 'cooking' ? "bg-brand-olive/10 text-brand-olive" : "text-brand-ink/60 hover:bg-brand-olive/5")}>
                        <ChefHat size={14} /> 陪你做饭
                      </button>
                      <button onClick={() => handleModeSwitch('nutrition')} className={cn("flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", chatMode === 'nutrition' ? "bg-brand-olive/10 text-brand-olive" : "text-brand-ink/60 hover:bg-brand-olive/5")}>
                        <Activity size={14} /> 健康减脂
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-1 pr-1">
                      <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-olive/10 transition-colors text-brand-ink/60">
                        <Mic size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          handleSend();
                          const textarea = document.querySelector('textarea[placeholder="有问题，尽管问"]') as HTMLTextAreaElement;
                          if (textarea) textarea.style.height = 'auto';
                        }}
                        disabled={(!input.trim() && !chatImage) || isTyping}
                        className="flex-shrink-0 w-8 h-8 bg-[#8c8c8c] text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'cooking' && currentRecipe && (
            <motion.div 
              key="cooking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "h-full overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8 pb-20 relative",
                cookingPhase === 'mindfulness' ? "misty-bg" : "bg-brand-cream"
              )}
            >
              {cookingPhase === 'mindfulness' && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-soft-sunlight/20 rounded-full blur-3xl animate-float-slow" />
                  <div className="absolute bottom-[20%] right-[10%] w-96 h-96 bg-soft-sage/30 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '-5s' }} />
                  <div className="absolute top-[40%] right-[20%] w-48 h-48 bg-pale-apricot/10 rounded-full blur-2xl animate-float-slow" style={{ animationDelay: '-10s' }} />
                </div>
              )}
              <div className="flex items-center justify-between relative z-10">
                <button onClick={() => setView('chat')} className="text-brand-olive flex items-center gap-1 font-bold">
                  <ArrowLeft size={18} /> 退出
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportToTxt}
                      className="text-brand-olive/60 hover:text-brand-olive flex items-center gap-1 text-xs font-bold uppercase tracking-widest transition-colors"
                      title="导出为文本"
                    >
                      <FileText size={14} /> TXT
                    </button>
                    <span className="w-px h-3 bg-brand-olive/20" />
                    <button 
                      onClick={exportToPdf}
                      className="text-brand-olive/60 hover:text-brand-olive flex items-center gap-1 text-xs font-bold uppercase tracking-widest transition-colors"
                      title="导出为PDF"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </div>
                  {cookingPhase === 'cooking' && (
                    <div className="text-sm font-bold tracking-widest uppercase opacity-40">
                      第 {cookingStep + 1} 步，共 {currentRecipe.steps.length} 步
                    </div>
                  )}
                </div>
              </div>

              {cookingPhase === 'mindfulness' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-12 text-center relative z-10"
                >
                  <div className="space-y-6">
                    <motion.h2 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-5xl font-serif font-bold text-primary-text tracking-tight"
                    >
                      静心时刻
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-secondary-text italic max-w-lg mx-auto text-xl leading-relaxed"
                    >
                      先慢下来，感受呼吸与食材的气息。把纷乱放在身后，准备进入这段温柔的烹饪时光。
                    </motion.p>
                  </div>

                  <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    {!mindfulnessStarted ? (
                      <motion.button 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.6 }}
                        onClick={() => {
                          setMindfulnessStarted(true);
                          if (isVoiceEnabled) {
                            playStepVoice("请闭上眼睛，跟随我的声音。深深地吸气……慢慢地呼气……感受食材原本的能量，放下一切烦恼，准备享受这段疗愈时光。");
                          }
                        }}
                        className="bg-olive-sage text-white px-10 py-5 rounded-full font-bold text-xl shadow-heal hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                      >
                        开始静心 <Play size={24} fill="currentColor" />
                      </motion.button>
                    ) : (
                      <div className="relative w-64 h-64 flex items-center justify-center mx-auto">
                        {/* Breathing Halos */}
                        <div className="absolute inset-0 bg-olive-sage/25 rounded-full animate-halo-pulse" />
                        <div className="absolute inset-[-30%] bg-olive-sage/15 rounded-full animate-halo-pulse" style={{ animationDelay: '2s' }} />
                        
                        <div className="relative z-10 w-40 h-40 bg-olive-sage text-white rounded-full flex flex-col items-center justify-center shadow-heal shadow-inner-soft animate-breathe-slow">
                          <span className="text-5xl font-serif font-bold">{mindfulnessTimer}</span>
                          <span className="text-xs uppercase tracking-[0.2em] opacity-70 mt-1">Seconds</span>
                        </div>
                        
                        <button 
                          onClick={() => setMindfulnessTimer(0)}
                          className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-brand-olive/40 hover:text-brand-olive text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1"
                        >
                          跳过静心 <ArrowRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="glass-card p-8 rounded-[32px] w-full max-w-md text-left space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-secondary-text flex items-center gap-2">
                        <Volume2 size={18} className="text-olive-sage" /> 陪伴语音｜温柔女声
                      </h4>
                      <button 
                        onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                        className={cn(
                          "w-14 h-7 rounded-full transition-all relative p-1", 
                          isVoiceEnabled ? "bg-olive-sage" : "bg-tertiary-text/30"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full shadow-sm transition-all transform", 
                          isVoiceEnabled ? "translate-x-7" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-tertiary-text flex items-center gap-2">
                        <Music size={14} /> 环境白噪音
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {WHITE_NOISES.map(noise => {
                          const isActive = activeNoise === noise.url;
                          const isPlaying = isActive && isNoisePlaying;
                          const Icon = noise.icon;
                          return (
                            <button
                              key={noise.id}
                              onClick={() => {
                                if (isActive) {
                                  setIsNoisePlaying(!isNoisePlaying);
                                } else {
                                  setActiveNoise(noise.url);
                                  setIsNoisePlaying(true);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all",
                                isActive 
                                  ? "bg-olive-sage text-white shadow-md" 
                                  : "bg-white/50 text-secondary-text hover:bg-white/80"
                              )}
                            >
                              <Icon size={14} />
                              {noise.name}
                              {isActive && isPlaying && <span className="w-1 h-1 bg-white rounded-full animate-pulse" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>

                  <button 
                    onClick={() => setCookingPhase('prep')}
                    className="text-tertiary-text hover:text-secondary-text font-bold text-sm uppercase tracking-[0.2em] transition-colors"
                  >
                    直接开始做饭
                  </button>
                </motion.div>
              ) : cookingPhase === 'prep' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex-1 flex flex-col gap-8"
                >
                  <div className="text-center space-y-4">
                    <h2 className="text-4xl font-serif font-bold leading-tight">准备食材</h2>
                    <p className="text-brand-ink/60 italic">{currentRecipe.description}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8 items-center">
                    <div className="bg-white/50 p-8 rounded-[40px] border border-brand-olive/10 shadow-sm">
                      <h3 className="text-xl font-serif font-bold mb-6 flex items-center gap-2">
                        <Soup size={20} className="text-brand-olive" />
                        你需要准备：
                      </h3>
                      <div className="space-y-4">
                        {currentRecipe.ingredients.map((ing, i) => (
                          <div key={i} className="flex items-center gap-3 text-lg group cursor-pointer">
                            <div className="w-6 h-6 border-2 border-brand-olive/30 rounded-full flex items-center justify-center group-hover:border-brand-olive transition-colors">
                              <div className="w-3 h-3 bg-brand-olive rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <span className="font-serif">{ing}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="aspect-square rounded-[40px] overflow-hidden shadow-2xl">
                      <img 
                        src={currentRecipe.mainImageUrl || undefined} 
                        alt={currentRecipe.title} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button 
                      onClick={startActualCooking}
                      className="bg-brand-olive text-white px-12 py-4 rounded-full font-bold text-lg shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      食材已备齐，开始烹饪 <ArrowRight size={20} />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="grid md:grid-cols-2 gap-8 items-start">
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <h2 className="text-4xl font-serif font-bold leading-tight">{currentRecipe.title}</h2>
                    </div>
                    <div className="bg-white/50 p-6 rounded-3xl border border-brand-olive/10 relative overflow-hidden">
                      {isVoicePlaying && (
                        <div className="absolute top-4 right-4 flex gap-1">
                          <div className="w-1 h-3 bg-brand-olive/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1 h-4 bg-brand-olive/60 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                          <div className="w-1 h-3 bg-brand-olive/40 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                        </div>
                      )}
                      <h4 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-50">当前步骤</h4>
                      <p className="text-xl leading-relaxed font-serif italic">
                        {currentRecipe.steps[cookingStep].instruction}
                      </p>
                    </div>

                    <AnimatePresence mode="wait">
                      {stepFeedback && (
                        <div key={stepFeedback.id} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-6">
                          {/* Background Dimmer Overlay */}
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 1, 0] }}
                            transition={{ 
                              duration: 8, 
                              times: [0, 0.05, 0.8, 1],
                              ease: "easeInOut" 
                            }}
                            className="absolute inset-0 bg-black/25 backdrop-blur-[2px] pointer-events-none"
                          />

                          {/* Hidden SVG for clipPath definition */}
                          <svg width="0" height="0" className="absolute">
                            <defs>
                              <clipPath id="cloud-clip" clipPathUnits="objectBoundingBox">
                                <path transform="scale(0.003125, 0.004545)" d="M92 170C54 170 28 145 28 112C28 84 48 61 76 55C82 28 106 10 136 10C164 10 188 24 198 47C204 44 212 42 220 42C252 42 278 66 278 98C300 108 314 128 314 151C314 183 286 208 252 208H92C58 208 30 190 30 170C30 170 58 170 92 170Z" />
                              </clipPath>
                            </defs>
                          </svg>

                          <motion.div 
                            initial={{ opacity: 0, y: 40, x: 0, scaleX: 0.9, scaleY: 0.9, filter: 'blur(0px)' }}
                            animate={{ 
                              opacity: [0, 1, 1, 0.7, 0.3, 0],
                              y: [40, 0, 0, -40, -90, -180],
                              x: [0, 0, 0, 15, -20, 30],
                              scaleX: [0.9, 1, 1, 1.3, 1.6, 2.2],
                              scaleY: [0.9, 1, 1, 0.9, 0.8, 0.6],
                              filter: [
                                'blur(0px)', 
                                'blur(0px)', 
                                'blur(0px)', 
                                'blur(10px)', 
                                'blur(25px)', 
                                'blur(50px)'
                              ]
                            }}
                            transition={{ 
                              duration: 5,
                              times: [0, 0.1, 0.5, 0.7, 0.85, 1],
                              ease: "easeOut"
                            }}
                            className="relative max-w-md w-full pointer-events-auto flex items-center justify-center"
                            style={{ 
                              aspectRatio: '320 / 220',
                              filter: 'drop-shadow(0 0 40px rgba(255, 255, 255, 0.5))' // Outer Glow
                            }}
                          >
                            {/* Layer 1: Outer Soft Blur (The "Halo") */}
                            <div 
                              className="absolute inset-0 bg-white/30 blur-2xl"
                              style={{ clipPath: 'url(#cloud-clip)' }}
                            />

                            {/* Layer 2: Main Body with Radial Gradient for Volume */}
                            <div 
                              className="absolute inset-0"
                              style={{ 
                                clipPath: 'url(#cloud-clip)',
                                background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 60%, rgba(255, 255, 255, 0.1) 100%)',
                                boxShadow: 'inset 0 0 60px rgba(255, 255, 255, 0.6)'
                              }}
                            />
                            
                            {/* SVG Outline for the stroke - slightly more visible */}
                            <svg 
                              viewBox="0 0 320 220" 
                              className="absolute inset-0 w-full h-full pointer-events-none z-20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M92 170C54 170 28 145 28 112C28 84 48 61 76 55C82 28 106 10 136 10C164 10 188 24 198 47C204 44 212 42 220 42C252 42 278 66 278 98C300 108 314 128 314 151C314 183 286 208 252 208H92C58 208 30 190 30 170C30 170 58 170 92 170Z"
                                stroke="rgba(255, 255, 255, 0.5)"
                                strokeWidth="3"
                              />
                            </svg>
                            
                            {/* Text Content - Darker for better contrast against brighter cloud */}
                            <div className="relative z-30 p-12 text-center max-w-[80%]">
                              <p className="text-3xl font-serif italic text-gray-800 leading-relaxed tracking-wide drop-shadow-sm">
                                {stepFeedback.text}
                              </p>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>

                    {/* White Noise Controls */}
                    <div className="bg-white/50 p-6 rounded-3xl border border-brand-olive/10">
                      <h4 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-50 flex items-center gap-2">
                        <Music size={14} /> 陪伴白噪音
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        {WHITE_NOISES.map(noise => {
                          const isActive = activeNoise === noise.url;
                          const isPlaying = isActive && isNoisePlaying;
                          const Icon = noise.icon;
                          return (
                            <button
                              key={noise.id}
                              onClick={() => {
                                if (isActive) {
                                  setIsNoisePlaying(!isNoisePlaying);
                                } else {
                                  setActiveNoise(noise.url);
                                  setIsNoisePlaying(true);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                                isActive 
                                  ? "bg-brand-olive text-white shadow-md" 
                                  : "bg-white text-brand-olive hover:bg-brand-olive/10"
                              )}
                            >
                              <Icon size={16} />
                              <span className="text-sm font-medium">{noise.name}</span>
                              {isActive && (
                                <span className="ml-1">
                                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setCookingStep(Math.max(0, cookingStep - 1))}
                        disabled={cookingStep === 0}
                        className="flex-1 border border-brand-olive/20 py-4 rounded-full font-bold disabled:opacity-30"
                      >
                        上一步
                      </button>
                      <button 
                        onClick={nextStep}
                        className="flex-1 bg-brand-olive text-white py-4 rounded-full font-bold flex items-center justify-center gap-2"
                      >
                        {cookingStep === currentRecipe.steps.length - 1 ? '完成烹饪' : '下一步'} <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="relative aspect-square rounded-[40px] overflow-hidden shadow-2xl bg-brand-warm-gray group">
                    {stepImages[cookingStep] ? (
                      <motion.img 
                        key={`user-${cookingStep}`}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={stepImages[cookingStep] || undefined} 
                        alt="My Cooking step"
                        className="w-full h-full object-cover"
                      />
                    ) : currentRecipe.steps[cookingStep].imageUrl ? (
                      <motion.img 
                        key={cookingStep}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={currentRecipe.steps[cookingStep].imageUrl || undefined} 
                        alt="Cooking step"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-brand-olive/40">
                        <Camera size={48} className="animate-pulse" />
                        <p className="text-sm font-bold uppercase tracking-widest">正在生成视觉引导...</p>
                      </div>
                    )}

                    {/* Step Image Upload Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => stepImageInputRef.current?.click()}
                        className="bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-white/30 transition-colors shadow-lg"
                      >
                        <Camera size={20} />
                        {stepImages[cookingStep] ? '重新拍照/上传' : '拍照记录这一步'}
                      </button>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      ref={stepImageInputRef}
                      onChange={handleStepImageUpload}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'recipes' && (
            <motion.div 
              key="recipes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8"
            >
              <div>
                <h2 className="text-4xl font-serif font-bold">我的食谱本</h2>
                <p className="text-brand-ink/50">珍藏每一次疗愈烹饪的配方</p>
              </div>

              {savedRecipes.length === 0 ? (
                <div className="py-20 text-center space-y-4 opacity-30">
                  <Soup size={64} className="mx-auto" />
                  <p className="font-serif text-xl italic">食谱本还是空的，去开启一场烹饪之旅吧</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {savedRecipes.map((recipe) => (
                    <motion.div 
                      key={recipe.id}
                      onClick={() => setSelectedRecipe(recipe)}
                      className="bg-white rounded-[32px] overflow-hidden border border-brand-olive/10 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="aspect-video overflow-hidden relative">
                        <img 
                          src={recipe.mainImageUrl || undefined} 
                          alt={recipe.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-brand-ink/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                          <span className="text-white font-bold flex items-center gap-2">
                            查看详情 <ArrowRight size={16} />
                          </span>
                        </div>
                      </div>
                      <div className="p-6 space-y-2">
                        <div className="flex justify-between items-start">
                          <h4 className="font-serif font-bold text-xl">{recipe.title}</h4>
                          {recipe.region && (
                            <span className="text-[10px] bg-brand-olive/10 text-brand-olive px-2 py-1 rounded-full font-bold uppercase tracking-widest">
                              {recipe.region}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-brand-ink/60 line-clamp-2 italic">
                          {recipe.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'diary' && (
            <motion.div 
              key="diary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-serif font-bold">美食心情墙</h2>
                  <p className="text-brand-ink/50">记录每一次与食物的对话</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/50 p-1 rounded-full border border-brand-olive/10 flex">
                    <button 
                      onClick={() => setDiaryMode('wall')}
                      className={cn(
                        "p-2 rounded-full transition-all",
                        diaryMode === 'wall' ? "bg-brand-olive text-white shadow-md" : "text-brand-olive/40 hover:text-brand-olive"
                      )}
                    >
                      <LayoutGrid size={18} />
                    </button>
                    <button 
                      onClick={() => setDiaryMode('calendar')}
                      className={cn(
                        "p-2 rounded-full transition-all",
                        diaryMode === 'calendar' ? "bg-brand-olive text-white shadow-md" : "text-brand-olive/40 hover:text-brand-olive"
                      )}
                    >
                      <CalendarIcon size={18} />
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowManualEntry(true)}
                    className="bg-brand-olive text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform"
                    title="添加手动记录"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </div>

              {diaryMode === 'wall' ? (
                diaryEntries.length === 0 ? (
                  <div className="py-20 text-center space-y-4 opacity-30">
                    <Camera size={64} className="mx-auto" />
                    <p className="font-serif text-xl italic">墙上空空如也，去开启你的第一场疗愈烹饪吧</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4">
                    {diaryEntries.map((entry) => (
                      <motion.div 
                        key={entry.id}
                        layoutId={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="photo-card"
                      >
                        <div className="aspect-[4/5] overflow-hidden bg-brand-warm-gray mb-3 relative">
                          <img 
                            src={entry.recipeImageUrls[0] || undefined} 
                            alt={entry.recipeTitle} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          {entry.recipeImageUrls.length > 1 && (
                            <div className="absolute bottom-2 right-2 bg-brand-ink/50 text-white text-[8px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                              +{entry.recipeImageUrls.length - 1}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="font-serif font-bold text-sm truncate">{entry.recipeTitle}</h4>
                          {entry.summary && (
                            <p className={cn(
                              "text-[9px] text-brand-ink/60 italic line-clamp-2 leading-relaxed",
                              entry.summary === "正在感悟这段时光..." && "animate-pulse opacity-40"
                            )}>
                              {entry.summary}
                            </p>
                          )}
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-[9px] text-brand-ink/30 uppercase tracking-tighter">{entry.date}</span>
                            <div className="flex items-center gap-1">
                              <MoodIcon mood={entry.moodBefore} size={14} />
                              <ArrowRight size={8} className="text-brand-ink/20" />
                              <MoodIcon mood={entry.moodAfter || 'neutral'} size={14} />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <div className="bg-white/80 backdrop-blur-md p-8 rounded-[40px] border border-brand-olive/10 shadow-xl">
                    <div className="flex items-center justify-between mb-10">
                      <div className="space-y-1">
                        <h3 className="text-3xl font-serif font-bold text-brand-ink">
                          {calendarDate.getFullYear()}年 {calendarDate.getMonth() + 1}月
                        </h3>
                        <p className="text-xs font-bold text-brand-olive uppercase tracking-[0.2em] opacity-60">Healing Calendar</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}
                          className="w-12 h-12 flex items-center justify-center bg-white border border-brand-olive/10 rounded-full shadow-sm hover:bg-brand-olive hover:text-white transition-all"
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}
                          className="w-12 h-12 flex items-center justify-center bg-white border border-brand-olive/10 rounded-full shadow-sm hover:bg-brand-olive hover:text-white transition-all"
                        >
                          <ChevronRight size={24} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-4 mb-6">
                      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                        <div key={d} className="text-center text-[10px] font-black text-brand-olive/30 uppercase tracking-[0.2em]">{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-4">
                      {(() => {
                        const year = calendarDate.getFullYear();
                        const month = calendarDate.getMonth();
                        const firstDay = new Date(year, month, 1).getDay();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        
                        const days = [];
                        // Padding for first day
                        for (let i = 0; i < firstDay; i++) {
                          days.push(<div key={`pad-${i}`} className="aspect-square" />);
                        }
                        
                        // Days of the month
                        for (let d = 1; d <= daysInMonth; d++) {
                          const entriesForDay = diaryEntries.filter(e => {
                            const entryDate = new Date(e.date);
                            return entryDate.getFullYear() === year && 
                                   entryDate.getMonth() === month && 
                                   entryDate.getDate() === d;
                          });
                          
                          const isToday = new Date().getFullYear() === year && 
                                          new Date().getMonth() === month && 
                                          new Date().getDate() === d;
                          
                          days.push(
                            <div 
                              key={d} 
                              className={cn(
                                "aspect-square rounded-3xl flex flex-col items-center justify-center relative group transition-all p-1",
                                entriesForDay.length > 0 
                                  ? "bg-white shadow-md cursor-pointer hover:scale-110 hover:shadow-xl z-10" 
                                  : "bg-brand-olive/5 hover:bg-brand-olive/10",
                                isToday && "ring-2 ring-brand-olive ring-offset-2"
                              )}
                              onClick={() => {
                                if (entriesForDay.length === 1) {
                                  setSelectedEntry(entriesForDay[0]);
                                } else if (entriesForDay.length > 1) {
                                  setSelectedDayEntries(entriesForDay);
                                }
                              }}
                            >
                              <span className={cn(
                                "text-[11px] absolute top-2 left-3 font-black transition-colors",
                                entriesForDay.length > 0 ? "text-brand-ink" : "text-brand-ink/20",
                                isToday && "text-brand-olive"
                              )}>{d}</span>
                              
                              {entriesForDay.length > 0 && (
                                <div className="w-full h-full flex items-center justify-center p-2 pt-4">
                                  <div className={cn(
                                    "grid gap-1",
                                    entriesForDay.length > 4 ? "grid-cols-3" : (entriesForDay.length > 1 ? "grid-cols-2" : "grid-cols-1")
                                  )}>
                                    {entriesForDay.slice(0, entriesForDay.length > 4 ? 8 : 4).map((entry) => (
                                      <MoodIcon 
                                        key={entry.id} 
                                        mood={entry.moodBefore} 
                                        size={entriesForDay.length > 4 ? 24 : (entriesForDay.length > 1 ? 36 : 70)} 
                                      />
                                    ))}
                                    {entriesForDay.length > (entriesForDay.length > 4 ? 8 : 4) && (
                                      <div className="text-[8px] font-black text-brand-olive/60 flex items-center justify-center bg-brand-olive/10 rounded-full aspect-square">
                                        +{entriesForDay.length - (entriesForDay.length > 4 ? 8 : 4)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return days;
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                    {Object.entries(moodMap).map(([key, { label }]) => (
                      <div key={key} className="flex flex-col items-center gap-2 bg-white/50 p-4 rounded-3xl border border-brand-olive/5 shadow-sm">
                        <MoodIcon mood={key as Mood} size={24} />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {view === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8 pb-20"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-serif font-bold">中华美食地图</h2>
                <p className="text-brand-ink/60 italic">点亮你走过的每一个美食角落</p>
              </div>

              <div className="bg-white/50 p-6 rounded-[40px] border border-brand-olive/10 shadow-sm">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {REGIONAL_FOODS.map(region => {
                      const isLit = diaryEntries.some(e => e.region === region.name);
                      return (
                        <motion.div 
                          key={region.id}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => setSelectedRegion(region)}
                          initial={false}
                          animate={isLit ? { 
                            scale: [1, 1.1, 1],
                            boxShadow: [
                              "0px 0px 0px rgba(107, 114, 76, 0)",
                              "0px 0px 20px rgba(107, 114, 76, 0.3)",
                              "0px 0px 0px rgba(107, 114, 76, 0)"
                            ]
                          } : {}}
                          transition={{ duration: 0.5 }}
                          className={cn(
                            "p-4 rounded-3xl border transition-all flex flex-col items-center gap-3 text-center relative overflow-hidden",
                            isLit 
                              ? "bg-brand-olive/10 border-brand-olive/40 shadow-md" 
                              : "bg-white/40 border-brand-olive/5 opacity-60"
                          )}
                        >
                          {isLit && (
                            <>
                              <motion.div 
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute top-2 right-2 text-brand-olive"
                              >
                                <Sparkles size={12} className="animate-pulse" />
                              </motion.div>
                              <motion.div
                                initial={{ scale: 0, opacity: 0.5 }}
                                animate={{ scale: 2, opacity: 0 }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="absolute inset-0 bg-brand-olive/20 rounded-full pointer-events-none"
                              />
                            </>
                          )}
                          <div className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500",
                            isLit ? "bg-brand-olive text-white scale-110 shadow-lg" : "bg-brand-olive/5 text-brand-olive/40"
                          )}>
                            {isLit ? (
                              <motion.div
                                initial={{ rotate: -180, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 200 }}
                              >
                                <CheckCircle2 size={24} />
                              </motion.div>
                            ) : <Globe size={24} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{region.name}</h4>
                            <p className="text-[10px] opacity-60 mt-1 line-clamp-1">{region.specialties[0]}</p>
                          </div>
                          {isLit && (
                            <motion.div 
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              className="mt-1 px-2 py-0.5 bg-brand-olive text-white text-[8px] font-bold rounded-full uppercase tracking-widest"
                            >
                              已点亮
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Reflection Modal */}
      <AnimatePresence>
        {showReflection && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-ink/20 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-brand-cream w-full max-w-lg rounded-[40px] p-8 shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-brand-olive/10 text-brand-olive rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold">烹饪完成！</h2>
                <p className="text-brand-ink/60 italic">现在的你，感觉怎么样？</p>
              </div>

              <div className="space-y-6">
                {/* Mood Selector After Cooking */}
                <div className="flex flex-wrap justify-center gap-3">
                  {(Object.keys(moodMap) as Mood[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPostMood(m)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-2xl transition-all border-2",
                        postMood === m 
                          ? "bg-brand-olive/10 border-brand-olive scale-105" 
                          : "bg-white border-transparent hover:border-brand-olive/20"
                      )}
                    >
                      <MoodIcon mood={m} size={24} />
                      <span className="text-[10px] font-bold opacity-60">{moodMap[m].label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-4">
                  <div className="w-full min-h-[100px] rounded-2xl bg-white border-2 border-dashed border-brand-olive/20 p-4 flex flex-wrap gap-2 items-center justify-center relative group">
                    {uploadedImages.length > 0 ? (
                      <>
                        {uploadedImages.map((img, idx) => (
                          <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden shadow-sm group/img">
                            <img src={img || undefined} alt="Uploaded" className="w-full h-full object-cover" />
                            <button 
                              onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 p-0.5 bg-brand-ink/50 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        <label className="w-16 h-16 rounded-xl border-2 border-dashed border-brand-olive/20 flex items-center justify-center cursor-pointer hover:bg-brand-olive/5 transition-colors">
                          <Plus size={20} className="text-brand-olive/40" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                Array.from(files).forEach(file => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => setUploadedImages(prev => [...prev, reader.result as string]);
                                  reader.readAsDataURL(file);
                                });
                              }
                            }}
                          />
                        </label>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-brand-olive/5 transition-colors py-6">
                        <Camera size={24} className="text-brand-olive/40 mb-1" />
                        <span className="text-[10px] font-bold text-brand-olive/60">上传今日作品照片 (可多选)</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          multiple
                          className="hidden" 
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files) {
                              Array.from(files).forEach(file => {
                                const reader = new FileReader();
                                reader.onloadend = () => setUploadedImages(prev => [...prev, reader.result as string]);
                                reader.readAsDataURL(file);
                              });
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      "现在的我，比做饭前更……",
                      "今天最让我放松的一刻是……",
                      "这顿饭像是在对自己说……",
                      "如果把今天的味道形容成一种感觉，它会是……"
                    ].map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => setReflectionText(prev => prev ? `${prev}\n${prompt}` : prompt)}
                        className="text-[10px] px-3 py-1.5 bg-brand-olive/5 text-brand-olive rounded-full hover:bg-brand-olive/10 transition-colors border border-brand-olive/10"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <textarea 
                    value={reflectionText}
                    onChange={(e) => setReflectionText(e.target.value)}
                    placeholder="点击上方引导句开始记录，或者直接写下你的感悟..."
                    className="w-full bg-white border border-brand-olive/10 rounded-2xl p-4 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-brand-olive/30 text-sm leading-relaxed"
                  />
                </div>
              </div>

              <button 
                onClick={finishCooking}
                disabled={!postMood}
                className="w-full bg-brand-olive text-white py-4 rounded-full font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                保存到心情墙
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recipe Detail Modal */}
      <AnimatePresence>
        {selectedRecipe && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-ink/30 backdrop-blur-md"
            onClick={() => setSelectedRecipe(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-brand-cream w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative h-64 flex-shrink-0">
                <img 
                  src={selectedRecipe.mainImageUrl || undefined} 
                  alt={selectedRecipe.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-cream via-transparent to-transparent" />
                <button 
                  onClick={() => setSelectedRecipe(null)}
                  className="absolute top-6 right-6 p-2 bg-white/50 hover:bg-white rounded-full transition-colors shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-10 pt-0 -mt-12 relative z-10 overflow-y-auto custom-scrollbar">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-4xl font-serif font-bold">{selectedRecipe.title}</h2>
                      {selectedRecipe.region && (
                        <span className="text-xs bg-brand-olive/10 text-brand-olive px-3 py-1 rounded-full font-bold uppercase tracking-widest">
                          {selectedRecipe.region}
                        </span>
                      )}
                    </div>
                    <p className="text-brand-ink/60 italic text-lg">{selectedRecipe.description}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-olive/60 flex items-center gap-2">
                        <Soup size={14} /> 食材清单
                      </h4>
                      <ul className="space-y-3">
                        {selectedRecipe.ingredients.map((ing, i) => (
                          <li key={i} className="flex items-center gap-3 font-serif text-lg">
                            <div className="w-1.5 h-1.5 bg-brand-olive/30 rounded-full" />
                            {ing}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-olive/60 flex items-center gap-2">
                        <ChefHat size={14} /> 烹饪步骤
                      </h4>
                      <div className="space-y-6">
                        {selectedRecipe.steps.map((step, i) => (
                          <div key={i} className="flex gap-4">
                            <span className="text-2xl font-bold opacity-10 flex-shrink-0">{i + 1}</span>
                            <p className="text-sm leading-relaxed font-serif italic">{step.instruction}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 flex gap-4">
                    <button 
                      onClick={() => {
                        setCurrentRecipe(selectedRecipe);
                        setCookingStep(0);
                        setCookingPhase('mindfulness');
                        setMindfulnessTimer(30);
                        setView('cooking');
                        setSelectedRecipe(null);
                      }}
                      className="flex-1 bg-brand-olive text-white py-4 rounded-full font-bold shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                    >
                      再次烹饪 <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Day Entries List Modal */}
      <AnimatePresence>
        {selectedDayEntries && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-ink/30 backdrop-blur-sm"
            onClick={() => setSelectedDayEntries(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-brand-cream w-full max-w-lg rounded-[40px] p-8 shadow-2xl space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-serif font-bold">当日记录</h2>
                  <p className="text-xs text-brand-ink/40 uppercase tracking-widest font-bold">{selectedDayEntries[0].date}</p>
                </div>
                <button onClick={() => setSelectedDayEntries(null)} className="p-2 hover:bg-brand-olive/10 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {selectedDayEntries.map((entry) => (
                  <div 
                    key={entry.id}
                    onClick={() => {
                      setSelectedEntry(entry);
                      setSelectedDayEntries(null);
                    }}
                    className="bg-white p-4 rounded-3xl border border-brand-olive/10 flex gap-4 cursor-pointer hover:bg-brand-olive/5 transition-colors group"
                  >
                    <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                      <img src={entry.recipeImageUrls[0] || undefined} alt={entry.recipeTitle} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="flex justify-between items-start">
                        <h4 className="font-serif font-bold text-lg">{entry.recipeTitle}</h4>
                        <MoodIcon mood={entry.moodBefore} size={24} />
                      </div>
                      <p className="text-sm text-brand-ink/60 line-clamp-1 italic">"{entry.reflection}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {showManualEntry && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-ink/30 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-brand-cream w-full max-w-lg rounded-[40px] p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-serif font-bold">记录今日美食</h2>
                <button onClick={() => setShowManualEntry(false)} className="p-2 hover:bg-brand-olive/10 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">上传照片 (可多选)</label>
                  <div className="min-h-[120px] rounded-3xl border-2 border-dashed border-brand-olive/20 p-4 flex flex-wrap gap-2 items-center justify-center bg-white/50 group">
                    {manualEntryData.images.length > 0 ? (
                      <>
                        {manualEntryData.images.map((img, idx) => (
                          <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm group/img">
                            <img src={img || undefined} className="w-full h-full object-cover" />
                            <button 
                              onClick={() => setManualEntryData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                              className="absolute top-1 right-1 p-1 bg-brand-ink/50 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <label className="w-24 h-24 rounded-2xl border-2 border-dashed border-brand-olive/20 flex items-center justify-center cursor-pointer hover:bg-brand-olive/5 transition-colors">
                          <Plus size={24} className="text-brand-olive/40" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                Array.from(files).forEach(file => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => setManualEntryData(prev => ({ ...prev, images: [...prev.images, reader.result as string] }));
                                  reader.readAsDataURL(file);
                                });
                              }
                            }} 
                            className="hidden" 
                          />
                        </label>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-brand-olive/5 transition-colors py-8">
                        <ImageIcon size={32} className="text-brand-olive/40 mb-2" />
                        <p className="text-xs font-bold text-brand-olive/60">点击上传今日美食</p>
                        <input 
                          type="file" 
                          accept="image/*" 
                          multiple
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files) {
                              Array.from(files).forEach(file => {
                                const reader = new FileReader();
                                reader.onloadend = () => setManualEntryData(prev => ({ ...prev, images: [...prev.images, reader.result as string] }));
                                reader.readAsDataURL(file);
                              });
                            }
                          }} 
                          className="hidden" 
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">食物名称</label>
                  <input 
                    type="text"
                    value={manualEntryData.foodName}
                    onChange={(e) => setManualEntryData(prev => ({ ...prev, foodName: e.target.value }))}
                    placeholder="今天吃了什么？"
                    className="w-full bg-white border border-brand-olive/10 rounded-full py-3 px-6 focus:outline-none focus:ring-2 focus:ring-brand-olive/30"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">此刻心情</label>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(moodMap).map(([key, { label }]) => (
                      <button
                        key={key}
                        onClick={() => setManualEntryData(prev => ({ ...prev, mood: key as Mood }))}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all",
                          manualEntryData.mood === key ? "bg-brand-olive/10 border-brand-olive" : "bg-white border-transparent"
                        )}
                      >
                        <MoodIcon mood={key as Mood} size={24} />
                        <span className="text-[10px] font-bold">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">所属地区 (可选)</label>
                  <select 
                    value={manualEntryData.region}
                    onChange={(e) => setManualEntryData(prev => ({ ...prev, region: e.target.value }))}
                    className="w-full bg-white border border-brand-olive/10 rounded-full py-3 px-6 focus:outline-none focus:ring-2 focus:ring-brand-olive/30 appearance-none"
                  >
                    <option value="">选择地区</option>
                    {REGIONAL_FOODS.map(r => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-50">心情感悟</label>
                  <textarea 
                    value={manualEntryData.reflection}
                    onChange={(e) => setManualEntryData(prev => ({ ...prev, reflection: e.target.value }))}
                    placeholder="记录下这一刻的感受..."
                    className="w-full bg-white border border-brand-olive/10 rounded-2xl p-4 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand-olive/30"
                  />
                </div>
              </div>

              <button 
                onClick={handleManualSubmit}
                disabled={isSaving}
                className={cn(
                  "w-full bg-brand-olive text-white py-4 rounded-full font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2",
                  isSaving && "opacity-70 cursor-not-allowed"
                )}
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    正在保存...
                  </>
                ) : "保存记录"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Region Detail Modal */}
      <AnimatePresence>
        {selectedRegion && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-ink/30 backdrop-blur-md"
            onClick={() => setSelectedRegion(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              className="bg-brand-cream w-full max-w-xl rounded-[48px] shadow-2xl relative overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative Background Elements */}
              <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-brand-olive/10 rounded-full blur-3xl" />
              <div className="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-brand-olive/5 rounded-full blur-2xl" />
              
              {/* Close Button */}
              <button 
                onClick={() => setSelectedRegion(null)}
                className="absolute top-8 right-8 p-3 bg-white/50 hover:bg-white rounded-full transition-all z-20 shadow-sm"
              >
                <X size={20} className="text-brand-ink" />
              </button>

              <div className="relative z-10 flex flex-col h-full">
                {/* Header Section */}
                <div className="p-8 pb-4 space-y-4">
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 bg-brand-olive rounded-[32px] flex items-center justify-center text-white shadow-xl transform -rotate-3">
                      <Globe size={40} />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-4xl font-serif font-bold tracking-tight text-brand-ink">{selectedRegion.name}</h2>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-px bg-brand-olive/30" />
                        <p className="text-xs text-brand-olive font-bold uppercase tracking-[0.3em]">地域美食文化</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="px-8 pb-8 space-y-4 overflow-y-auto custom-scrollbar max-h-[60vh]">
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-olive/60 flex items-center gap-2">
                      <Star size={10} fill="currentColor" /> 风味与历史
                    </h4>
                    <div className="bg-white/40 p-4 rounded-[24px] border border-brand-olive/10 shadow-inner">
                      <p className="text-xs leading-relaxed text-brand-ink/90 font-serif italic first-letter:text-xl first-letter:font-bold first-letter:mr-1 first-letter:text-brand-olive">
                        {selectedRegion.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-olive/60 flex items-center gap-2 px-2">
                      <ChefHat size={10} /> 必尝特色美食
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedRegion.specialties.map((s, idx) => (
                        <motion.div 
                          key={s} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-white/80 px-4 py-3 rounded-2xl border border-brand-olive/5 text-[11px] font-bold shadow-sm flex items-center gap-2 hover:bg-white transition-colors group"
                        >
                          <div className="w-1.5 h-1.5 bg-brand-olive/20 rounded-full group-hover:scale-125 group-hover:bg-brand-olive transition-all" />
                          {s}
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={() => {
                        setInput(`我想了解并尝试做一道${selectedRegion.name}的特色美食：${selectedRegion.specialties[0]}`);
                        setView('chat');
                        setSelectedRegion(null);
                      }}
                      className="w-full bg-brand-olive text-white py-5 rounded-[32px] font-bold shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg group"
                    >
                      <ChefHat size={22} className="group-hover:rotate-12 transition-transform" /> 
                      <span>开启疗愈烹饪之旅</span>
                      <ArrowRight size={20} className="opacity-50 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diary Detail Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-brand-ink/30 backdrop-blur-md"
            onClick={() => setSelectedEntry(null)}
          >
            <motion.div 
              layoutId={selectedEntry.id}
              className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="md:w-1/2 relative bg-brand-warm-gray overflow-hidden group/modal">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={currentImageIndex}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="w-full h-full"
                  >
                    <img 
                      src={selectedEntry.recipeImageUrls[currentImageIndex] || undefined} 
                      alt={`${selectedEntry.recipeTitle} ${currentImageIndex + 1}`} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                </AnimatePresence>

                {selectedEntry.recipeImageUrls.length > 1 && (
                  <>
                    <button 
                      onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : selectedEntry.recipeImageUrls.length - 1))}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-brand-ink/20 hover:bg-brand-ink/40 backdrop-blur-md rounded-full text-white transition-all opacity-0 group-hover/modal:opacity-100 z-10"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button 
                      onClick={() => setCurrentImageIndex(prev => (prev < selectedEntry.recipeImageUrls.length - 1 ? prev + 1 : 0))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-brand-ink/20 hover:bg-brand-ink/40 backdrop-blur-md rounded-full text-white transition-all opacity-0 group-hover/modal:opacity-100 z-10"
                    >
                      <ChevronRight size={20} />
                    </button>

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 items-center px-3 py-1.5 bg-brand-ink/10 backdrop-blur-sm rounded-full z-20">
                      {selectedEntry.recipeImageUrls.map((_, idx) => {
                        const isSelected = idx === currentImageIndex;
                        const total = selectedEntry.recipeImageUrls.length;
                        
                        // Dynamic scaling logic
                        let size = 6;
                        if (total > 4) {
                          const dist = Math.abs(idx - currentImageIndex);
                          if (dist === 0) size = 5;
                          else if (dist === 1) size = 3.5;
                          else size = 2;
                        }

                        return (
                          <motion.button 
                            key={idx} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentImageIndex(idx);
                            }}
                            animate={{ 
                              scale: isSelected ? 1.2 : 1,
                              opacity: isSelected ? 1 : 0.4,
                              width: size,
                              height: size
                            }}
                            className="rounded-full bg-white shadow-sm cursor-pointer" 
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div className="md:w-1/2 p-8 flex flex-col justify-between relative">
                <button 
                  onClick={() => setSelectedEntry(null)}
                  className="absolute top-4 right-4 p-2 hover:bg-brand-cream rounded-full transition-colors z-20"
                >
                  <X size={20} />
                </button>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-olive/60">{selectedEntry.date}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <h2 className="text-3xl font-serif font-bold">{selectedEntry.recipeTitle}</h2>
                      {selectedEntry.region && (
                        <span className="text-[10px] bg-brand-olive/10 text-brand-olive px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                          {selectedEntry.region}
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedEntry.summary && (
                    <div className={cn(
                      "p-5 bg-brand-olive/5 rounded-3xl border-l-4 border-brand-olive italic text-brand-ink/80 text-base leading-relaxed font-serif",
                      selectedEntry.summary === "正在感悟这段时光..." && "animate-pulse opacity-50"
                    )}>
                      {selectedEntry.summary === "正在感悟这段时光..." ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-brand-olive/30 border-t-brand-olive rounded-full animate-spin" />
                          正在感悟这段时光...
                        </div>
                      ) : (
                        `“${selectedEntry.summary}”`
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-40">烹饪感悟</h5>
                      <p className="font-serif italic text-lg leading-relaxed text-brand-ink/80 whitespace-pre-wrap">
                        "{selectedEntry.reflection}"
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-brand-olive/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <MoodIcon mood={selectedEntry.moodBefore} size={24} />
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">Before</span>
                    </div>
                    <ArrowRight size={16} className="text-brand-olive/30" />
                    <div className="flex flex-col items-center gap-1">
                      <MoodIcon mood={selectedEntry.moodAfter || 'neutral'} size={24} />
                      <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">After</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-olive">
                    {moodMap[selectedEntry.moodBefore]?.label} → {moodMap[selectedEntry.moodAfter || 'neutral']?.label}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print-only Recipe View */}
      {currentRecipe && (
        <div className="hidden print:block p-10 bg-white text-black font-serif min-h-screen">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-5xl font-bold border-b-4 border-black pb-4">{currentRecipe.title}</h1>
              <p className="text-xl italic opacity-80">{currentRecipe.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold uppercase tracking-widest border-b-2 border-black pb-2">食材清单</h2>
                <ul className="space-y-2 list-disc list-inside">
                  {currentRecipe.ingredients.map((ing, i) => (
                    <li key={i} className="text-lg">{ing}</li>
                  ))}
                </ul>
              </div>
              <div className="aspect-square rounded-2xl overflow-hidden border-2 border-black">
                <img src={currentRecipe.mainImageUrl || undefined} alt={currentRecipe.title} className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-2xl font-bold uppercase tracking-widest border-b-2 border-black pb-2">烹饪步骤</h2>
              <div className="space-y-8">
                {currentRecipe.steps.map((step, i) => (
                  <div key={i} className="flex gap-6 items-start">
                    <span className="text-4xl font-bold opacity-20">{i + 1}</span>
                    <p className="text-xl leading-relaxed flex-1">{step.instruction}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-10 text-center border-t border-black/10">
              <p className="text-sm tracking-widest uppercase opacity-50">由 食愈 Healing AI 生成</p>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-brand-olive/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-serif font-bold text-brand-ink">设置 API Key</h3>
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="p-2 hover:bg-brand-olive/5 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <p className="text-brand-ink/60 text-sm mb-6 leading-relaxed">
                为了让“食愈”为您提供对话、食谱生成和图片创作服务，我们需要您的 <strong>Google Gemini API Key</strong>。
                <br /><br />
                您的 Key 将仅保存在本地浏览器中，不会上传到我们的服务器。
              </p>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="输入您的 Gemini API Key"
                    className="w-full px-4 py-3 bg-brand-cream/50 border border-brand-olive/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-olive/20 transition-all font-mono text-sm"
                  />
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleSaveApiKey}
                    disabled={!tempApiKey.trim()}
                    className="w-full py-3 bg-brand-olive text-white rounded-xl font-bold transition-all hover:bg-brand-olive/90 disabled:opacity-50 active:scale-95"
                  >
                    保存并开始使用
                  </button>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-center text-xs text-brand-olive/60 hover:underline"
                  >
                    如何获取 API Key？
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
