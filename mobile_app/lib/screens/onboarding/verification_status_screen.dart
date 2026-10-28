import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../../widgets/primary_button.dart';

enum _StepState { done, active, pending, failed }

/// Shown after the selfie is submitted while documents and the face match
/// are validated. Safe to leave: the user is notified when it finishes.
class VerificationStatusScreen extends StatefulWidget {
  const VerificationStatusScreen({super.key});

  @override
  State<VerificationStatusScreen> createState() =>
      _VerificationStatusScreenState();
}

class _VerificationStatusScreenState extends State<VerificationStatusScreen> {
  bool _done = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _validate();
  }

  Future<void> _validate() async {
    setState(() => _failed = false);
    try {
      final ok = await onboardingService.checkVerification();
      if (!mounted) return;
      setState(() => _done = ok);
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final validation = _done
        ? _StepState.done
        : _failed
            ? _StepState.failed
            : _StepState.active;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.cardBorder),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 128,
                      height: 128,
                      decoration: BoxDecoration(
                        color: const Color(0xFFECF1FB),
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: const Color(0xFFE3E6EE), width: 4),
                      ),
                      child: Icon(
                        _done ? Icons.verified_user : Icons.policy,
                        size: 56,
                        color: AppColors.primaryDark,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      _done ? 'Identity Verified' : 'Verifying Your Identity',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primaryDark,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _done
                          ? 'Your professional profile is verified and active.'
                          : 'Our AI is currently analyzing your documents and '
                              'biometric data to ensure a secure environment. '
                              'This usually takes just a few moments.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 28),
                    _TimelineStep(
                      title: 'Document Uploaded',
                      subtitle: 'ID successfully received.',
                      state: _StepState.done,
                    ),
                    _TimelineStep(
                      title: 'Biometric Scan Complete',
                      subtitle: 'Selfie securely captured.',
                      state: _StepState.done,
                    ),
                    _TimelineStep(
                      title: _done
                          ? 'AI Validation Complete'
                          : _failed
                              ? 'Validation Interrupted'
                              : 'AI Validation in Progress',
                      subtitle: _done
                          ? 'Face matched to ID document.'
                          : _failed
                              ? 'We could not finish checking. Tap retry.'
                              : 'Matching face to ID document...',
                      state: validation,
                      isLast: true,
                      trailing: _failed
                          ? TextButton(
                              onPressed: _validate,
                              child: const Text('Retry'),
                            )
                          : null,
                    ),
                    if (!_done) ...[
                      const SizedBox(height: 24),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF4FE),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.info_outline,
                                color: AppColors.primaryDark),
                            SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'You can safely close this screen. We will '
                                'notify you via email and push notification '
                                'once your professional profile is verified '
                                'and active.',
                                style: TextStyle(
                                  fontSize: 16,
                                  height: 1.5,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (_done) ...[
                const SizedBox(height: 20),
                PrimaryButton(
                  label: 'Next Step',
                  trailingIcon: Icons.arrow_forward,
                  onPressed: () {
                    // TODO: navigate to the home dashboard once it exists.
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('Verified (mock). Next: dashboard.')),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TimelineStep extends StatelessWidget {
  final String title;
  final String subtitle;
  final _StepState state;
  final bool isLast;
  final Widget? trailing;

  const _TimelineStep({
    required this.title,
    required this.subtitle,
    required this.state,
    this.isLast = false,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final done = state == _StepState.done;
    final active = state == _StepState.active;
    final failed = state == _StepState.failed;

    final Widget marker = done
        ? Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
                color: AppColors.success, shape: BoxShape.circle),
            child: const Icon(Icons.check, color: Colors.white, size: 20),
          )
        : active
            ? Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.primaryDark, width: 3),
                ),
                child: const Center(
                  child: SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: AppColors.primaryDark),
                  ),
                ),
              )
            : Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: failed ? AppColors.error : AppColors.border,
                    width: 3,
                  ),
                ),
                child: failed
                    ? const Icon(Icons.priority_high,
                        color: AppColors.error, size: 18)
                    : null,
              );

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 36,
            child: Column(
              children: [
                marker,
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 3,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: done ? AppColors.success : AppColors.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      color: active || failed
                          ? (failed ? AppColors.error : AppColors.primaryDark)
                          : AppColors.textDark,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                        fontSize: 16, color: AppColors.textMuted),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
