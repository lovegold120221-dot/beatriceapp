import { database } from '../lib/firebase';
import { ref, set, push, get, update, onValue, off, query, orderByChild, equalTo } from 'firebase/database';

export type TaskState = 'proposed' | 'incoming' | 'claimed' | 'running' | 'done' | 'cancelled' | 'failed';

export interface TaskRecord {
  id: string;
  state: TaskState;
  brief: TaskBrief;
  ownerId: string;
  deviceId: string | null;
  createdAt: number;
  claimedAt: number | null;
  completedAt: number | null;
  progress: ProgressEvent[];
  result: TaskResult | null;
  cancellationRequested: boolean;
}

export interface TaskBrief {
  goal: string;
  steps: string[];
  app?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  context?: string;
}

export interface ProgressEvent {
  state: TaskState;
  message: string;
  timestamp: number;
  step?: number;
  totalSteps?: number;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  details?: string;
  completedAt: number;
}

export interface DevicePairing {
  deviceId: string;
  pairingCode: string;
  ownerId: string;
  name: string;
  pairedAt: number;
}

/**
 * Firebase RTDB task queue service.
 * 
 * Structure:
 * /tasks/{taskId}           — TaskRecord
 * /devices/{deviceId}       — DevicePairing
 * /users/{uid}/devices      — list of device IDs
 * /users/{uid}/incomingTasks — list of task IDs pending claim
 */

const TASKS_PATH = 'tasks';
const DEVICES_PATH = 'devices';
const USERS_PATH = 'users';

// ─── Device Pairing ───────────────────────────────────────────

/** Create a pairing code for a new device. The phone generates this. */
export async function createDevicePairing(ownerId: string, deviceName: string): Promise<{ deviceId: string; pairingCode: string }> {
  const deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const pairing: DevicePairing = {
    deviceId,
    pairingCode,
    ownerId,
    name: deviceName,
    pairedAt: Date.now(),
  };

  await set(ref(database, `${DEVICES_PATH}/${deviceId}`), pairing);
  await set(ref(database, `${USERS_PATH}/${ownerId}/devices/${deviceId}`), true);

  return { deviceId, pairingCode };
}

/** Link a pairing code to a web user (so they can send tasks to the phone). */
export async function linkDeviceToUser(pairingCode: string, webUserId: string): Promise<DevicePairing | null> {
  // Find the device by pairing code
  const snapshot = await get(ref(database, DEVICES_PATH));
  if (!snapshot.exists()) return null;

  let foundDevice: DevicePairing | null = null;
  let foundKey: string | null = null;

  snapshot.forEach((child) => {
    const device = child.val() as DevicePairing;
    if (device.pairingCode === pairingCode.toUpperCase() && device.ownerId) {
      foundDevice = device;
      foundKey = child.key;
    }
  });

  if (!foundDevice || !foundKey) return null;

  // Link the web user to this device
  await update(ref(database, `${DEVICES_PATH}/${foundKey}`), {
    ownerId: webUserId,
  });
  await set(ref(database, `${USERS_PATH}/${webUserId}/devices/${foundKey}`), true);

  return { ...foundDevice, ownerId: webUserId };
}

/** Get all devices paired to a user. */
export async function getUserDevices(userId: string): Promise<DevicePairing[]> {
  const snapshot = await get(ref(database, `${USERS_PATH}/${userId}/devices`));
  if (!snapshot.exists()) return [];

  const devices: DevicePairing[] = [];
  for (const key of Object.keys(snapshot.val())) {
    const devSnapshot = await get(ref(database, `${DEVICES_PATH}/${key}`));
    if (devSnapshot.exists()) {
      devices.push(devSnapshot.val() as DevicePairing);
    }
  }
  return devices;
}

// ─── Task Queue ───────────────────────────────────────────────

/** Create a task proposal (Beatrice proposes, user confirms). */
export async function createTaskProposal(brief: TaskBrief, ownerId: string, deviceId: string): Promise<string> {
  const taskRef = push(ref(database, TASKS_PATH));
  const taskId = taskRef.key!;

  const task: Partial<TaskRecord> = {
    id: taskId,
    state: 'proposed',
    brief,
    ownerId,
    deviceId,
    createdAt: Date.now(),
    claimedAt: null,
    completedAt: null,
    progress: [],
    result: null,
    cancellationRequested: false,
  };

  await set(taskRef, task);
  return taskId;
}

/** Confirm a proposed task — moves it to 'incoming' so the phone can claim it. */
export async function confirmTask(taskId: string): Promise<void> {
  const updates: Record<string, unknown> = {};
  updates[`/${TASKS_PATH}/${taskId}/state`] = 'incoming';
  updates[`/${TASKS_PATH}/${taskId}/progress`] = [
    { state: 'incoming', message: 'Task confirmed and queued', timestamp: Date.now() },
  ];

  // Also add to the user's incoming list
  const taskSnapshot = await get(ref(database, `${TASKS_PATH}/${taskId}`));
  if (taskSnapshot.exists()) {
    const task = taskSnapshot.val() as TaskRecord;
    updates[`/${USERS_PATH}/${task.ownerId}/incomingTasks/${taskId}`] = task.deviceId;
  }

  await update(ref(database), updates);
}

/** Phone claims a task atomically — only succeeds if state is still 'incoming'. */
export async function claimTask(taskId: string, deviceId: string): Promise<boolean> {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const snapshot = await get(taskRef);

  if (!snapshot.exists()) return false;
  const task = snapshot.val() as TaskRecord;

  // Verify this device is allowed to claim
  if (task.deviceId !== deviceId) return false;

  // Verify state is still 'incoming' (atomic check)
  if (task.state !== 'incoming') return false;

  // Atomically transition to 'claimed'
  await update(taskRef, {
    state: 'claimed',
    claimedAt: Date.now(),
  });

  // Remove from incoming
  await set(ref(database, `${USERS_PATH}/${task.ownerId}/incomingTasks/${taskId}`), null);

  return true;
}

/** Update task progress (phone writes these as it executes). */
export async function updateTaskProgress(taskId: string, state: TaskState, message: string, step?: number, totalSteps?: number): Promise<void> {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const snapshot = await get(taskRef);
  if (!snapshot.exists()) return;

  const task = snapshot.val() as TaskRecord;
  const progress = task.progress || [];
  progress.push({ state, message, timestamp: Date.now(), step, totalSteps });

  const updates: Record<string, unknown> = {
    state,
    progress,
  };

  if (state === 'done' || state === 'failed' || state === 'cancelled') {
    updates.completedAt = Date.now();
  }

  await update(taskRef, updates);
}

/** Mark a task as done with a result. */
export async function completeTask(taskId: string, result: TaskResult): Promise<void> {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const snapshot = await get(taskRef);
  if (!snapshot.exists()) return;

  const task = snapshot.val() as TaskRecord;
  const progress = task.progress || [];
  progress.push({ state: 'done', message: result.summary, timestamp: Date.now() });

  await update(taskRef, {
    state: 'done',
    result,
    completedAt: Date.now(),
    progress,
  });
}

/** Request cancellation (web side can request, phone checks and stops). */
export async function requestCancellation(taskId: string): Promise<void> {
  await update(ref(database, `${TASKS_PATH}/${taskId}`), {
    cancellationRequested: true,
  });
}

/** Mark a task as cancelled (phone confirms). */
export async function cancelTask(taskId: string, reason: string): Promise<void> {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const snapshot = await get(taskRef);
  if (!snapshot.exists()) return;

  const task = snapshot.val() as TaskRecord;
  const progress = task.progress || [];
  progress.push({ state: 'cancelled', message: reason, timestamp: Date.now() });

  await update(taskRef, {
    state: 'cancelled',
    completedAt: Date.now(),
    progress,
  });
}

/** Mark a task as failed. */
export async function failTask(taskId: string, error: string): Promise<void> {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const snapshot = await get(taskRef);
  if (!snapshot.exists()) return;

  const task = snapshot.val() as TaskRecord;
  const progress = task.progress || [];
  progress.push({ state: 'failed', message: error, timestamp: Date.now() });

  await update(taskRef, {
    state: 'failed',
    completedAt: Date.now(),
    progress,
  });
}

// ─── Subscriptions ────────────────────────────────────────────

/** Subscribe to task updates (web side listens for progress). */
export function subscribeToTask(taskId: string, callback: (task: TaskRecord) => void): () => void {
  const taskRef = ref(database, `${TASKS_PATH}/${taskId}`);
  const unsubscribe = onValue(taskRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as TaskRecord);
    }
  });
  return unsubscribe;
}

/** Subscribe to incoming tasks for a device (phone listens for new tasks). */
export function subscribeToIncomingTasks(ownerId: string, deviceId: string, callback: (taskIds: string[]) => void): () => void {
  const incomingRef = ref(database, `${USERS_PATH}/${ownerId}/incomingTasks`);
  const unsubscribe = onValue(incomingRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const data = snapshot.val() as Record<string, string>;
    // Filter to only tasks for this device
    const taskIds = Object.entries(data)
      .filter(([_, dev]) => dev === deviceId)
      .map(([taskId]) => taskId);
    callback(taskIds);
  });
  return unsubscribe;
}

/** Subscribe to cancellation requests for a task (phone checks periodically). */
export function subscribeToCancellation(taskId: string, callback: (cancelled: boolean) => void): () => void {
  const cancelRef = ref(database, `${TASKS_PATH}/${taskId}/cancellationRequested`);
  const unsubscribe = onValue(cancelRef, (snapshot) => {
    callback(snapshot.val() === true);
  });
  return unsubscribe;
}

// ─── Query helpers ────────────────────────────────────────────

/** Get a task by ID. */
export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const snapshot = await get(ref(database, `${TASKS_PATH}/${taskId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as TaskRecord;
}

/** Get all tasks for a user. */
export async function getUserTasks(userId: string): Promise<TaskRecord[]> {
  const snapshot = await get(ref(database, TASKS_PATH));
  if (!snapshot.exists()) return [];

  const tasks: TaskRecord[] = [];
  snapshot.forEach((child) => {
    const task = child.val() as TaskRecord;
    if (task.ownerId === userId) {
      tasks.push(task);
    }
  });
  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}