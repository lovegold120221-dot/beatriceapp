import { database } from '../lib/firebase';
import { ref, get } from 'firebase/database';
import {
  linkDeviceToUser,
  getUserDevices,
  createTaskProposal,
  confirmTask,
  subscribeToTask,
  getTask,
  DevicePairing,
  TaskBrief,
  TaskRecord,
} from './taskQueue';

/**
 * High-level phone bridge for the Beatrice Voice web app.
 *
 * - pairDevice: user enters the pairing code shown on their phone → links
 *   the phone to their account.
 * - getDevices: list the user's paired phones.
 * - sendTaskToPhone: creates a task proposal, confirms it (moves it to
 *   'incoming'), and subscribes to progress so the UI can speak updates.
 */

/** Link a phone to the logged-in user using the pairing code from the phone. */
export async function pairDevice(pairingCode: string, webUserId: string): Promise<DevicePairing | null> {
  if (!pairingCode.trim()) return null;
  const device = await linkDeviceToUser(pairingCode.trim(), webUserId);
  if (!device) return null;
  return device;
}

/** List all phones paired to the user. */
export async function getDevices(userId: string): Promise<DevicePairing[]> {
  if (!userId) return [];
  return getUserDevices(userId);
}

export interface TaskHandle {
  taskId: string;
  /** Stop listening for progress updates. */
  unsubscribe: () => void;
}

/**
 * Send a task to the first paired phone: create proposal → confirm → listen
 * for progress. Returns a handle plus a live task object via the callback.
 */
export async function sendTaskToPhone(
  brief: TaskBrief,
  userId: string,
  deviceId: string,
  onUpdate: (task: TaskRecord | null) => void,
): Promise<TaskHandle | null> {
  const taskId = await createTaskProposal(brief, userId, deviceId);
  if (!taskId) return null;

  await confirmTask(taskId);

  // Read the initial record so we can report immediately.
  const initial = await getTask(taskId);
  onUpdate(initial);

  const unsubscribe = subscribeToTask(taskId, (task) => {
    onUpdate(task);
  });

  return { taskId, unsubscribe };
}

/** Check whether a task is still running (for UI state). */
export function isTaskActive(task: TaskRecord | null): boolean {
  if (!task) return false;
  return task.state === 'claimed' || task.state === 'running' || task.state === 'incoming';
}

/** Check whether a task finished (for UI state). */
export function isTaskFinished(task: TaskRecord | null): boolean {
  if (!task) return false;
  return task.state === 'done' || task.state === 'failed' || task.state === 'cancelled';
}

/** Latest progress message of a task, or null. */
export function latestProgressMessage(task: TaskRecord | null): string | null {
  const progress = task?.progress;
  if (!progress || progress.length === 0) return null;
  return progress[progress.length - 1].message;
}

/** Keep a reference to the database for callers that need it. */
export { database, ref, get };
