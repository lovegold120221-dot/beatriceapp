import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:image/image.dart' as img;
import 'package:onnxruntime/onnxruntime.dart';
import 'dart:async';
import 'dart:developer' as developer;

/// On-device YOLO26 object detection via ONNX Runtime.
///
/// Runs YOLO26n (320x320) on screenshots to identify screen elements —
/// persons, phones, laptops, remotes, and other COCO classes. This augments
/// the accessibility tree with visual context for apps that draw with Canvas
/// or images instead of native UI nodes (games, image-heavy apps, video
/// thumbnails).
///
/// Output: a text description listing detected objects with bounding boxes
/// and center tap-coordinates, formatted for the LLM agent.
class VisionService {
  static final VisionService _instance = VisionService._();
  factory VisionService() => _instance;
  VisionService._();

  OrtSession? _session;
  List<String> _labels = [];
  bool _isLoading = false;
  bool _loaded = false;

  /// Input image size the YOLO26n model was exported with.
  static const int _inputSize = 320;

  /// Confidence threshold — only report detections above this.
  static const double _confThreshold = 0.45;

  /// Non-maximum suppression IoU threshold.
  static const double _iouThreshold = 0.5;

  /// Load the ONNX model and labels from bundled assets. Call once at startup
  /// or lazily on first use. Safe to call multiple times.
  Future<void> load() async {
    if (_loaded || _isLoading) return;
    _isLoading = true;
    try {
      // Copy the ONNX model from assets to a temp file (ONNX Runtime needs a
      // file path, not bytes, on Android).
      final modelBytes =
          await rootBundle.load('assets/yolo26n.onnx');
      final tmpDir = Directory.systemTemp;
      final modelFile = File('${tmpDir.path}/yolo26n.onnx');
      await modelFile.writeAsBytes(modelBytes.buffer.asUint8List(), flush: true);

      // Load COCO labels.
      final labelsStr =
          await rootBundle.loadString('assets/coco_labels.txt');
      _labels = labelsStr.split('\n').where((l) => l.trim().isNotEmpty).toList();

      // Create ONNX session.
      final options = OrtSessionOptions()
        ..setIntraOpNumThreads(2)
        ..setInterOpNumThreads(1);
      _session = OrtSession.fromFile(modelFile, options);
      _loaded = true;
      developer.log('VisionService loaded: ${_labels.length} labels, '
          'inputs=${_session!.inputNames}, outputs=${_session!.outputNames}',
          name: 'BeatriceOS');
    } catch (e) {
      developer.log('VisionService load failed: $e', name: 'BeatriceOS');
    } finally {
      _isLoading = false;
    }
  }

  /// Run YOLO26 detection on the given PNG screenshot bytes. Returns a text
  /// description of detected objects with bounding boxes and tap coordinates.
  /// Returns empty string if the model isn't loaded or no objects detected.
  Future<String> detectObjects(Uint8List pngBytes) async {
    if (!_loaded) await load();
    if (_session == null) return '';

    try {
      // Decode the PNG and preprocess to 320x320 float32 NCHW.
      final decoded = img.decodeImage(pngBytes);
      if (decoded == null) return '';

      final originalW = decoded.width;
      final originalH = decoded.height;
      final resized = img.copyResize(decoded, width: _inputSize, height: _inputSize);

      // Convert to NCHW float32 [1, 3, 320, 320], normalized 0-1.
      final input = Float32List(1 * 3 * _inputSize * _inputSize);
      int offset = 0;
      for (int c = 0; c < 3; c++) {
        for (int y = 0; y < _inputSize; y++) {
          for (int x = 0; x < _inputSize; x++) {
            final pixel = resized.getPixel(x, y);
            // RGB channels: r=0, g=1, b=2
            final value = c == 0
                ? pixel.r
                : c == 1
                    ? pixel.g
                    : pixel.b;
            input[offset++] = value / 255.0;
          }
        }
      }

      // Create input tensor.
      final inputTensor = OrtValueTensor.createTensorWithDataList(
        input,
        [1, 3, _inputSize, _inputSize],
      );

      final inputName = _session!.inputNames.first;
      final outputs = _session!.run(
        OrtRunOptions(),
        {inputName: inputTensor},
        _session!.outputNames,
      );

      if (outputs.isEmpty) return '';

      // YOLO output shape: [1, num_detections, 6] or [1, 6, num_detections]
      // where 6 = [x1, y1, x2, y2, conf, class_id] (NMS-free YOLO26 format)
      final output = outputs.first as OrtValueTensor;
      final outputData = output.value;
      if (outputData is! Float32List) return '';

      // Parse detections — YOLO26 NMS-free output: [1, N, 6]
      // Each row: [cx, cy, w, h, conf, class_id] or [x1, y1, x2, y2, conf, cls]
      final detections = <Detection>[];
      final numDetections = outputData.length ~/ 6;
      for (int i = 0; i < numDetections; i++) {
        final base = i * 6;
        final conf = outputData[base + 4];
        if (conf < _confThreshold) continue;

        final classId = outputData[base + 5].toInt();
        final label = classId < _labels.length ? _labels[classId] : 'unknown';

        // Coordinates are in 320x320 space — scale back to original image.
        final x1 = (outputData[base] / _inputSize) * originalW;
        final y1 = (outputData[base + 1] / _inputSize) * originalH;
        final x2 = (outputData[base + 2] / _inputSize) * originalW;
        final y2 = (outputData[base + 3] / _inputSize) * originalH;

        detections.add(Detection(
          label: label,
          x1: x1.round(),
          y1: y1.round(),
          x2: x2.round(),
          y2: y2.round(),
          confidence: conf,
        ));
      }

      // Apply NMS (YOLO26 is NMS-free but we dedupe overlapping boxes just in case).
      final filtered = _nms(detections);

      if (filtered.isEmpty) return '';

      final buffer = StringBuffer();
      buffer.writeln('VISION (YOLO26 detected ${filtered.length} objects):');
      for (var i = 0; i < filtered.length; i++) {
        final d = filtered[i];
        final cx = ((d.x1 + d.x2) / 2).round();
        final cy = ((d.y1 + d.y2) / 2).round();
        buffer.writeln(
          '  [$i] [${d.label}] bounds:[${d.x1},${d.y1},${d.x2},${d.y2}] '
          'center:($cx,$cy) conf:${d.confidence.toStringAsFixed(2)}',
        );
      }
      buffer.writeln(
        'Note: Objects detected via YOLO26 vision. Use click_at with center '
        'coordinates to interact with them.',
      );
      return buffer.toString();
    } catch (e) {
      developer.log('VisionService detection failed: $e', name: 'BeatriceOS');
      return '';
    }
  }

  /// Non-maximum suppression — remove overlapping detections of the same class.
  List<Detection> _nms(List<Detection> detections) {
    detections.sort((a, b) => b.confidence.compareTo(a.confidence));
    final kept = <Detection>[];
    final suppressed = List<bool>.filled(detections.length, false);

    for (int i = 0; i < detections.length; i++) {
      if (suppressed[i]) continue;
      kept.add(detections[i]);
      for (int j = i + 1; j < detections.length; j++) {
        if (suppressed[j]) continue;
        if (detections[j].label != detections[i].label) continue;
        final iou = _iou(detections[i], detections[j]);
        if (iou > _iouThreshold) {
          suppressed[j] = true;
        }
      }
    }
    return kept;
  }

  double _iou(Detection a, Detection b) {
    final x1 = a.x1 > b.x1 ? a.x1 : b.x1;
    final y1 = a.y1 > b.y1 ? a.y1 : b.y1;
    final x2 = a.x2 < b.x2 ? a.x2 : b.x2;
    final y2 = a.y2 < b.y2 ? a.y2 : b.y2;
    if (x2 <= x1 || y2 <= y1) return 0;
    final inter = (x2 - x1) * (y2 - y1);
    final areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    final areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return inter / (areaA + areaB - inter);
  }

  void dispose() {
    _session?.release();
    _session = null;
    _loaded = false;
  }
}

/// A single YOLO detection with bounding box and confidence.
class Detection {
  final String label;
  final int x1, y1, x2, y2;
  final double confidence;

  Detection({
    required this.label,
    required this.x1,
    required this.y1,
    required this.x2,
    required this.y2,
    required this.confidence,
  });
}