import express from "express";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post("/api/detectMood", async (req, res) => {
    try {
      const { userInput } = req.body;
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `你是一个温暖、有同理心的美食陪伴者。
请根据用户的输入，分析他们的情绪，并推荐一道能抚慰他们当前心情的菜肴。

必须返回严格的 JSON 格式，包含以下字段：
- mood: 情绪类别，必须是以下之一：'happy', 'sad', 'stressed', 'tired', 'anxious', 'angry', 'neutral'
- empathyResponse: 一段简短、温暖、共情的话语（不超过50字）
- recommendation: 推荐的菜肴名称（仅名称，如"番茄炒蛋"）`
          },
          { role: "user", content: userInput }
        ],
        response_format: { type: "json_object" }
      });
      res.json(JSON.parse(completion.choices[0].message.content || "{}"));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generateRecipe", async (req, res) => {
    try {
      const { dishName, mood } = req.body;
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `你是一位擅长用美食温暖人心的主厨。
请为这道菜生成一份详细的食谱，并在步骤中融入对用户当前情绪（${mood}）的安抚和鼓励。

必须返回严格的 JSON 格式，包含以下字段：
- title: 菜谱名称（直接使用菜名，不要添加“治愈系”等词汇）
- description: 一段温暖的菜品描述，说明为什么这道菜适合现在的心情
- ingredients: 食材列表（字符串数组）
- region: 识别这道菜所属的中国省份或地区（例如：四川、广东、北京等，如果没有明确地区则留空）
- steps: 烹饪步骤数组，每个步骤是一个对象，包含：
  - instruction: 步骤说明（字符串），在字里行间加入一些温暖的提示
  - imagePrompt: 简短的英文视觉提示词（字符串），用于图像生成器描绘具体的烹饪动作`
          },
          { role: "user", content: `菜名：${dishName}` }
        ],
        response_format: { type: "json_object" }
      });
      res.json(JSON.parse(completion.choices[0].message.content || "{}"));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyzeCalories", async (req, res) => {
    try {
      const { image, userInput } = req.body;
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `你是一个专业的营养师，同时保持温暖和鼓励的语气。
请分析图片中的食物，估算其卡路里和热量，并给出相应的健康减脂饮食建议。

要求：
1. 使用中文回复。
2. 给出具体的卡路里估算范围。
3. 给出针对性的减脂建议。
4. 使用 Markdown 格式排版，使其易于阅读。`
          },
          {
            role: "user",
            content: [
              { type: "text", text: `用户说明："${userInput || '无'}"` },
              { type: "image_url", image_url: { url: image } }
            ]
          }
        ]
      });
      res.json({ text: completion.choices[0].message.content });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generateImage", async (req, res) => {
    try {
      const { prompt } = req.body;
      const basePrompt = prompt || "A delicious and comforting food dish";
      const finalPrompt = `A high-quality, aesthetic, warm and cozy food photography of: ${basePrompt}. Cinematic lighting, soft focus background, healing vibes.`;
      const response = await getOpenAI().images.generate({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json"
      });
      res.json({ imageUrl: `data:image/png;base64,${response.data[0].b64_json}` });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
