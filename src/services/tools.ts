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

export const taskerTool: FunctionDeclaration = {
  name: "executeTask",
  description: "Delegate a task to the tasker agent. Use this when the user asks you to perform an action, create something, run code, automate a workflow, or execute any task that requires multi-step execution. The tasker agent will handle the task asynchronously and report back.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task: {
        type: Type.STRING,
        description: "The task description or prompt to send to the tasker agent. Be specific and detailed about what needs to be done.",
      },
      priority: {
        type: Type.STRING,
        enum: ["low", "normal", "high", "urgent"],
        description: "The priority level of the task.",
      },
    },
    required: ["task"],
  },
};

export const tools = [calculatorTool, calendarTool, taskerTool];

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
    // Mock implementation
    return { events: [{ title: "Meeting", time: "10:00 AM" }, { title: "Lunch", time: "1:00 PM" }] };
  }
  if (name === "executeTask") {
    // This will be handled by the tasker agent integration
    // Return a confirmation that the task has been queued
    return { 
      status: "queued", 
      message: `Task delegated to tasker agent: ${args.task}`,
      priority: args.priority || "normal"
    };
  }
  return { error: "Unknown tool" };
}
