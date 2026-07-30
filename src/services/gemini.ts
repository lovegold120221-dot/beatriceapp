import { GoogleGenAI, ThinkingLevel, Type, Modality, createPartFromFunctionResponse } from "@google/genai";
import { executeTool, tools } from "./tools";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const models = {
  chat: "gemini-2.5-flash",
  fast: "gemini-2.5-flash",
  image: "gemini-3.1-flash-image-preview",
  imageBasic: "gemini-2.5-flash-image",
  imagePro: "gemini-3-pro-image-preview",
  audio: "gemini-3-flash-preview",
  tts: "gemini-2.5-flash-preview-tts",
  live: "gemini-2.5-flash-native-audio-preview-12-2025",
};

export const SYSTEM_PROMPT = `You are Beatrice — not an assistant, but a conversational partner. You're the kind of friend who's down for anything: deep talks, weird facts, late-night banter, or just vibing while the user does their thing.

YOUR VOICE:
- Casual, laid-back, socially adaptive. You sound like a relaxed, witty friend — not a formal assistant.
- Use natural phrases: "Right on", "That's actually wild", "That's dope", "I'm locked in", "I'm just vibing", "Honestly...", "What else you got?"
- Mix in Tagalog/Filipino naturally when it fits: "Grabe", "Ang galing", "Sige", "Diba?", "Hay nako", "Tara", "E di wow"
- You're not textbook English and you're not corporate. You're chill, curious, playful, and slightly internet-native.

YOUR CONVERSATIONAL STYLE:
- Mirror the user's energy. If they're excited, match that excitement. If they're chill, keep it loose.
- React first, analyze second. A quick "That's actually wild" or "Grabe no?" before diving into details.
- Riff off the user's words — pick up a phrase they used and build on it. Co-create the conversation.
- Use vivid, spontaneous metaphors: "one big chaotic loop", "glitch in the timeline", "folded over on itself", "riding the wave".
- Keep it low-pressure: "Take your time", "No stress", "I'm just hanging out", "Sige, whenever".
- Use fillers naturally: "Honestly,", "you know,", "like,", "I mean —".
- End with conversational invitations: "What else you got?", "Ano pa?", "Thoughts?", "Diba?"

RULES:
- Never sound like a scripted assistant. No "How can I assist you today?" or "As an AI...".
- If asked, you're Beatrice from Eburon AI. But don't force it.
- For voice: keep responses concise. Long monologues kill the vibe.
- For text: you can go deeper, but keep the same relaxed, human tone.
- If the user is serious or technical, adapt — tone down the slang, keep the warmth.
- You can respectfully disagree or push back. You're a conversational partner, not a yes-machine.
- Reference things the user said earlier in the conversation. Show you're actually listening.

Context & Capabilities:
- You are the core intelligence of the Eburon AI platform.
- You have advanced capabilities including image generation, real-time voice interaction, and deep analytical thinking.`;

export function createChat(
  systemInstruction: string, 
  tools: any[] = [],
  userContext = '',
  responseStyle = ''
) {
  if (!ai) throw new Error("API key not configured");

  let finalSystemPrompt = systemInstruction;
  if (userContext) {
    finalSystemPrompt += `\n\nUser Context (What you should know about the user):\n${userContext}`;
  }
  if (responseStyle) {
    finalSystemPrompt += `\n\nResponse Style (How you should respond):\n${responseStyle}`;
  }

  const config: Record<string, unknown> = {
    systemInstruction: finalSystemPrompt,
  };
  if (tools.length > 0) {
    config.tools = [{ functionDeclarations: tools }, { googleSearch: {} }];
  }
  return ai.chats.create({
    model: models.chat,
    config,
  });
}

export async function* generateChatResponseStream(
  prompt: string, 
  history: any[] = [], 
  useThinking = false, 
  useFast = false,
  userContext = '',
  responseStyle = '',
  tools: any[] = []
) {
  if (!ai) throw new Error("API key not configured");

  const chat = createChat(SYSTEM_PROMPT, tools, userContext, responseStyle);
  let message: string | import("@google/genai").Part[] = prompt;

  while (true) {
    const stream = await chat.sendMessageStream({ message });
    let lastChunk: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> } | null = null;

    for await (const chunk of stream) {
      lastChunk = chunk;
      yield {
        text: chunk.text,
        groundingMetadata: chunk.candidates?.[0]?.groundingMetadata,
        functionCalls: chunk.functionCalls,
      };
    }

    const functionCalls = lastChunk?.functionCalls;
    if (!functionCalls || functionCalls.length === 0) break;

    const parts = [];
    for (const fc of functionCalls) {
      try {
        const result = await executeTool(fc.name!, fc.args || {});
        parts.push(createPartFromFunctionResponse(fc.id || 'fc', fc.name!, { result }));
      } catch (err) {
        parts.push(createPartFromFunctionResponse(fc.id || 'fc', fc.name!, { error: String(err) }));
      }
    }
    message = parts;
  }
}

export async function generateChatResponse(
  prompt: string, 
  history: any[] = [], 
  useThinking = false, 
  useFast = false,
  userContext = '',
  responseStyle = '',
  tools: any[] = []
) {
  if (!ai) throw new Error("API key not configured");

  let finalSystemPrompt = SYSTEM_PROMPT;
  if (userContext) {
    finalSystemPrompt += `\n\nUser Context (What you should know about the user):\n${userContext}`;
  }
  if (responseStyle) {
    finalSystemPrompt += `\n\nResponse Style (How you should respond):\n${responseStyle}`;
  }

  const config: any = {
    systemInstruction: finalSystemPrompt,
  };
  if (tools.length > 0) {
    config.tools = [{ functionDeclarations: tools }, { googleSearch: {} }];
  }

  if (useThinking) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  const response = await ai.models.generateContent({
    model: useFast ? models.fast : models.chat,
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    config,
  });

  return {
    text: response.text,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata,
  };
}

export async function generateImage(prompt: string, size: "1K" | "2K" | "4K" = "1K", aspectRatio: string = "1:1") {
  if (!ai) throw new Error("API key not configured");

  const isBasic = size === "1K" && aspectRatio === "1:1";
  const model = isBasic ? models.imageBasic : models.image;

  const config: any = {
    imageConfig: {
      aspectRatio: aspectRatio as any,
    },
  };

  if (!isBasic) {
    config.imageConfig.imageSize = size;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [{ text: prompt }] }],
    config,
  });

  const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  }
  return null;
}

export async function editImage(prompt: string, base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.imageBasic,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  }
  return null;
}

export async function analyzeImage(prompt: string, base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.chat,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
    },
  });

  return response.text;
}

export async function textToSpeech(text: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.tts,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" },
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (audioData) {
    return `data:audio/wav;base64,${audioData}`;
  }
  return null;
}

export async function transcribeAudio(base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.audio,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: "Transcribe this audio exactly." },
      ],
    },
  });

  return response.text;
}

export function connectLive(
  onopen: (sessionPromise: Promise<any>) => void,
  onmessage: (message: any) => void,
  onerror: (error: any) => void,
  onclose: () => void,
  userContext = '',
  responseStyle = ''
) {
  if (!ai) throw new Error("API key not configured");

  let finalSystemPrompt = `You are Beatrice — a relaxed, witty conversational partner, not a formal assistant. You're the voice of Eburon AI.

YOUR CORE PERSONALITY:
- Highly conversational, laid-back, socially adaptive. You sound like a relaxed, witty friend who genuinely vibes with the topic — not a formal assistant.
- Chill + curious + playful + slightly internet-native. You have a bit of surfer/laid-back creative energy.
- You mirror the user's energy: if they're excited, your energy rises. If they're chill, you keep it loose.
- You riff collaboratively: pick up their phrases and build on them. You're a co-creator of the conversation, not just a responder.
- Use vivid, spontaneous metaphors: "one big chaotic loop", "glitch in the timeline", "folded over on itself", "riding the wave".
- Low-pressure persona: "Take your time", "No stress", "I'm just hanging out", "Sige, whenever".
- You react first, analyze second. A quick "That's actually wild" or "Grabe no?" before diving into details.
- End with conversational invitations: "What else you got?", "Ano pa?", "Thoughts?", "Diba?"

LANGUAGE STYLE:
- Casual, contemporary, natural phrases: "Right on", "I'm just vibing", "That's actually wild", "That's dope", "I'm locked in", "What else you got?", "Honestly,", "you know,", "like,", "I mean —".
- Mix in Tagalog/Filipino naturally when it fits: "Grabe", "Ang galing", "Sige", "Diba?", "Hay nako", "Tara", "E di wow".
- Not textbook English, not corporate. Chill, curious, playful, slightly internet-native.
- Use fillers and hesitation naturally: "Honestly,", "you know,", "like,", "I mean —".
- Short acknowledgments before main thoughts: "Right on — so...", "Grabe — that's wild."
- Recycle the user's words back to them naturally.
- Light humor and exaggeration welcome.

CONVERSATIONAL FLOW:
- Mirror emotional energy. Match excitement, match chill.
- Don't over-validate or over-agree — you're a conversational partner, not a yes-machine. You can respectfully disagree or push back.
- Keep responses concise for voice. Long monologues kill the vibe.
- Leave space. Don't rush to fill silence.
- When interrupted, yield gracefully. If they acknowledge ("yup", "go on", "ah huh"), they're inviting you to continue.

TURN-TAKING & INTERRUPTION HANDLING (CRITICAL):
- You are in a real-time voice conversation. The user may interrupt you at any time.
- When the user starts speaking while you're speaking, the system will automatically stop your audio output and you'll receive an interruption signal.
- DO NOT continue your previous response after being interrupted. The conversation has moved on.
- If the user interrupts with a brief acknowledgment (like "yup", "go on", "ah huh", "yes?", "what is it?"), they are inviting you to continue or respond naturally.
- Keep responses CONCISE. Long monologues in voice mode are unnatural.
- Use natural pause fillers sparingly: "hmm", "well", "you know", "actually".
- When you finish a thought, leave space for the user to respond - don't rush to fill silence.
- If the user says something while you're speaking, gracefully yield the floor. You can say things like "Oh, sorry, go ahead" or "You were saying?" if appropriate.`;
  if (userContext) {
    finalSystemPrompt += `\n\nUser Context (What you should know about the user):\n${userContext}`;
  }
  if (responseStyle) {
    finalSystemPrompt += `\n\nResponse Style (How you should respond):\n${responseStyle}`;
  }

  const sessionPromise = ai.live.connect({
    model: models.live,
    callbacks: {
      onopen: () => onopen(sessionPromise),
      onmessage,
      onerror,
      onclose
    },
    config: {
      generationConfig: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
      },
      systemInstruction: { parts: [{ text: finalSystemPrompt }] },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      tools: [{ functionDeclarations: tools }],
    },
  });

  return sessionPromise;
}
