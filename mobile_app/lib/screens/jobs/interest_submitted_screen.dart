import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/job_models.dart';
import '../../widgets/job_widgets.dart';
import '../../widgets/primary_button.dart';
import 'main_shell.dart';

/// Confirmation after expressing interest, with what happens next.
class InterestSubmittedScreen extends StatelessWidget {
  final JobMatch job;
  const InterestSubmittedScreen({super.key, required this.job});

  void _goTo(BuildContext context, int tab) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => MainShell(initialTab: tab)),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        centerTitle: true,
        title: const Text('Express Interest', style: TextStyle(fontSize: 17, color: AppColors.textDark)),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          child: Column(
            children: [
              Container(
                width: 104,
                height: 104,
                decoration: const BoxDecoration(color: AppColors.stepInactive, shape: BoxShape.circle),
                child: const Stack(
                  alignment: Alignment.center,
                  children: [
                    Icon(Icons.description, size: 52, color: AppColors.primary),
                    Positioned(
                      right: 14,
                      bottom: 14,
                      child: CircleAvatar(
                        radius: 14,
                        backgroundColor: AppColors.success,
                        child: Icon(Icons.check, size: 18, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              const Text('Interest Submitted!',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
              const SizedBox(height: 6),
              Text('Your interest in "${job.title}" has been recorded.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
              const SizedBox(height: 24),
              const AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('NEXT STEPS',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
                    SizedBox(height: 12),
                    _Step(Icons.person_search_outlined, 'The family or agency will review your profile'),
                    _Step(Icons.notifications_none, 'They will contact you if you are shortlisted'),
                    _Step(Icons.assignment_turned_in_outlined, 'Track all your applications in one place'),
                  ],
                ),
              ),
              const Spacer(),
              PrimaryButton(
                label: 'View My Applications',
                onPressed: () => _goTo(context, MainShell.applications),
              ),
              TextButton(
                onPressed: () => _goTo(context, MainShell.home),
                child: const Text('Back to Home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Step(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.success),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14, color: AppColors.textDark))),
        ],
      ),
    );
  }
}
