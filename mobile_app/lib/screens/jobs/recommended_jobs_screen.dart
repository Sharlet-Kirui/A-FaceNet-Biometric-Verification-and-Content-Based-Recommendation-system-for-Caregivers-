import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import '../../widgets/job_widgets.dart';
import 'job_actions.dart';

enum _Sort { best, newest, pay }

/// Trust score, then all matches or saved jobs, sortable.
class RecommendedJobsScreen extends StatefulWidget {
  const RecommendedJobsScreen({super.key});

  @override
  State<RecommendedJobsScreen> createState() => _RecommendedJobsScreenState();
}

class _RecommendedJobsScreenState extends State<RecommendedJobsScreen> {
  CaregiverProfile? _profile;
  List<JobMatch> _matches = const [];
  List<JobMatch> _saved = const [];
  String? _error;
  bool _loading = true;
  _Sort _sort = _Sort.best;

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
      final results = await Future.wait([
        jobsService.profile(),
        jobsService.recommendations(limit: 30),
        jobsService.savedJobs(),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as CaregiverProfile;
        _matches = results[1] as List<JobMatch>;
        _saved = results[2] as List<JobMatch>;
      });
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not load your matches.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<JobMatch> _sorted(List<JobMatch> jobs) {
    final list = [...jobs];
    switch (_sort) {
      case _Sort.best:
        list.sort((a, b) => b.matchPercent.compareTo(a.matchPercent));
      case _Sort.newest:
        list.sort((a, b) => (b.postedAt ?? DateTime(2000)).compareTo(a.postedAt ?? DateTime(2000)));
      case _Sort.pay:
        list.sort((a, b) => (b.salaryMaxKes ?? b.salaryMinKes ?? 0).compareTo(a.salaryMaxKes ?? a.salaryMinKes ?? 0));
    }
    return list;
  }

  bool _isSaved(JobMatch job) => _saved.any((s) => s.jobId == job.jobId);

  Future<void> _toggleSave(JobMatch job) async {
    final nowSaved = await jobsService.toggleSaved(job);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(nowSaved ? 'Saved' : 'Removed from saved'), duration: const Duration(seconds: 1)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.background,
          centerTitle: true,
          title: const Text('Recommended Jobs',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
        ),
        body: _loading && _profile == null
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: MessageState(
                      icon: Icons.cloud_off_outlined,
                      title: 'Could not load jobs',
                      message: _error!,
                      actionLabel: 'Retry',
                      onAction: _load,
                    ),
                  )
                : NestedScrollView(
                    headerSliverBuilder: (context, _) => [
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                          child: TrustScoreCard(
                            score: _profile?.trustScore100,
                            verified: _profile?.isVerified ?? false,
                          ),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Row(
                            children: [
                              const Expanded(
                                child: TabBar(
                                  isScrollable: true,
                                  tabAlignment: TabAlignment.start,
                                  labelColor: AppColors.primary,
                                  unselectedLabelColor: AppColors.textMuted,
                                  indicatorColor: AppColors.primary,
                                  tabs: [Tab(text: 'All Matches'), Tab(text: 'Saved')],
                                ),
                              ),
                              PopupMenuButton<_Sort>(
                                initialValue: _sort,
                                onSelected: (s) => setState(() => _sort = s),
                                itemBuilder: (_) => const [
                                  PopupMenuItem(value: _Sort.best, child: Text('Best match')),
                                  PopupMenuItem(value: _Sort.newest, child: Text('Newest')),
                                  PopupMenuItem(value: _Sort.pay, child: Text('Highest pay')),
                                ],
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Sorted by: ${const {_Sort.best: 'Best Match', _Sort.newest: 'Newest', _Sort.pay: 'Highest Pay'}[_sort]}',
                                      style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                                    ),
                                    const Icon(Icons.expand_more, size: 18, color: AppColors.textMuted),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    body: TabBarView(
                      children: [
                        _list(_sorted(_matches),
                            empty: const MessageState(
                              icon: Icons.work_off_outlined,
                              title: 'No matches yet',
                              message: 'No open jobs in your county and shifts match your skills right now.',
                            )),
                        _list(_sorted(_saved),
                            empty: const MessageState(
                              icon: Icons.bookmark_border,
                              title: 'No saved jobs',
                              message: 'Tap the bookmark on a job to keep it here.',
                            )),
                      ],
                    ),
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
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              itemCount: jobs.length,
              itemBuilder: (context, i) {
                final job = jobs[i];
                return JobCard(
                  job: job,
                  saved: _isSaved(job),
                  onTap: () => openJobDetails(context, job),
                  onToggleSave: () => _toggleSave(job),
                );
              },
            ),
    );
  }
}
