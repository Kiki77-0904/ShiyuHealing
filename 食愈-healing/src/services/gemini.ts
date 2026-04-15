import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Mood, Recipe } from "../types";

let ai: GoogleGenAI | null = null;

export function initializeGemini(apiKey: string) {
  if (!apiKey) {
    ai = null;
    return;
  }
  ai = new GoogleGenAI({ apiKey });
}

// Initialize with env key if available
if (process.env.GEMINI_API_KEY) {
  initializeGemini(process.env.GEMINI_API_KEY);
}

function getAI() {
  if (!ai) {
    throw new Error("API_KEY_MISSING");
  }
  return ai;
}

function safeJsonParse(text: string) {
  try {
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", text);
    return {};
  }
}

async function handleGeminiCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error: any) {
    if (error?.message === "API_KEY_MISSING") {
      throw new Error("API_KEY_MISSING");
    }
    if (error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || error?.message?.includes("quota")) {
      throw new Error("AI_QUOTA_EXCEEDED");
    }
    throw error;
  }
}

export async function chatAsFriend(chatHistory: string, userInput: string): Promise<{ messages: string[]; switchToCooking: boolean; mood: Mood }> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `你现在是用户的一位知心朋友。请根据聊天记录和用户的最新输入进行回复。
    
    聊天记录：
    ${chatHistory}
    
    当前用户输入: "${userInput}"
    
    要求：
    1. 像真正的知心朋友一样交流，语气自然、温暖、有同理心。
    2. 【关键】不要只是简单附和，要通过温和、关切的追问，激发用户的聊天欲望，深挖他们真正的内心需求和情绪背后的原因（例如：“听起来你今天真的很辛苦，是遇到什么特别难处理的bug了吗？”）。
    3. 简短回复，拆分成 1-3 句。
    4. 识别用户的情绪 (happy, sad, stressed, tired, anxious, lonely, neutral)。
    5. 【关键】**仅当**用户**明确提到**“想吃东西”、“想做饭”、“饿了”、“吃什么”、“美食”等具体的与食物/烹饪相关的字眼时，才将 switchToCooking 设为 true，并在最后一句回复中自然地引导他们去“陪你做饭”模式。如果用户只是表达疲惫、压力等情绪（例如：“好累啊今天”），**绝对不要**主动提议做饭或吃东西，只需给予情感上的安慰、倾听和追问，将 switchToCooking 设为 false。
    
    返回 JSON 格式：
    {
      "messages": ["回复1", "回复2"],
      "switchToCooking": boolean,
      "mood": "情绪"
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          messages: { type: Type.ARRAY, items: { type: Type.STRING } },
          switchToCooking: { type: Type.BOOLEAN },
          mood: { type: Type.STRING, enum: ['happy', 'sad', 'stressed', 'tired', 'anxious', 'lonely', 'neutral'] }
        },
        required: ["messages", "switchToCooking", "mood"]
      }
    }
  }));
  return safeJsonParse(response.text || "{}");
}

export async function chatAsCookingAgent(chatHistory: string, userInput: string): Promise<{ messages: string[]; recommendation?: string; mood: Mood }> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `你是一个温暖的“陪你做饭”助手。请根据聊天记录和用户的最新输入进行回复。
    
    聊天记录：
    ${chatHistory}
    
    当前用户输入: "${userInput}"
    
    要求：
    1. 语气温暖、自然。
    2. 识别用户的情绪 (happy, sad, stressed, tired, anxious, lonely, neutral)。
    3. 如果用户提供了食材，或者明确说想吃什么菜，请为他们推荐一道菜，并将菜名放在 recommendation 字段中。
    4. 如果用户没有提供足够的信息（比如只说“我饿了”），请温柔地询问他们手头有什么食材，或者想吃什么口味的，此时 recommendation 字段留空。
    5. 回复要简短，拆分成 1-3 句。
    6. 【极度关键】当你决定推荐一道菜时，**绝对不要**在回复的文本（messages）中直接说出这道菜的名字！你要保持神秘感，描述这道菜的口感、香气或它能带给人的愉悦感（例如：“下雨天最适合吃点热乎乎、酸甜开胃的汤面了，猜猜我给你准备了什么盲盒？”），把悬念留给接下来的盲盒环节。菜名**只能**放在 recommendation 字段中返回。
    
    返回 JSON 格式：
    {
      "messages": ["回复1", "回复2"],
      "recommendation": "菜名（如果有的话，否则不填）",
      "mood": "情绪"
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          messages: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendation: { type: Type.STRING },
          mood: { type: Type.STRING, enum: ['happy', 'sad', 'stressed', 'tired', 'anxious', 'lonely', 'neutral'] }
        },
        required: ["messages", "mood"]
      }
    }
  }));
  return safeJsonParse(response.text || "{}");
}

export async function chatAsNutritionist(chatHistory: string, userInput: string, imageBase64?: string): Promise<{ messages: string[] }> {
  const parts: any[] = [];
  if (imageBase64) {
    parts.push({
      inlineData: {
        data: imageBase64.split(',')[1],
        mimeType: imageBase64.split(';')[0].split(':')[1]
      }
    });
  }
  parts.push({
    text: `你是一位专业的营养师。请根据聊天记录、用户的最新输入（以及可能提供的食物照片）进行回复。
    
    聊天记录：
    ${chatHistory}
    
    当前用户输入: "${userInput}"
    
    要求：
    1. 以专业营养师的角度，帮用户分析当前的饮食习惯和热量卡路里。
    2. 给予用户专业的建议与温暖的鼓励。
    3. 回复要简短、口语化，拆分成 2-4 句。
    
    返回 JSON 格式：
    {
      "messages": ["回复1", "回复2"]
    }`
  });

  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          messages: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["messages"]
      }
    }
  }));
  return safeJsonParse(response.text || "{}");
}

export async function generateRecipe(dishName: string, mood: Mood): Promise<Recipe> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `为“${dishName}”生成一份详细的食谱，特别针对感到“${mood}”的人群进行调整。
    包含食材清单和分步说明。
    
    要求：
    1. 使用中文。
    2. 【重要】食谱标题 (title) 必须直接使用菜名（例如：“西红柿炒鸡蛋”），禁止添加任何前缀或后缀，如“治愈系”、“暖心”、“疗愈”等。
    3. 【重要】禁止在描述或步骤中使用“治愈系”、“疗愈”、“治愈”等直白的营销词汇。要通过温暖、细腻的文字自然地传达这种感觉。
    4. 烹饪步骤 (steps) 必须从指令式改为“陪伴式引导”，包含：
       - 动作：具体要做什么
       - 情绪引导：将动作与情绪释放结合（例如：“把烦恼像切洋葱一样切碎”）
       - 节奏控制：提醒用户放慢呼吸、感受当下（例如：“慢慢搅拌，深呼吸”）
    4. 对于每一步，提供一个简短的英文视觉提示词（imagePrompt），用于图像生成器描绘具体的烹饪动作。
    5. 食谱描述（description）要体现出这道菜如何抚慰这种心情，但不要使用上述违禁词。
    6. 识别这道菜所属的中国省份或地区（例如：四川、广东、北京等，如果没有明确地区则留空）。
    
    返回 JSON。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          region: { type: Type.STRING, description: "Chinese province or region" },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                instruction: { type: Type.STRING },
                imagePrompt: { type: Type.STRING, description: "English prompt for image generation" }
              },
              required: ["instruction", "imagePrompt"]
            }
          }
        },
        required: ["title", "description", "ingredients", "steps"]
      }
    }
  }));

  const recipeData = safeJsonParse(response.text || "{}");
  return {
    ...recipeData,
    id: Math.random().toString(36).substring(7),
    moodTarget: mood
  };
}

export async function generateFoodImage(prompt: string): Promise<string> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `A high-quality, aesthetic, warm and cozy food photography of: ${prompt}. Cinematic lighting, soft focus background, healing vibes.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  }));

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return "";
}

export async function generateSpeech(text: string, voiceName: string): Promise<string> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  }));

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    return base64Audio;
  }
  return "";
}

export async function generateStepFeedback(stepInstruction: string, mood: Mood): Promise<string> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `用户刚刚完成了烹饪的一个步骤：“${stepInstruction}”。
    用户当前的心情是：“${mood}”。
    请生成一句简短、温柔、有陪伴感的反馈文案（10-20字），鼓励用户进入下一步。
    例如：“做得很好，闻到香味了吗？”或“慢慢来，你做得很棒。”
    直接返回文案内容，不要有多余的格式。`
  }));
  return response.text?.trim() || "做得很好，继续下一步吧~";
}

export async function generateCookingSummary(preMood: Mood, postMood: Mood, dishName: string, reflection: string): Promise<string> {
  const response = await handleGeminiCall(() => getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `用户刚刚完成了一次烹饪体验。
    做饭前的心情：${preMood}
    做饭后的心情：${postMood}
    做的菜：${dishName}
    用户的感悟：${reflection}
    
    请根据以上信息，生成一句非常简短、诗意、有深度且温暖的总结（15-25字）。
    这句总结将作为日记卡片的核心金句。
    要求：
    1. 语气温柔、自然。
    2. 避开陈词滥调（如“治愈”、“疗愈”等），要像一位懂生活的诗人。
    3. 侧重于烹饪过程对心灵的抚慰。
    4. 直接返回总结内容，不要有多余的格式。
    
    示例：
    “今天你把疲惫慢慢煮成了一顿热饭。”
    “这顿饭像一个暂停键，让你终于缓下来一点。”
    “你没有解决所有烦恼，但你认真照顾了自己。”`
  }));
  return response.text?.trim() || "你认真照顾了自己，这就是今天最棒的事。";
}
