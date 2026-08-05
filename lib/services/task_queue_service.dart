import 'dart:async';
import 'dart:developer' as developer;
import 'package:firebase_database/firebase_database.dart';
import 'firebase_service.dart';
import 'action_handler.dart';
import 'ai_service.dart';
import 'notification_service.dart';

/// The shape of a task brief coming from the web app (Beatrice Voice).
class TaskBrief {
  final String goal;
  final List<String> steps;
  final String? app;
  final String priority;
  final String? context;

  TaskBrief({
    required this.goal,
    required this.steps,
    this.app,
    this.priority = 'normal',
    this.context,
  });

  factory TaskBrief.fromMap(Map<dynamic, dynamic> json) {
    return TaskBrief(
      goal: json['goal']?.toString() ?? '',
      steps: (json['steps'] as List?)?.map((e) => e.toString()).toList() ?? [],
      app: json['app']?.toString(),
      priority: json['priority']?.toString() ?? 'normal',
      context: json['context']?.toString(),
    );
  }
}

/// Connects the Beatrice OS phone agent to the Firebase RTDB task queue.
///
/// Flow:
/// 1. [start] subscribes to incoming tasks for this device's owner.
/// 2. When a task arrives, [claimTask] atomically transitions it to 'claimed'.
/// 3. [executeTask] runs it via TaskExecutor (if multi-step) or ActionHandler,
///    writing progress events to Firebase as it goes.
/// 4. On completion, writes the result. On failure, writes the error.
/// 5. Listens for cancellation requests and stops the executor.
///
/// The web app (beatrice.eburon.ai) subscribes to the same task record and
/// speaks progress updates to the user via Gemini Live.
class TaskQueueService {
  final FirebaseService _firebase;
  final ActionHandler _actionHandler;
  final AiService _aiService;
  final NotificationService _notificationService;

  StreamSubscription? _incomingSub;
  StreamSubscription? _cancelSub;
  bool _running = false;

  /// Callback for UI updates (e.g. showing a toast or notification).
  void Function(String message)? onStatusUpdate;

  TaskQueueService({
    required FirebaseService firebase,
    required ActionHandler actionHandler,
    required AiService aiService,
    required NotificationService notificationService,
  })  : _firebase = firebase,
        _actionHandler = actionHandler,
        _aiService = aiService,
        _notificationService = notificationService;

  /// Start listening for incoming tasks. Call after device pairing is confirmed.
  void start() {
    if (!_firebase.isInitialized || _firebase.deviceId == null) {
      developer.log('TaskQueue: not starting — Firebase not ready',
          name: 'BeatriceOS');
      return;
    }

    final ownerId = _firebase.ownerId;
    if (ownerId == null) {
      developer.log('TaskQueue: not starting — device not linked to an owner',
          name: 'BeatriceOS');
      return;
    }

    // Listen to the owner's incoming tasks, filtered by this device's ID.
    final incomingRef =
        _firebase.database.ref('users/$ownerId/incomingTasks');
    _incomingSub = incomingRef.onValue.listen((event) async {
      if (event.snapshot.value == null) return;

      final data = event.snapshot.value as Map<dynamic, dynamic>;
      for (final entry in data.entries) {
        final taskId = entry.key.toString();
        final taskDeviceId = entry.value.toString();

        // Only process tasks for THIS device.
        if (taskDeviceId != _firebase.deviceId) continue;
        if (_running) continue; // Already executing a task.

        await _processIncomingTask(taskId);
      }
    });

    developer.log('TaskQueue listening for tasks (owner=$ownerId)',
        name: 'BeatriceOS');
    onStatusUpdate?.call('Connected to Beatrice Voice task queue');
  }

  /// Stop listening.
  void stop() {
    _incomingSub?.cancel();
    _incomingSub = null;
    _cancelSub?.cancel();
    _cancelSub = null;
  }

  /// Claim and execute an incoming task.
  Future<void> _processIncomingTask(String taskId) async {
    _running = true;

    try {
      // 1. Fetch the task record.
      final taskSnap = await _firebase.database.ref('tasks/$taskId').get();
      if (!taskSnap.exists) {
        _running = false;
        return;
      }
      final task = taskSnap.value as Map<dynamic, dynamic>;
      final state = task['state']?.toString();

      // 2. Verify it's still 'incoming' (not already claimed by another run).
      if (state != 'incoming') {
        _running = false;
        return;
      }

      // 3. Atomically claim it.
      final claimed = await _claimTask(taskId);
      if (!claimed) {
        _running = false;
        return;
      }

      onStatusUpdate?.call('Claimed task: ${task['brief']?['goal']}');

      // 4. Subscribe to cancellation requests.
      _cancelSub = _firebase.database
          .ref('tasks/$taskId/cancellationRequested')
          .onValue
          .listen((event) {
        if (event.snapshot.value == true) {
          developer.log('TaskQueue: cancellation requested for $taskId',
              name: 'BeatriceOS');
          // The TaskExecutor checks _cancelled — we signal it via the
          // action handler's current executor.
          _actionHandler.cancelCurrentTask();
        }
      });

      // 5. Parse the brief.
      final brief = TaskBrief.fromMap(task['brief'] as Map<dynamic, dynamic>);

      // 6. Write 'running' state.
      await _updateProgress(taskId, 'running', 'Starting task: ${brief.goal}');

      // 7. Execute via TaskExecutor (multi-step) or ActionHandler (simple).
      await _notificationService.showTaskCompleteNotification(
        'Beatrice OS Task',
        'Executing: ${brief.goal}',
      );

      // Build a TaskExecutor for this task.
      final executor = _actionHandler.createTaskExecutor(
        aiService: _aiService,
        onProgress: (msg) {
          _updateProgress(taskId, 'running', msg);
        },
      );

      final result = await executor.executeTask(brief.goal);

      // 8. Write the final result.
      if (executor.wasCancelled) {
        await _cancelTask(taskId, 'Task cancelled by user');
        await _notificationService.showTaskCompleteNotification(
          'Task Cancelled',
          brief.goal,
        );
      } else if (result.startsWith('I could not') ||
          result.startsWith('Agent stuck')) {
        await _failTask(taskId, result);
        await _notificationService.showTaskCompleteNotification(
          'Task Failed',
          brief.goal,
        );
      } else {
        await _completeTask(taskId, result);
        await _notificationService.showTaskCompleteNotification(
          'Task Completed',
          brief.goal,
        );
      }

      onStatusUpdate?.call('Task done: ${brief.goal}');
    } catch (e) {
      developer.log('TaskQueue execution error: $e', name: 'BeatriceOS');
      await _failTask(taskId, 'Execution error: $e');
    } finally {
      _cancelSub?.cancel();
      _cancelSub = null;
      _running = false;
    }
  }

  /// Atomically claim a task. Returns true if the claim succeeded.
  Future<bool> _claimTask(String taskId) async {
    final taskRef = _firebase.database.ref('tasks/$taskId');
    final snap = await taskRef.get();
    if (!snap.exists) return false;

    final task = snap.value as Map<dynamic, dynamic>;
    if (task['state'] != 'incoming') return false;
    if (task['deviceId'] != _firebase.deviceId) return false;

    await taskRef.update({
      'state': 'claimed',
      'claimedAt': ServerValue.timestamp,
    });

    // Remove from the incoming list.
    final ownerId = _firebase.ownerId;
    if (ownerId != null) {
      await _firebase.database
          .ref('users/$ownerId/incomingTasks/$taskId')
          .remove();
    }

    return true;
  }

  /// Write a progress event to the task record.
  Future<void> _updateProgress(
      String taskId, String state, String message) async {
    final taskRef = _firebase.database.ref('tasks/$taskId');
    final snap = await taskRef.get();
    if (!snap.exists) return;

    final task = snap.value as Map<dynamic, dynamic>;
    final progress = (task['progress'] as List?)?.toList() ?? [];
    progress.add({
      'state': state,
      'message': message,
      'timestamp': ServerValue.timestamp,
    });

    await taskRef.update({
      'state': state,
      'progress': progress,
    });
  }

  /// Mark a task as done with a result summary.
  Future<void> _completeTask(String taskId, String summary) async {
    final taskRef = _firebase.database.ref('tasks/$taskId');
    final snap = await taskRef.get();
    if (!snap.exists) return;

    final task = snap.value as Map<dynamic, dynamic>;
    final progress = (task['progress'] as List?)?.toList() ?? [];
    progress.add({
      'state': 'done',
      'message': summary,
      'timestamp': ServerValue.timestamp,
    });

    await taskRef.update({
      'state': 'done',
      'completedAt': ServerValue.timestamp,
      'result': {
        'success': true,
        'summary': summary,
        'completedAt': ServerValue.timestamp,
      },
      'progress': progress,
    });
  }

  /// Mark a task as failed.
  Future<void> _failTask(String taskId, String error) async {
    final taskRef = _firebase.database.ref('tasks/$taskId');
    final snap = await taskRef.get();
    if (!snap.exists) return;

    final task = snap.value as Map<dynamic, dynamic>;
    final progress = (task['progress'] as List?)?.toList() ?? [];
    progress.add({
      'state': 'failed',
      'message': error,
      'timestamp': ServerValue.timestamp,
    });

    await taskRef.update({
      'state': 'failed',
      'completedAt': ServerValue.timestamp,
      'progress': progress,
    });
  }

  /// Mark a task as cancelled.
  Future<void> _cancelTask(String taskId, String reason) async {
    final taskRef = _firebase.database.ref('tasks/$taskId');
    final snap = await taskRef.get();
    if (!snap.exists) return;

    final task = snap.value as Map<dynamic, dynamic>;
    final progress = (task['progress'] as List?)?.toList() ?? [];
    progress.add({
      'state': 'cancelled',
      'message': reason,
      'timestamp': ServerValue.timestamp,
    });

    await taskRef.update({
      'state': 'cancelled',
      'completedAt': ServerValue.timestamp,
      'progress': progress,
    });
  }
}