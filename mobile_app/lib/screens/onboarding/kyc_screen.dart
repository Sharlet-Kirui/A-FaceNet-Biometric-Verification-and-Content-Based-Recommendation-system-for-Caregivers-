import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../../widgets/document_upload_slot.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/primary_button.dart';
import 'selfie_screen.dart';

/// Onboarding step 3 of 4: identity and credential document uploads.
class KycScreen extends StatefulWidget {
  /// 'National ID' or 'Passport', chosen on the Details screen.
  final String idType;

  const KycScreen({super.key, required this.idType});

  @override
  State<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends State<KycScreen> {
  final _docs = <String, PickedDocument?>{};
  bool _submitted = false;
  bool _loading = false;

  bool get _isPassport => widget.idType == 'Passport';
  List<String> get _requiredKeys =>
      _isPassport ? ['passport'] : ['idFront', 'idBack'];

  void _set(String key, PickedDocument? doc) => setState(() => _docs[key] = doc);

  String? _error(String key) =>
      _submitted && _requiredKeys.contains(key) && _docs[key] == null
          ? 'This document is required'
          : null;

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _next() async {
    setState(() => _submitted = true);
    if (_requiredKeys.any((k) => _docs[k] == null)) {
      _showMessage('Upload the required documents to continue.');
      return;
    }
    setState(() => _loading = true);
    try {
      await onboardingService.submitKyc({
        for (final e in _docs.entries)
          if (e.value != null) e.key: e.value!.path,
      });
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SelfieScreen()),
      );
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not upload your documents. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _slot(
    String key,
    String label, {
    bool required = false,
    bool optional = false,
    bool large = false,
    String emptyText = 'Add Document',
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: DocumentUploadSlot(
        label: label,
        required: required,
        optional: optional,
        large: large,
        emptyText: emptyText,
        value: _docs[key],
        errorText: _error(key),
        onChanged: (d) => _set(key, d),
      ),
    );
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const OnboardingAppBar(),
                    const SizedBox(height: 8),
                    const Text(
                      'Verify Identity',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textDark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Please upload clear photos of your '
                      '${_isPassport ? 'passport' : 'National ID'} to '
                      'complete your registration.',
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const OnboardingStepper(currentStep: 3, label: 'Identity'),
                    const SizedBox(height: 20),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF4FE),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.stepInactive),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.lock, color: AppColors.primary),
                          SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Secure & Encrypted',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textDark,
                                  ),
                                ),
                                SizedBox(height: 4),
                                Text(
                                  'Your documents are securely encrypted and '
                                  'processed in compliance with the Kenya Data '
                                  'Protection Act.',
                                  style: TextStyle(
                                    fontSize: 15,
                                    height: 1.4,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_isPassport)
                      _slot('passport', 'Passport (Photo Page)',
                          required: true,
                          large: true,
                          emptyText: 'Tap to upload photo page')
                    else ...[
                      _slot('idFront', 'National ID (Front)',
                          required: true,
                          large: true,
                          emptyText: 'Tap to upload front of ID'),
                      _slot('idBack', 'National ID (Back)',
                          required: true,
                          large: true,
                          emptyText: 'Tap to upload back of ID'),
                    ],
                    _slot('goodConduct', 'Certificate of Good Conduct'),
                    _slot('tvetCdacc',
                        'TVET CDACC Certificate/NITA Certification'),
                    _slot('license', 'Professional License'),
                    _slot('cv', 'Curriculum Vitae (CV)', optional: true),
                    _slot('other', 'Other Supporting Document',
                        optional: true),
                    const Text(
                      'JPG, PNG or PDF, up to 5 MB each.',
                      style:
                          TextStyle(fontSize: 13, color: AppColors.textMuted),
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
              child: Row(
                children: [
                  SizedBox(
                    height: 52,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryDark,
                        side: const BorderSide(color: AppColors.primaryDark),
                        padding: const EdgeInsets.symmetric(horizontal: 32),
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
                      isLoading: _loading,
                      onPressed: _next,
                    ),
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
