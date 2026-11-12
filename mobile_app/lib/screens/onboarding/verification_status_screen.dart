import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/models.dart';
import '../../services/service_locator.dart';
import '../../widgets/primary_button.dart';
import '../auth/login_screen.dart';
import 'details_screen.dart';
import 'kyc_screen.dart';
import 'selfie_screen.dart';

enum _StepState { done, active, failed }

/// Shows the outcome of the caregiver's latest KYC submission:
/// verified (with trust score), under administrator review (with the reasons
/// and how to fix them), not approved, or still processing.
class VerificationStatusScreen extends StatefulWidget {
  /// Result returned by the selfie upload; when null the screen fetches it.
  final VerificationResult? initial;

  const VerificationStatusScreen({super.key, this.initial});

  @override
  State<VerificationStatusScreen> createState() =>
      _VerificationStatusScreenState();
}

class _VerificationStatusScreenState extends State<VerificationStatusScreen> {
  VerificationResult? _result;
  String? _error;
  int? _errorStatus;
  bool _loading = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _result = widget.initial;
    // Fetch after the first frame (setState is not allowed during initState).
    if (_result == null) WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    _schedulePollIfNeeded();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// While the server is still processing, check again every 5 seconds.
  void _schedulePollIfNeeded() {
    _poll?.cancel();
    if (_result?.isInProgress ?? false) {
      _poll = Timer(const Duration(seconds: 5), _refresh);
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
      _errorStatus = null;
    });
    try {
      final result = await onboardingService.checkVerification();
      if (!mounted) return;
      setState(() => _result = result);
      _schedulePollIfNeeded();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = friendlyError(e, 'We could not load your status. Please try again.');
        _errorStatus = e is ApiException ? e.statusCode : null;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  void _fix(FixAction action) {
    switch (action) {
      case FixAction.retakeDocuments:
        _open(KycScreen(idType: onboardingService.idType));
      case FixAction.retakeSelfie:
        _open(const SelfieScreen());
      case FixAction.editDetails:
        _open(const DetailsScreen());
      case FixAction.waitForReview:
        break;
    }
  }

  // ------------------------------------------------------------- content per state
  ({IconData icon, String title, String body}) get _header {
    final r = _result;
    if (r == null) {
      return (
        icon: Icons.policy,
        title: _error == null ? 'Checking Your Status' : 'Status Unavailable',
        body: _error ?? 'One moment while we load your verification status.',
      );
    }
    if (r.isApproved) {
      return (
        icon: Icons.verified_user,
        title: 'Identity Verified',
        body: 'Your professional profile is verified and active.',
      );
    }
    if (r.isRejected) {
      return (
        icon: Icons.gpp_bad_outlined,
        title: 'Application Not Approved',
        body: 'An administrator reviewed your application and could not '
            'approve it. You can submit a new application.',
      );
    }
    if (r.isUnderReview) {
      return (
        icon: Icons.manage_search,
        title: 'Under Review',
        body: 'An administrator will review your application. If something '
            'below can be fixed, fixing it may speed things up.',
      );
    }
    return (
      icon: Icons.policy,
      title: 'Verifying Your Identity',
      body: 'We are checking your documents and selfie. This usually takes '
          'less than a minute.',
    );
  }

  _StepState get _validationState {
    final r = _result;
    if (r == null) return _error != null ? _StepState.failed : _StepState.active;
    if (r.isApproved) return _StepState.done;
    if (r.isUnderReview || r.isRejected) return _StepState.failed;
    return _StepState.active;
  }

  @override
  Widget build(BuildContext context) {
    final header = _header;
    final r = _result;
    final findings = r?.findings ?? const <Finding>[];
    final rejected = r?.isRejected ?? false;
    final hasResult = r != null;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
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
                        child: Icon(header.icon,
                            size: 56, color: AppColors.primaryDark),
                      ),
                      const SizedBox(height: 24),
                      Text(
                        header.title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primaryDark,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        header.body,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 16, height: 1.5, color: AppColors.textMuted),
                      ),
                      if (r?.trustScore100 != null && r!.isApproved) ...[
                        const SizedBox(height: 20),
                        _TrustScoreBadge(score: r.trustScore100!),
                      ],
                      const SizedBox(height: 28),
                      const _TimelineStep(
                        title: 'Documents Uploaded',
                        subtitle: 'ID and supporting documents received.',
                        state: _StepState.done,
                      ),
                      const _TimelineStep(
                        title: 'Head-Turn Check Captured',
                        subtitle: 'Front and head-turn photos received.',
                        state: _StepState.done,
                      ),
                      _TimelineStep(
                        title: switch (_validationState) {
                          _StepState.done => 'Verification Complete',
                          _StepState.failed when hasResult =>
                            rejected ? 'Not Approved' : 'Sent for Review',
                          _StepState.failed => 'Status Unavailable',
                          _ => 'Verification in Progress',
                        },
                        subtitle: switch (_validationState) {
                          _StepState.done => 'Face matched to your ID document.',
                          _StepState.failed when hasResult =>
                            'See the details below.',
                          _StepState.failed => 'Pull down or tap retry.',
                          _ => 'Matching your face to your ID document…',
                        },
                        state: _validationState,
                        isLast: true,
                      ),
                    ],
                  ),
                ),
                if (findings.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  for (final f in findings) _FindingCard(finding: f, onFix: _fix),
                ],
                const SizedBox(height: 20),
                if (r != null && r.isApproved)
                  PrimaryButton(
                    label: 'View Matched Jobs',
                    trailingIcon: Icons.arrow_forward,
                    onPressed: () {
                      // The job feed is built in the recommendation module.
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                          content: Text('Job matches are coming next.')));
                    },
                  )
                else if (r != null && r.isRejected)
                  PrimaryButton(
                    label: 'Start a New Application',
                    leadingIcon: Icons.refresh,
                    onPressed: () =>
                        _fix(FixAction.retakeDocuments),
                  )
                else if (_errorStatus == 401 || _errorStatus == 404)
                  // Retrying cannot help: the session ended, or this account
                  // has no submission yet.
                  PrimaryButton(
                    label: _errorStatus == 401 ? 'Log In Again' : 'Upload Documents',
                    leadingIcon: _errorStatus == 401 ? Icons.login : Icons.upload_file,
                    onPressed: () => _errorStatus == 401
                        ? Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const LoginScreen()),
                            (_) => false)
                        : _fix(FixAction.retakeDocuments),
                  )
                else
                  PrimaryButton(
                    label: _error != null ? 'Retry' : 'Refresh Status',
                    leadingIcon: Icons.refresh,
                    isLoading: _loading,
                    onPressed: _refresh,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TrustScoreBadge extends StatelessWidget {
  final int score;
  const _TrustScoreBadge({required this.score});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified, color: Colors.white),
          const SizedBox(width: 10),
          Text(
            'Trust Score $score/100',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _FindingCard extends StatelessWidget {
  final Finding finding;
  final void Function(FixAction) onFix;

  const _FindingCard({required this.finding, required this.onFix});

  String? get _actionLabel => switch (finding.action) {
        FixAction.retakeDocuments => 'Retake ID photos',
        FixAction.retakeSelfie => 'Retake selfie',
        FixAction.editDetails => 'Check my details',
        FixAction.waitForReview => null,
      };

  @override
  Widget build(BuildContext context) {
    final label = _actionLabel;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7E6),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF0D9A8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline, color: Color(0xFF9A6700)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  finding.message,
                  style: const TextStyle(
                      fontSize: 15, height: 1.4, color: AppColors.textDark),
                ),
              ),
            ],
          ),
          if (label != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => onFix(finding.action),
                child: Text(label),
              ),
            ),
        ],
      ),
    );
  }
}

class _TimelineStep extends StatelessWidget {
  final String title;
  final String subtitle;
  final _StepState state;
  final bool isLast;

  const _TimelineStep({
    required this.title,
    required this.subtitle,
    required this.state,
    this.isLast = false,
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
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}