import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import '../models/saved_skill.dart';

class SkillMemoryService {
  List<SavedSkill> _skills = [];
  bool _isLoaded = false;

  Future<File> get _localFile async {
    final directory = await getApplicationDocumentsDirectory();
    return File('${directory.path}/skills_memory.jsonl');
  }

  Future<void> _loadSkills() async {
    if (_isLoaded) return;
    try {
      final file = await _localFile;
      if (!await file.exists()) {
        _isLoaded = true;
        return;
      }
      final lines = await file.readAsLines();
      for (final line in lines) {
        if (line.trim().isEmpty) continue;
        try {
          _skills.add(
            SavedSkill.fromJson(jsonDecode(line) as Map<String, dynamic>),
          );
        } catch (_) {
          // Skip a single corrupt line instead of losing all skills.
        }
      }
    } catch (e) {
      print('Failed to load skills: $e');
    }
    // Always mark as loaded so we don't retry on every call (soft lockout).
    _isLoaded = true;
  }

  Future<void> _saveAllSkills() async {
    try {
      final file = await _localFile;
      final lines = _skills.map((s) => jsonEncode(s.toJson())).join('\n');
      await file.writeAsString(lines + (lines.isNotEmpty ? '\n' : ''));
    } catch (e) {
      print('Failed to save skills: $e');
    }
  }

  List<String> _extractKeywords(String text) {
    final stopWords = {'to', 'and', 'the', 'a', 'in', 'of', 'for', 'on', 'with', 'at', 'by', 'from', 'go', 'turn', 'open'};
    final words = text.toLowerCase().replaceAll(RegExp(r'[^a-z0-9\s]'), '').split(RegExp(r'\s+'));
    return words.where((w) => w.isNotEmpty && !stopWords.contains(w)).toList();
  }

  double _jaccardSimilarity(List<String> a, List<String> b) {
    if (a.isEmpty || b.isEmpty) return 0.0;
    final setA = a.toSet();
    final setB = b.toSet();
    final intersection = setA.intersection(setB).length;
    final union = setA.union(setB).length;
    return intersection / union;
  }

  Future<SavedSkill?> findSkill(String taskGoal) async {
    await _loadSkills();
    if (_skills.isEmpty) return null;

    final queryKeywords = _extractKeywords(taskGoal);
    SavedSkill? bestMatch;
    double highestSim = 0.0;

    for (final skill in _skills) {
      final sim = _jaccardSimilarity(queryKeywords, skill.taskKeywords);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = skill;
      }
    }

    if (highestSim > 0.6) {
      return bestMatch;
    }
    return null;
  }

  Future<void> saveSkill(String taskGoal, List<ActionStep> steps) async {
    await _loadSkills();
    
    final queryKeywords = _extractKeywords(taskGoal);
    for (final skill in _skills) {
      if (_jaccardSimilarity(queryKeywords, skill.taskKeywords) > 0.8) {
        skill.successCount++;
        skill.lastUsed = DateTime.now();
        if (steps.length < skill.steps.length) {
          skill.steps.clear();
          skill.steps.addAll(steps);
        }
        await _saveAllSkills();
        return;
      }
    }

    final newSkill = SavedSkill(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      task: taskGoal,
      taskKeywords: queryKeywords,
      successCount: 1,
      failCount: 0,
      lastUsed: DateTime.now(),
      steps: steps,
    );
    _skills.add(newSkill);
    await _saveAllSkills();
  }

  Future<void> recordFailure(String skillId) async {
    await _loadSkills();
    final index = _skills.indexWhere((s) => s.id == skillId);
    if (index != -1) {
      _skills[index].failCount++;
      await _saveAllSkills();
    }
  }
}
