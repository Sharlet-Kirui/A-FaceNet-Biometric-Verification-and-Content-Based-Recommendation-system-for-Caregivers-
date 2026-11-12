import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../services/job_models.dart';

/// Green pill: "95% Match".
class MatchBadge extends StatelessWidget {
  final int percent;
  const MatchBadge({super.key, required this.percent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFE3F4E8),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$percent% Match',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.success),
      ),
    );
  }
}

/// Light chip for a skill or a job attribute. [missing] shows it greyed with a strike.
class SkillChip extends StatelessWidget {
  final String label;
  final bool missing;
  final bool green;
  const SkillChip(this.label, {super.key, this.missing = false, this.green = false});

  @override
  Widget build(BuildContext context) {
    final bg = green
        ? const Color(0xFFE3F4E8)
        : missing
            ? const Color(0xFFF1F2F5)
            : AppColors.stepInactive;
    final fg = green
        ? AppColors.success
        : missing
            ? AppColors.textMuted
            : AppColors.primaryDark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: fg,
          decoration: missing ? TextDecoration.lineThrough : null,
        ),
      ),
    );
  }
}

/// Blue card with the trust score out of 100 and the verified pill.
class TrustScoreCard extends StatelessWidget {
  final int? score;
  final bool verified;
  const TrustScoreCard({super.key, required this.score, required this.verified});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Text('Trust Score', style: TextStyle(color: Colors.white, fontSize: 15)),
                    SizedBox(width: 6),
                    Icon(Icons.info_outline, color: Colors.white70, size: 16),
                  ],
                ),
                const SizedBox(height: 6),
                Text.rich(
                  TextSpan(
                    text: score?.toString() ?? '--',
                    style: const TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800),
                    children: const [
                      TextSpan(text: ' /100', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w400)),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: verified ? const Color(0xFFE3F4E8) : const Color(0xFFFFF3D6),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(verified ? Icons.check_circle : Icons.hourglass_top,
                          size: 14, color: verified ? AppColors.success : const Color(0xFF8A6100)),
                      const SizedBox(width: 4),
                      Text(
                        verified ? 'Verified Caregiver' : 'Not verified',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: verified ? AppColors.success : const Color(0xFF8A6100),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.shield_outlined, color: Colors.white38, size: 64),
        ],
      ),
    );
  }
}

/// White rounded card used by every list.
class AppCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  const AppCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// A job in a list. With [onDetails] and [onInterest] it shows the two buttons
/// (Home); with [onToggleSave] it shows the bookmark (Recommended Jobs).
class JobCard extends StatelessWidget {
  final JobMatch job;
  final VoidCallback onTap;
  final VoidCallback? onDetails;
  final VoidCallback? onInterest;
  final VoidCallback? onToggleSave;
  final bool saved;

  const JobCard({
    super.key,
    required this.job,
    required this.onTap,
    this.onDetails,
    this.onInterest,
    this.onToggleSave,
    this.saved = false,
  });

  @override
  Widget build(BuildContext context) {
    final chips = [...job.heldSkills.take(3)];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AppCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(job.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                ),
                const SizedBox(width: 8),
                MatchBadge(percent: job.matchPercent),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.location_on_outlined, size: 15, color: AppColors.textMuted),
                const SizedBox(width: 2),
                Expanded(
                  child: Text(job.place, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [for (final c in chips) SkillChip(c)]),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(job.salaryText,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary)),
                ),
                if (job.isInterested)
                  SkillChip(job.applicationLabel, green: !job.isDeclined, missing: job.isDeclined)
                else if (onToggleSave != null)
                  IconButton(
                    onPressed: onToggleSave,
                    tooltip: saved ? 'Remove from saved' : 'Save job',
                    icon: Icon(saved ? Icons.bookmark : Icons.bookmark_border, color: AppColors.textDark),
                  ),
              ],
            ),
            if (job.postedAgo.isNotEmpty)
              Text(job.postedAgo, style: const TextStyle(fontSize: 12, color: AppColors.hint)),
            if (onDetails != null || onInterest != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (onDetails != null)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onDetails,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: const Text('View Details'),
                      ),
                    ),
                  if (onDetails != null && onInterest != null) const SizedBox(width: 10),
                  if (onInterest != null)
                    Expanded(
                      child: FilledButton(
                        onPressed: job.isInterested ? null : onInterest,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: Text(job.isInterested ? job.applicationLabel : 'Express Interest'),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Centred message with an optional action, for empty lists and errors.
class MessageState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const MessageState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: AppColors.primary),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textDark)),
          const SizedBox(height: 6),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.textMuted)),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

/// Section title with an icon, as in the mockups ("Job Description", "Requirements").
class SectionTitle extends StatelessWidget {
  final IconData icon;
  final String text;
  const SectionTitle(this.icon, this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primaryDark),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textDark)),
        ],
      ),
    );
  }
}
