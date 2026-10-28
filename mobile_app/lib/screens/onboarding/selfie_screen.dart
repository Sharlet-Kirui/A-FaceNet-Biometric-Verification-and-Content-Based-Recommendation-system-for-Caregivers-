import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/primary_button.dart';
import 'verification_status_screen.dart';

/// Onboarding step 4 of 4: guided selfie capture.
///
/// NOTE: the prompts guide the user and pace the capture, but they do not
/// verify liveness on-device. Liveness scoring and face-to-ID matching must
/// run server-side (or via an on-device ML model) on the submitted selfie.
class SelfieScreen extends StatefulWidget {
  const SelfieScreen({super.key});

  @override
  State<SelfieScreen> createState() => _SelfieScreenState();
}

class _SelfieScreenState extends State<SelfieScreen> {
  static const _prompts = [
    ('Look directly at the camera', Icons.face_outlined),
    ('Blink your eyes', Icons.visibility_outlined),
    ('Turn your head slowly', Icons.sync_alt),
  ];
  static const _promptDuration = Duration(seconds: 2);

  CameraController? _camera;
  String? _cameraError;
  XFile? _photo;
  int _step = -1; // -1 idle, 0..2 running a prompt, 3 all prompts done
  bool _capturing = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  @override
  void dispose() {
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _initCamera() async {
    setState(() => _cameraError = null);
    try {
      final cameras = await availableCameras();
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller =
          CameraController(front, ResolutionPreset.medium, enableAudio: false);
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _camera = controller);
    } catch (_) {
      if (!mounted) return;
      setState(() => _cameraError =
          'We need camera access to take your selfie. Allow it in Settings, then retry.');
    }
  }

  Future<void> _capture() async {
    final camera = _camera;
    if (camera == null || _capturing) return;
    setState(() {
      _capturing = true;
      _photo = null;
    });
    try {
      for (var i = 0; i < _prompts.length; i++) {
        setState(() => _step = i);
        await Future.delayed(_promptDuration);
        if (!mounted) return;
      }
      setState(() => _step = _prompts.length);
      final shot = await camera.takePicture();
      if (!mounted) return;
      setState(() => _photo = shot);
    } catch (_) {
      if (!mounted) return;
      setState(() => _step = -1);
      _showMessage('Could not capture your selfie. Please try again.');
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _next() async {
    final photo = _photo;
    if (photo == null) {
      _showMessage('Capture your selfie to continue.');
      return;
    }
    setState(() => _submitting = true);
    try {
      await onboardingService.submitSelfie(photo.path);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const VerificationStatusScreen()),
      );
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not upload your selfie. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String get _statusLabel {
    if (_photo != null) return 'Captured';
    if (_capturing) return 'Hold still';
    return 'Ready';
  }

  Widget _preview() {
    const size = 260.0;
    Widget content;
    if (_photo != null) {
      content = Image.file(File(_photo!.path),
          width: size, height: size, fit: BoxFit.cover);
    } else if (_camera != null && _camera!.value.isInitialized) {
      final preview = _camera!.value.previewSize!;
      content = FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: preview.height,
          height: preview.width,
          child: CameraPreview(_camera!),
        ),
      );
    } else if (_cameraError != null) {
      content = Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Text(
            _cameraError!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
        ),
      );
    } else {
      content = const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        Container(
          width: size + 12,
          height: size + 12,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.primary, width: 4),
          ),
          child: ClipOval(
            child: SizedBox(
                width: size,
                height: size,
                child: ColoredBox(color: AppColors.stepInactive, child: content)),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _photo != null ? Icons.check_circle : Icons.face_outlined,
                size: 20,
                color: _photo != null ? AppColors.success : AppColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                _statusLabel,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _promptRow(int i) {
    final done = _step > i;
    final active = _step == i;
    final (text, icon) = _prompts[i];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done
                  ? const Color(0xFFE3F2E8)
                  : active
                      ? AppColors.stepInactive
                      : const Color(0xFFECF1FB),
            ),
            child: Icon(
              done ? Icons.check : icon,
              size: 22,
              color: done
                  ? AppColors.success
                  : active
                      ? AppColors.primary
                      : AppColors.hint,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 17,
                fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                color: active
                    ? AppColors.textDark
                    : done
                        ? AppColors.textMuted
                        : AppColors.hint,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCapture = _camera != null && !_capturing && !_submitting;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Column(
                  children: [
                    const OnboardingAppBar(),
                    const SizedBox(height: 8),
                    const Text(
                      'Identity Verification',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textDark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Please complete this liveness check to secure your '
                      'professional profile.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const OnboardingStepper(currentStep: 4, label: 'Selfie'),
                    const SizedBox(height: 24),
                    _preview(),
                    const SizedBox(height: 20),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppColors.cardBorder),
                      ),
                      child: Column(
                        children: [
                          const Text(
                            'Follow the prompts below',
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textDark,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (var i = 0; i < _prompts.length; i++)
                            _promptRow(i),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppColors.cardBorder)),
              ),
              child: Column(
                children: [
                  if (_cameraError != null)
                    PrimaryButton(
                      label: 'Retry Camera',
                      leadingIcon: Icons.refresh,
                      onPressed: _initCamera,
                    )
                  else
                    PrimaryButton(
                      label: _photo == null ? 'Capture Selfie' : 'Retake Selfie',
                      leadingIcon: Icons.camera_alt_outlined,
                      color: AppColors.success,
                      isLoading: _capturing,
                      onPressed: canCapture ? _capture : null,
                    ),
                  const SizedBox(height: 10),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.lock_outline,
                          size: 16, color: AppColors.textMuted),
                      SizedBox(width: 6),
                      Text(
                        'Your data is securely encrypted and verified.',
                        style: TextStyle(
                            fontSize: 13, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      SizedBox(
                        height: 52,
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(context).maybePop(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primaryDark,
                            side: const BorderSide(
                                color: AppColors.primaryDark),
                            padding:
                                const EdgeInsets.symmetric(horizontal: 32),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Back',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: PrimaryButton(
                          label: 'Next Step',
                          trailingIcon: Icons.arrow_forward,
                          isLoading: _submitting,
                          onPressed: _next,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
