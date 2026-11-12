import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/job_models.dart';
import '../../widgets/job_widgets.dart';
import '../../widgets/primary_button.dart';
import 'job_actions.dart';

/// Full job: pay, type, description, why it matches, skills held and missing.
class JobDetailsScreen extends StatefulWidget {
  final JobMatch job;
  const JobDetailsScreen({super.key, required this.job});

  @override
  State<JobDetailsScreen> createState() => _JobDetailsScreenState();
}

class _JobDetailsScreenState extends State<JobDetailsScreen> {
  late JobMatch _job = widget.job;
  bool _sending = false;

  static const _categoryIcons = {
    'Elderly Care': Icons.elderly,
    'Child & Newborn Care': Icons.child_friendly,
    'Post-Operative Care': Icons.healing,
    'Chronic Illness Care': Icons.monitor_heart_outlined,
    'Disability Support': Icons.accessible,
    'Palliative Care': Icons.volunteer_activism_outlined,
  };

  Future<void> _interest() async {
    setState(() => _sending = true);
    final updated = await expressInterest(context, _job);
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (updated != null) _job = updated;
    });
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        centerTitle: true,
        title: const Text('Job Details',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // header band (jobs have no photos, so the category icon stands in)
          Container(
            height: 130,
            color: AppColors.stepInactive,
            padding: const EdgeInsets.all(16),
            child: Stack(
              children: [
                Center(
                  child: Icon(_categoryIcons[job.category] ?? Icons.medical_services_outlined,
                      size: 64, color: AppColors.primary),
                ),
                Align(alignment: Alignment.topRight, child: MatchBadge(percent: job.matchPercent)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(job.title,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 18, color: AppColors.primary),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(job.place, style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(10)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.payments_outlined, color: Colors.white, size: 18),
                      const SizedBox(width: 8),
                      Text(job.salaryText,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    SkillChip(job.jobTypeLabel),
                    if (job.category.isNotEmpty) SkillChip(job.category),
                    SkillChip(job.shiftLabel),
                  ],
                ),
                if (job.postedAgo.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(job.postedAgo, style: const TextStyle(fontSize: 12, color: AppColors.hint)),
                ],
                const Divider(height: 32),
                if (job.description.isNotEmpty) ...[
                  const SectionTitle(Icons.description_outlined, 'Job Description'),
                  Text(job.description,
                      style: const TextStyle(fontSize: 14, height: 1.5, color: AppColors.textMuted)),
                  const SizedBox(height: 20),
                ],
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionTitle(Icons.checklist, 'Requirements'),
                      _requirement(
                        job.minExperienceYears > 0
                            ? 'At least ${job.minExperienceYears} year${job.minExperienceYears == 1 ? '' : 's'} of experience'
                            : 'No minimum experience',
                        met: true,
                      ),
                      for (final s in job.heldSkills) _requirement(s, met: true),
                      for (final s in job.missingSkills) _requirement('$s (you have not listed this)', met: false),
                      _requirement('Verified identity (trust score)', met: true),
                    ],
                  ),
                ),
                if (job.reasons.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SectionTitle(Icons.auto_awesome_outlined, 'Why this matches you'),
                        for (final r in job.reasons)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text('• $r',
                                style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.textMuted)),
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: PrimaryButton(
            label: job.isInterested ? job.applicationLabel : 'Express Interest',
            leadingIcon: job.isInterested ? Icons.check : Icons.send_outlined,
            isLoading: _sending,
            color: job.isInterested ? AppColors.success : AppColors.primaryDark,
            onPressed: job.isInterested || !job.isOpen ? null : _interest,
          ),
        ),
      ),
    );
  }

  Widget _requirement(String text, {required bool met}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(met ? Icons.check : Icons.close, size: 18, color: met ? AppColors.success : AppColors.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: TextStyle(fontSize: 14, color: met ? AppColors.textDark : AppColors.textMuted)),
          ),
        ],
      ),
    );
  }
}
