import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import '../../widgets/job_widgets.dart';

/// Updates about verification and applications. Opening it marks them as read.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  NotificationFeed? _feed;
  String? _error;

  static const _icons = {
    'verification_approved': (Icons.verified_user, AppColors.success),
    'verification_review': (Icons.policy_outlined, Color(0xFF8A6100)),
    'verification_rejected': (Icons.cancel_outlined, AppColors.error),
    'applicant_shortlisted': (Icons.star_rounded, AppColors.success),
    'applicant_declined': (Icons.info_outline, AppColors.textMuted),
    'job_filled': (Icons.work_off_outlined, AppColors.textMuted),
    'job_closed': (Icons.work_off_outlined, AppColors.textMuted),
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final feed = await jobsService.notifications();
      if (!mounted) return;
      setState(() => _feed = feed);
      if (feed.unread > 0) await jobsService.markNotificationsRead();
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not load notifications.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final feed = _feed;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        centerTitle: true,
        title: const Text('Notifications',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
      ),
      body: _error != null
          ? Center(child: MessageState(icon: Icons.cloud_off_outlined, title: 'Could not load', message: _error!,
              actionLabel: 'Retry', onAction: _load))
          : feed == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: feed.items.isEmpty
                      ? ListView(children: const [
                          MessageState(icon: Icons.notifications_none, title: 'No notifications yet',
                              message: 'Updates about your verification and applications will appear here.'),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          itemCount: feed.items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 10),
                          itemBuilder: (context, i) {
                            final n = feed.items[i];
                            final (icon, color) = _icons[n.type] ?? (Icons.notifications_none, AppColors.primary);
                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: n.read ? Colors.white : const Color(0xFFF0F5FF),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: n.read ? AppColors.cardBorder : AppColors.stepInactive),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(icon, color: color),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(n.title,
                                            style: TextStyle(
                                                fontSize: 15,
                                                fontWeight: n.read ? FontWeight.w600 : FontWeight.w800,
                                                color: AppColors.textDark)),
                                        if (n.body.isNotEmpty) ...[
                                          const SizedBox(height: 4),
                                          Text(n.body,
                                              style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.textMuted)),
                                        ],
                                        const SizedBox(height: 6),
                                        Text(ago(n.createdAt, prefix: ''),
                                            style: const TextStyle(fontSize: 12, color: AppColors.hint)),
                                      ],
                                    ),
                                  ),
                                  if (!n.read)
                                    Container(
                                      width: 9,
                                      height: 9,
                                      margin: const EdgeInsets.only(top: 6),
                                      decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
