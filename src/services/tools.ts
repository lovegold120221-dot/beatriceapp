import { FunctionDeclaration, Type } from "@google/genai";

export const calculatorTool: FunctionDeclaration = {
  name: "calculate",
  description: "Perform basic mathematical calculations.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The mathematical operation to perform.",
      },
      a: { type: Type.NUMBER, description: "First operand." },
      b: { type: Type.NUMBER, description: "Second operand." },
    },
    required: ["operation", "a", "b"],
  },
};

export const calendarTool: FunctionDeclaration = {
  name: "getCalendarEvents",
  description: "Get calendar events for a specific date.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "The date in YYYY-MM-DD format." },
    },
    required: ["date"],
  },
};

export const proposePhoneTaskTool: FunctionDeclaration = {
  name: "proposePhoneTask",
  description: "Propose a phone automation task for the user to confirm. Beatrice creates a detailed task proposal with steps, and the user must confirm before it's sent to their paired Android phone for execution. Use this when the user asks to do something on their phone — open apps, play media, send messages, set alarms, search, navigate, toggle settings, etc.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      goal: {
        type: Type.STRING,
        description: "A clear, specific description of what the task should accomplish on the phone.",
      },
      steps: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "The planned sequence of actions the phone agent should take (e.g. ['Open YouTube', 'Tap search', 'Type the video name', 'Press search', 'Tap first result']).",
      },
      app: {
        type: Type.STRING,
        description: "The primary app the task will use (e.g. 'YouTube', 'WhatsApp', 'Settings').",
      },
      priority: {
        type: Type.STRING,
        enum: ["low", "normal", "high", "urgent"],
        description: "The priority level of the task.",
      },
      context: {
        type: Type.STRING,
        description: "Additional context that helps the phone agent (e.g. a search query, a contact name, a specific URL).",
      },
    },
    required: ["goal", "steps"],
  },
};

export const tools = [calculatorTool, calendarTool, proposePhoneTaskTool];

export async function executeTool(name: string, args: any) {
  if (name === "calculate") {
    const { operation, a, b } = args;
    switch (operation) {
      case "add": return { result: a + b };
      case "subtract": return { result: a - b };
      case "multiply": return { result: a * b };
      case "divide": return { result: b !== 0 ? a / b : "Cannot divide by zero" };
      default: return { error: "Unknown operation" };
    }
  }
  if (name === "getCalendarEvents") {
    return { events: [{ title: "Meeting", time: "10:00 AM" }, { title: "Lunch", time: "1:00 PM" }] };
  }
  if (name === "proposePhoneTask") {
    // Return the proposal — the UI layer handles user confirmation + Firebase push.
    return {
      status: "proposed",
      goal: args.goal,
      steps: args.steps,
      app: args.app || null,
      priority: args.priority || "normal",
      context: args.context || null,
      message: `Task proposal created: "${args.goal}". Awaiting user confirmation.`,
    };
  }
  return { error: "Unknown tool" };
}
