import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import '../../widgets/job_widgets.dart';
import '../onboarding/verification_status_screen.dart';
import 'job_actions.dart';
import 'main_shell.dart';
import 'notifications_screen.dart';

/// Welcome, match summary and the top three matches.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  CaregiverProfile? _profile;
  List<JobMatch> _matches = const [];
  MatchInsights? _insights;
  int _unread = 0;
  ApiException? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    jobsService.changes.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    jobsService.changes.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await jobsService.profile();
      final matches = await jobsService.recommendations(limit: 10);
      MatchInsights? insights;
      try {
        insights = await jobsService.insights();
      } catch (_) {
        // tips are optional; matches still show
      }
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _matches = matches;
        _insights = insights;
      });
      _loadUnread();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } catch (_) {
      if (mounted) setState(() => _error = const ApiException('Could not load your matches.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadUnread() async {
    try {
      final feed = await jobsService.notifications();
      if (mounted) setState(() => _unread = feed.unread);
    } catch (_) {
      // the bell simply shows no count
    }
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
    _loadUnread();
  }

  Future<void> _interest(JobMatch job) async {
    final updated = await expressInterest(context, job);
    if (updated != null && mounted) {
      setState(() => _matches = [for (final m in _matches) m.jobId == job.jobId ? updated : m]);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        title: const Text('Jobs Matched to Your Skills',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: _openNotifications,
            icon: Badge(
              isLabelVisible: _unread > 0,
              label: Text('$_unread'),
              child: const Icon(Icons.notifications_none, color: AppColors.primaryDark),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            if (_loading && _profile == null)
              const Padding(padding: EdgeInsets.all(60), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              _errorState(_error!)
            else ...[
              _welcome(),
              const SizedBox(height: 16),
              _summary(),
              if (_insights != null && !_insights!.isEmpty) ...[
                const SizedBox(height: 16),
                _growth(_insights!),
              ],
              const SizedBox(height: 22),
              Row(
                children: [
                  const Expanded(
                    child: Text('Top Job Matches',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                  ),
                  TextButton(
                    onPressed: () => MainShell.switchTab(context, MainShell.jobs),
                    child: const Text('View all'),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              if (_matches.isEmpty)
                const MessageState(
                  icon: Icons.work_off_outlined,
                  title: 'No matches yet',
                  message: 'No open jobs in your county and shifts match your skills right now. '
                      'Adding skills or availability in your profile widens your matches.',
                )
              else
                for (final job in _matches.take(3))
                  JobCard(
                    job: job,
                    onTap: () => openJobDetails(context, job),
                    onDetails: () => openJobDetails(context, job),
                    onInterest: () => _interest(job),
                  ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _welcome() {
    final p = _profile!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Welcome, ${p.firstName}',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.primaryDark)),
        const SizedBox(height: 4),
        Row(
          children: [
            Icon(p.isVerified ? Icons.check_circle : Icons.info_outline,
                size: 16, color: p.isVerified ? AppColors.success : AppColors.textMuted),
            const SizedBox(width: 6),
            Text(p.isVerified ? 'Your profile is verified' : 'Verification pending',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: p.isVerified ? AppColors.success : AppColors.textMuted)),
          ],
        ),
      ],
    );
  }

  Widget _summary() {
    final best = _matches.isEmpty ? 0 : _matches.first.matchPercent;
    // Cosine compares the caregiver's whole profile with the job, so broad
    // profiles score lower even when they hold most required skills.
    final title = best >= 70
        ? 'Great match potential!'
        : best >= 40
            ? 'Good match potential'
            : 'Few close matches yet';
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Your Match Summary',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    SizedBox(
                      width: 58,
                      height: 58,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          CircularProgressIndicator(
                            value: best / 100,
                            strokeWidth: 5,
                            backgroundColor: AppColors.stepInactive,
                            color: AppColors.primary,
                          ),
                          Text('$best%',
                              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textDark)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title,
                              style: const TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                          const SizedBox(height: 2),
                          Text(
                            _matches.isEmpty
                                ? 'No matching jobs yet.'
                                : 'Your best match out of ${_matches.length} open job${_matches.length == 1 ? '' : 's'} for you.',
                            style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          TextButton(
            onPressed: () => MainShell.switchTab(context, MainShell.profile),
            child: const Text('View Profile'),
          ),
        ],
      ),
    );
  }

  static const _shiftNames = {'morning': 'morning', 'afternoon': 'afternoon', 'night': 'night', 'live_in': 'live-in'};

  /// "Room to grow" made concrete: what would bring more jobs, from GET /recommendations/insights.
  Widget _growth(MatchInsights i) {
    final tips = <(IconData, String)>[
      if (i.skills.isNotEmpty)
        (
          Icons.school_outlined,
          'Skills families near you ask for: ${i.skills.map((s) => '${s.skill} (${s.jobs} job${s.jobs == 1 ? '' : 's'})').join(', ')}. '
              'If you have them, add them to your profile; if not, a short course would open these jobs.',
        ),
      for (final s in i.shifts)
        (
          Icons.schedule,
          '${s.jobs} open job${s.jobs == 1 ? '' : 's'} in your county ${s.jobs == 1 ? 'is a' : 'are'} '
              '${_shiftNames[s.shift] ?? s.shift} shift${s.jobs == 1 ? '' : 's'}. Adding that availability would show them to you.',
        ),
      if (i.needMoreExperience > 0)
        (
          Icons.trending_up,
          '${i.needMoreExperience} job${i.needMoreExperience == 1 ? ' needs' : 's need'} more years of experience than you have. '
              'Make sure all your past caregiving work is listed.',
        ),
    ];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle(Icons.lightbulb_outline, 'Ways to get more matches'),
          for (final (icon, text) in tips)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 20, color: AppColors.primary),
                  const SizedBox(width: 10),
                  Expanded(child: Text(text, style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.textDark))),
                ],
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => MainShell.switchTab(context, MainShell.profile),
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Update my profile'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _errorState(ApiException e) {
    if (e.reason == 'not_verified') {
      return MessageState(
        icon: Icons.verified_user_outlined,
        title: 'Verification needed',
        message: 'Job matches appear once your identity is verified.',
        actionLabel: 'Check verification status',
        onAction: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => const VerificationStatusScreen())),
      );
    }
    return MessageState(
      icon: Icons.cloud_off_outlined,
      title: 'Could not load your matches',
      message: e.message,
      actionLabel: 'Retry',
      onAction: _load,
    );
  }
}
