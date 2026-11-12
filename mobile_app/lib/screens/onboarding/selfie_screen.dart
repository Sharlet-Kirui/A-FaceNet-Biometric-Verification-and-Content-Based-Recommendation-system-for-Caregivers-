import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/models.dart';
import '../../services/service_locator.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/primary_button.dart';
import 'verification_status_screen.dart';

/// Onboarding step 4 of 4: head-turn liveness challenge.
///
/// 1. Start: the server issues a random direction and a single-use nonce.
/// 2. The caregiver looks straight at the camera; the frontal frame is taken.
/// 3. The app shows "Turn your head LEFT/RIGHT"; three frames are taken during the turn.
/// 4. The frames and the nonce are uploaded and the server verifies them.
///
/// Capture is manual for now; automatic capture with on-device face tracking
/// replaces the buttons in the guided-liveness issue. The pass/fail decision
/// is always made on the server.
class SelfieScreen extends StatefulWidget {
  const SelfieScreen({super.key});

  @override
  State<SelfieScreen> createState() => _SelfieScreenState();
}

enum _Phase { idle, centre, turn, submitting }

class _SelfieScreenState extends State<SelfieScreen> {
  CameraController? _camera;
  String? _cameraError;

  _Phase _phase = _Phase.idle;
  LivenessChallenge? _challenge;
  XFile? _centre;
  final List<XFile> _turns = [];
  bool _busy = false;

  Timer? _timer;
  int _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  @override
  void dispose() {
    _timer?.cancel();
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
          CameraController(front, ResolutionPreset.high, enableAudio: false);
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

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  // ------------------------------------------------------------- flow
  Future<void> _start() async {
    setState(() => _busy = true);
    try {
      final challenge = await onboardingService.startLivenessChallenge();
      if (!mounted) return;
      setState(() {
        _challenge = challenge;
        _centre = null;
        _turns.clear();
        _phase = _Phase.centre;
        _secondsLeft = challenge.expiresInSeconds;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    } catch (e) {
      if (!mounted) return;
      _showMessage(friendlyError(e, 'Could not start the check. Please try again.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _tick() {
    if (!mounted) return;
    if (_secondsLeft <= 1 && _phase != _Phase.submitting) {
      _timer?.cancel();
      _reset('Time ran out. Tap Start to try again.');
      return;
    }
    setState(() => _secondsLeft--);
  }

  void _reset(String message) {
    _timer?.cancel();
    setState(() {
      _phase = _Phase.idle;
      _challenge = null;
      _centre = null;
      _turns.clear();
    });
    _showMessage(message);
  }

  Future<void> _captureCentre() async {
    final camera = _camera;
    if (camera == null || _busy) return;
    setState(() => _busy = true);
    try {
      final shot = await camera.takePicture();
      if (!mounted) return;
      setState(() {
        _centre = shot;
        _phase = _Phase.turn;
      });
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not take the photo. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Takes three frames while the caregiver turns slowly, so at least one
  /// catches the head part-way round with both eyes still visible (a full
  /// side profile hides one eye and the face cannot be measured).
  Future<void> _captureTurn() async {
    final camera = _camera;
    if (camera == null || _busy) return;
    setState(() => _busy = true);
    try {
      _turns.clear();
      for (var i = 0; i < 3; i++) {
        if (i > 0) await Future.delayed(const Duration(milliseconds: 250));
        _turns.add(await camera.takePicture());
      }
      if (!mounted) return;
      await _submit();
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not take the photo. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final challenge = _challenge;
    final centre = _centre;
    if (challenge == null || centre == null || _turns.isEmpty) return;
    _timer?.cancel();
    setState(() => _phase = _Phase.submitting);
    try {
      final result = await onboardingService.submitSelfie(
        centrePath: centre.path,
        turnPaths: _turns.map((f) => f.path).toList(),
        nonce: challenge.nonce,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
            builder: (_) => VerificationStatusScreen(initial: result)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      // An expired or used challenge cannot be retried: start a new one.
      if (e.statusCode == 400) {
        _reset(e.message);
      } else {
        setState(() => _phase = _Phase.turn);
        _showMessage(e.message);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _phase = _Phase.turn);
      _showMessage('Could not upload your selfie. Please try again.');
    }
  }

  // ------------------------------------------------------------- UI
  String get _instruction => switch (_phase) {
        _Phase.idle => 'Tap Start to begin the check',
        _Phase.centre => 'Look straight at the camera',
        _Phase.turn => 'Turn your head ${_challenge?.label ?? ''}',
        _Phase.submitting => 'Verifying your identity…',
      };

  Widget _preview() {
    const size = 260.0;
    Widget content;
    if (_phase == _Phase.submitting && _centre != null) {
      content = Image.file(File(_centre!.path),
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

    return Container(
      width: size + 12,
      height: size + 12,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: _phase == _Phase.turn ? AppColors.success : AppColors.primary,
          width: 4,
        ),
      ),
      child: ClipOval(
        child: SizedBox(
          width: size,
          height: size,
          child: ColoredBox(color: AppColors.stepInactive, child: content),
        ),
      ),
    );
  }

  Widget _instructionCard() {
    final turnIcon = _challenge?.direction == 'turn_left'
        ? Icons.arrow_back
        : Icons.arrow_forward;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        children: [
          if (_phase == _Phase.turn)
            Icon(turnIcon, size: 48, color: AppColors.success),
          if (_phase == _Phase.submitting)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: CircularProgressIndicator(),
            ),
          Text(
            _instruction,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: _phase == _Phase.turn ? 24 : 19,
              fontWeight: FontWeight.w800,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            switch (_phase) {
              _Phase.idle =>
                'You will be asked to look straight ahead, then turn your head '
                    'in a direction chosen at random. Use good light.',
              _Phase.centre => 'Keep your face inside the circle, then tap Capture.',
              _Phase.turn =>
                'Tap Capture, then slowly turn your head a little, as if looking '
                    'at the edge of the screen. Keep both eyes visible.',
              _Phase.submitting => 'This can take up to a minute.',
            },
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 15, height: 1.4, color: AppColors.textMuted),
          ),
          if (_phase == _Phase.centre || _phase == _Phase.turn) ...[
            const SizedBox(height: 12),
            _StepDots(centreDone: _centre != null),
            const SizedBox(height: 8),
            Text(
              'Time left: ${_secondsLeft}s',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: _secondsLeft <= 20 ? AppColors.error : AppColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _actionButton() {
    if (_cameraError != null) {
      return PrimaryButton(
        label: 'Retry Camera',
        leadingIcon: Icons.refresh,
        onPressed: _initCamera,
      );
    }
    final ready = _camera != null && !_busy;
    return switch (_phase) {
      _Phase.idle => PrimaryButton(
          label: 'Start',
          leadingIcon: Icons.play_arrow,
          color: AppColors.success,
          isLoading: _busy,
          onPressed: ready ? _start : null,
        ),
      _Phase.centre || _Phase.turn => PrimaryButton(
          label: 'Capture',
          leadingIcon: Icons.camera_alt_outlined,
          color: AppColors.success,
          isLoading: _busy,
          onPressed: ready
              ? (_phase == _Phase.centre ? _captureCentre : _captureTurn)
              : null,
        ),
      _Phase.submitting => const PrimaryButton(
          label: 'Verifying…',
          isLoading: true,
          onPressed: null,
        ),
    };
  }

  @override
  Widget build(BuildContext context) {
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
                      'Complete this quick check so we know it is really you.',
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
                    _instructionCard(),
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
                  _actionButton(),
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
                  if (_phase != _Phase.submitting) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: const Text('Back'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Two dots: front photo, turn photo.
class _StepDots extends StatelessWidget {
  final bool centreDone;
  const _StepDots({required this.centreDone});

  @override
  Widget build(BuildContext context) {
    Widget dot(bool done, String label) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(done ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 18, color: done ? AppColors.success : AppColors.hint),
            const SizedBox(width: 4),
            Text(label,
                style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
          ],
        );
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        dot(centreDone, 'Front photo'),
        const SizedBox(width: 16),
        dot(false, 'Head turn'),
      ],
    );
  }
}