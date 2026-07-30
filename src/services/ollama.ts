/**
 * Ollama chat service - use local or hosted Ollama models
 * Set OLLAMA_BASE_URL (default: http://localhost:11434) and OLLAMA_MODEL (default: codemax-beta:latest)
 */

const OLLAMA_BASE_URL =
  process.env.NEXT_PUBLIC_OLLAMA_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  "http://localhost:11434";
const OLLAMA_MODEL =
  process.env.NEXT_PUBLIC_OLLAMA_MODEL ||
  process.env.OLLAMA_MODEL ||
  "codemax-beta:latest";

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

function buildMessages(
  prompt: string,
  history: Array<{ role: string; parts: Array<{ text: string }> }>,
  userContext: string,
  responseStyle: string
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  let systemContent = SYSTEM_PROMPT;
  if (userContext) {
    systemContent += `\n\nUser Context (What you should know about the user):\n${userContext}`;
  }
  if (responseStyle) {
    systemContent += `\n\nResponse Style (How you should respond):\n${responseStyle}`;
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
  ];

  for (const m of history) {
    const text = m.parts?.[0]?.text ?? "";
    if (!text) continue;
    const role = m.role === "user" ? "user" : "assistant"; // model -> assistant
    messages.push({ role, content: text });
  }

  messages.push({ role: "user", content: prompt });
  return messages;
}

export async function* generateChatResponseStream(
  prompt: string,
  history: Array<{ role: string; parts: Array<{ text: string }> }> = [],
  _useThinking = false,
  _useFast = false,
  userContext = "",
  responseStyle = "",
  _tools: unknown[] = [],
  modelOverride?: string
) {
  const model = modelOverride || OLLAMA_MODEL;
  const messages = buildMessages(prompt, history, userContext, responseStyle);

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error: ${res.status} ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const text = obj.message?.content ?? "";
        if (text) {
          yield {
            text,
            groundingMetadata: null,
            functionCalls: undefined,
          };
        }
        if (obj.done) break;
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Parse any remaining buffer
  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer);
      const text = obj.message?.content ?? "";
      if (text) {
        yield {
          text,
          groundingMetadata: null,
          functionCalls: undefined,
        };
      }
    } catch {
      // Ignore
    }
  }
}
