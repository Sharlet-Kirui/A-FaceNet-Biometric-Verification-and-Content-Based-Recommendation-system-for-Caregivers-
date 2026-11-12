import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../core/privacy_notice.dart';
import '../../widgets/primary_button.dart';

/// Full Privacy Notice. Returns true when the caregiver taps "I have read and agree"
/// (Create Account then ticks its checkbox); opened from elsewhere it is read-only.
class PrivacyNoticeScreen extends StatelessWidget {
  final bool askToAgree;
  const PrivacyNoticeScreen({super.key, this.askToAgree = true});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        title: const Text('Privacy Notice',
            style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  const Text(
                    'Please read how CareMatch collects, uses and protects your personal data before you '
                    'create an account.',
                    style: TextStyle(fontSize: 15, height: 1.45, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 4),
                  const Text('Version $kPrivacyVersion · updated $kPrivacyUpdated',
                      style: TextStyle(fontSize: 12, color: AppColors.hint)),
                  for (final s in kPrivacySections) ...[
                    const SizedBox(height: 20),
                    Text(s.title,
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                    const SizedBox(height: 6),
                    Text(s.body, style: const TextStyle(fontSize: 15, height: 1.5, color: AppColors.textDark)),
                  ],
                ],
              ),
            ),
            if (askToAgree)
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: AppColors.cardBorder)),
                ),
                child: PrimaryButton(
                  label: 'I have read and agree',
                  onPressed: () => Navigator.of(context).pop(true),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
