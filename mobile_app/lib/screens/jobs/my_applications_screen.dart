import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import '../../widgets/job_widgets.dart';
import 'job_actions.dart';

/// Jobs the caregiver expressed interest in: Active (job still open) and Past.
class MyApplicationsScreen extends StatefulWidget {
  const MyApplicationsScreen({super.key});

  @override
  State<MyApplicationsScreen> createState() => _MyApplicationsScreenState();
}

class _MyApplicationsScreenState extends State<MyApplicationsScreen> {
  List<JobMatch> _items = const [];
  String? _error;
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
      final items = await jobsService.interests();
      if (mounted) setState(() => _items = items);
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not load your applications.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = _items.where((j) => j.isOpen).toList();
    final past = _items.where((j) => !j.isOpen).toList();
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.background,
          centerTitle: true,
          title: const Text('My Applications',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
          bottom: const TabBar(
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.textMuted,
            indicatorColor: AppColors.primary,
            tabs: [Tab(text: 'Active'), Tab(text: 'Past')],
          ),
        ),
        body: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: MessageState(
                      icon: Icons.cloud_off_outlined,
                      title: 'Could not load applications',
                      message: _error!,
                      actionLabel: 'Retry',
                      onAction: _load,
                    ),
                  )
                : TabBarView(
                    children: [
                      _list(active,
                          empty: const MessageState(
                            icon: Icons.assignment_outlined,
                            title: 'No active applications',
                            message: 'Express interest in a matched job and it will appear here.',
                          )),
                      _list(past,
                          empty: const MessageState(
                            icon: Icons.history,
                            title: 'No past applications',
                            message: 'Jobs that are filled or closed move here.',
                          )),
                    ],
                  ),
      ),
    );
  }

  Widget _list(List<JobMatch> jobs, {required Widget empty}) {
    return RefreshIndicator(
      onRefresh: _load,
      child: jobs.isEmpty
          ? ListView(children: [empty])
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              itemCount: jobs.length,
              itemBuilder: (context, i) => _ApplicationCard(job: jobs[i]),
            ),
    );
  }
}

class _ApplicationCard extends StatelessWidget {
  final JobMatch job;
  const _ApplicationCard({required this.job});

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (job.jobStatus) {
      'open' => ('INTEREST SENT', const Color(0xFFFFF3D6), const Color(0xFF8A6100)),
      'filled' => ('POSITION FILLED', const Color(0xFFF1F2F5), AppColors.textMuted),
      _ => ('CLOSED', const Color(0xFFF1F2F5), AppColors.textMuted),
    };
    final d = job.interestedAt;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AppCard(
        onTap: () => openJobDetails(context, job),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(job.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textDark)),
                ),
                const Icon(Icons.chevron_right, color: AppColors.hint),
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
              child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: fg)),
            ),
            const Divider(height: 24),
            Text(
              d == null ? '' : 'Interest sent on ${d.day} ${_months[d.month - 1]} ${d.year}',
              style: const TextStyle(fontSize: 12, color: AppColors.hint),
            ),
          ],
        ),
      ),
    );
  }
}
