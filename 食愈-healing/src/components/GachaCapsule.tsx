import { motion } from 'motion/react';
import { ChefHat, Sparkles } from 'lucide-react';

interface GachaCapsuleProps {
  dish: string;
  imageUrl?: string;
  isOpened: boolean;
  onOpen: () => void;
}

export function GachaCapsule({ dish, imageUrl, isOpened, onOpen }: GachaCapsuleProps) {
  return (
    <div className="flex flex-col items-center justify-center my-6 w-full">
      {!isOpened ? (
        <motion.div 
          initial={{ y: -50, opacity: 0, rotate: -15 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.6 }}
          className="relative flex flex-col items-center"
        >
          <motion.button
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95, rotate: -5 }}
            onClick={onOpen}
            className="relative w-32 h-32 cursor-pointer drop-shadow-xl"
          >
            {/* Top half - transparent/glass */}
            <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-white/90 to-white/40 backdrop-blur-md rounded-t-full border-2 border-b-0 border-brand-olive/20 z-10 overflow-hidden shadow-inner">
               <div className="absolute top-3 left-5 w-8 h-4 bg-white/80 rounded-full rotate-[-30deg] blur-[1px]"></div>
            </div>
            
            {/* Bottom half - solid color (pastel) */}
            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-br from-sage-green to-pale-apricot rounded-b-full border-2 border-t-0 border-brand-olive/20 shadow-inner flex items-center justify-center">
              {/* Inner mechanism detail */}
              <div className="w-10 h-5 bg-black/5 rounded-full mt-3"></div>
            </div>
            
            {/* Middle band */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full h-4 bg-white border-y-2 border-brand-olive/20 z-20 flex items-center justify-center shadow-sm">
              <div className="w-1/2 h-1.5 bg-brand-olive/10 rounded-full"></div>
            </div>
          </motion.button>
          <motion.div 
            animate={{ opacity: [0.6, 1, 0.6], y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="mt-6 bg-brand-olive text-white text-xs font-bold px-5 py-2 rounded-full shadow-md flex items-center gap-1.5"
          >
            <Sparkles size={14} className="text-warm-fog" /> 点击开启今日惊喜
          </motion.div>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="bg-white rounded-[32px] p-6 shadow-xl border-2 border-sage-green/60 flex flex-col items-center gap-4 w-full max-w-[280px] relative overflow-hidden"
        >
          {/* Decorative background blobs */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-sage-green/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-olive-sage/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 flex flex-col items-center w-full">
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-serif font-bold text-brand-ink text-center mb-3 leading-tight"
            >
              {dish}
            </motion.div>
            
            <div className="w-full aspect-square rounded-2xl overflow-hidden relative shadow-md mb-4 bg-brand-cream/50 flex items-center justify-center border border-brand-olive/10">
              {imageUrl ? (
                <motion.img 
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  src={imageUrl} 
                  alt={dish} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-brand-olive/40">
                  <ChefHat size={40} className="animate-pulse" />
                  <span className="text-sm font-medium">正在为您绘制美食...</span>
                </div>
              )}
            </div>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-brand-ink/70 text-center font-medium leading-relaxed"
            >
              或许这道菜能给你带来力量<br/>要现在开始做吗？
            </motion.p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
