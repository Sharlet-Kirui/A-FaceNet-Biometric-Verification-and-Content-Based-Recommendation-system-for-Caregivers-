import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/otp_input.dart';
import '../../widgets/primary_button.dart';
import 'details_screen.dart';

/// Onboarding step 1 of 4: Verify email with a 6-digit code.
class VerifyEmailScreen extends StatefulWidget {
  final String email;

  const VerifyEmailScreen({super.key, required this.email});

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  static const _codeLength = 6;
  static const _resendSeconds = 45;

  final _codeCtrl = TextEditingController();
  Timer? _timer;
  int _remaining = _resendSeconds;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeCtrl.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _remaining = _resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _remaining--);
      if (_remaining <= 0) t.cancel();
    });
  }

  String get _countdown =>
      '00:${_remaining.clamp(0, 99).toString().padLeft(2, '0')}';

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _resend() async {
    try {
      await onboardingService.resendVerificationCode(widget.email);
      if (!mounted) return;
      _codeCtrl.clear();
      setState(() => _error = null);
      _startTimer();
      _showMessage('A new code was sent to ${widget.email}');
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not resend the code. Please try again.');
    }
  }

  Future<void> _verify() async {
    if (_codeCtrl.text.length != _codeLength) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await onboardingService.verifyEmail(
        email: widget.email,
        code: _codeCtrl.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DetailsScreen()),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Invalid or expired code. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            children: [
              const OnboardingAppBar(),
              const SizedBox(height: 8),
              const OnboardingStepper(currentStep: 1, label: 'Verify'),
              const SizedBox(height: 64),
              const Text(
                'Verify Your Email',
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Enter the 6-digit code sent to',
                style: TextStyle(fontSize: 17, color: AppColors.textMuted),
              ),
              const SizedBox(height: 2),
              Text(
                widget.email,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 32),
              OtpInput(
                controller: _codeCtrl,
                length: _codeLength,
                hasError: _error != null,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),
              SizedBox(
                height: 32,
                child: _error == null
                    ? null
                    : Align(
                        alignment: Alignment.bottomLeft,
                        child: Text(
                          _error!,
                          style: const TextStyle(
                              fontSize: 14, color: AppColors.error),
                        ),
                      ),
              ),
              const SizedBox(height: 16),
              _remaining > 0
                  ? Text.rich(
                      TextSpan(
                        text: 'Resend code in ',
                        style: const TextStyle(
                            fontSize: 16, color: AppColors.textMuted),
                        children: [
                          TextSpan(
                            text: _countdown,
                            style: const TextStyle(color: AppColors.textDark),
                          ),
                        ],
                      ),
                    )
                  : TextButton(
                      onPressed: _resend,
                      child: const Text(
                        'Resend code',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
              const SizedBox(height: 24),
              PrimaryButton(
                label: 'Verify & Continue',
                isLoading: _loading,
                onPressed: _verify,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
