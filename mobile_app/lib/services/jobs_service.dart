import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'job_models.dart';

/// Job matching: recommendations, interest, saved jobs and the caregiver profile.
abstract class JobsService {
  /// Ranked matches. Throws ApiException with reason `not_verified` (403)
  /// until the caregiver is verified.
  Future<List<JobMatch>> recommendations({int limit = 20});

  Future<JobMatch> expressInterest(String jobId);

  Future<List<JobMatch>> interests();

  Future<CaregiverProfile> profile();

  /// Saved (bookmarked) jobs are kept on this device only.
  Future<List<JobMatch>> savedJobs();
  Future<bool> toggleSaved(JobMatch job);

  Future<NotificationFeed> notifications();
  Future<void> markNotificationsRead();

  /// Ways to get more matches ("Room to grow").
  Future<MatchInsights> insights();

  /// Bumped whenever interest or saved jobs change, so open tabs reload.
  final ValueNotifier<int> changes = ValueNotifier(0);
}

class ApiJobsService extends JobsService {
  ApiJobsService(this._api);

  final ApiClient _api;
  static const _savedKey = 'saved_jobs';

  @override
  Future<List<JobMatch>> recommendations({int limit = 20}) async {
    final body = await _api.get('/recommendations?limit=$limit');
    return [
      for (final m in (body['matches'] as List? ?? const []))
        JobMatch.fromJson(m as Map<String, dynamic>),
    ];
  }

  @override
  Future<JobMatch> expressInterest(String jobId) async {
    final body = await _api.post('/recommendations/$jobId/interest');
    changes.value++;
    return JobMatch.fromJson(body);
  }

  @override
  Future<List<JobMatch>> interests() async {
    final body = await _api.get('/recommendations/interests');
    return [
      for (final m in (body['interests'] as List? ?? const []))
        JobMatch.fromJson(m as Map<String, dynamic>),
    ];
  }

  @override
  Future<CaregiverProfile> profile() async {
    final me = await _api.get('/caregivers/me');
    Map<String, dynamic>? kyc;
    try {
      kyc = await _api.get('/kyc/submissions/latest');
    } on ApiException catch (e) {
      if (e.statusCode != 404) rethrow; // 404 = no submission yet
    }
    return CaregiverProfile.fromJson(me, kyc);
  }

  @override
  Future<NotificationFeed> notifications() async {
    final body = await _api.get('/notifications');
    return NotificationFeed(
      (body['unread'] as num?)?.toInt() ?? 0,
      [for (final n in (body['notifications'] as List? ?? const [])) AppNotification.fromJson(n as Map<String, dynamic>)],
    );
  }

  @override
  Future<void> markNotificationsRead() async {
    await _api.post('/notifications/read', {});
  }

  @override
  Future<MatchInsights> insights() async => MatchInsights.fromJson(await _api.get('/recommendations/insights'));

  Future<Map<String, Map<String, dynamic>>> _readSaved() async {
    final raw = await _api.read(_savedKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return decoded.map((k, v) => MapEntry(k, v as Map<String, dynamic>));
    } catch (_) {
      return {};
    }
  }

  @override
  Future<List<JobMatch>> savedJobs() async =>
      (await _readSaved()).values.map(JobMatch.fromJson).toList();

  @override
  Future<bool> toggleSaved(JobMatch job) async {
    final saved = await _readSaved();
    final nowSaved = !saved.containsKey(job.jobId);
    if (nowSaved) {
      saved[job.jobId] = job.toJson();
    } else {
      saved.remove(job.jobId);
    }
    await _api.write(_savedKey, jsonEncode(saved));
    changes.value++;
    return nowSaved;
  }
}

/// Offline stand-in (flutter run --dart-define=USE_MOCK=true).
class MockJobsService extends JobsService {
  final _saved = <String, JobMatch>{};
  final _interested = <String>{};

  static final _jobs = [
    JobMatch(
      jobId: 'mock-1',
      title: 'Elderly Caregiver - Dementia Care',
      description: 'Looking for an experienced caregiver to support an elderly client with dementia.',
      category: 'Elderly Care',
      county: 'Nairobi',
      locationDetail: 'Karen',
      jobType: 'live_in',
      shift: 'live_in',
      minExperienceYears: 2,
      salaryMinKes: 40000,
      salaryMaxKes: 45000,
      postedAt: DateTime.now().subtract(const Duration(days: 2)),
      matchPercent: 95,
      heldSkills: const ["Dementia & Alzheimer's Care", 'CPR & First Aid', 'Kiswahili'],
      missingSkills: const ['Medication Administration'],
      reasons: const ['You have 3 of 4 required skills', 'Located in Nairobi, your county'],
    ),
    JobMatch(
      jobId: 'mock-2',
      title: 'Newborn Care Specialist',
      description: 'Support a family with a newborn during day shifts.',
      category: 'Child & Newborn Care',
      county: 'Nairobi',
      locationDetail: 'Lavington',
      jobType: 'full_time',
      shift: 'morning',
      minExperienceYears: 1,
      salaryMinKes: 30000,
      salaryMaxKes: 35000,
      postedAt: DateTime.now().subtract(const Duration(days: 3)),
      matchPercent: 91,
      heldSkills: const ['Child & Newborn Care', 'English'],
      reasons: const ['You have 2 of 2 required skills'],
    ),
  ];

  @override
  Future<List<JobMatch>> recommendations({int limit = 20}) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return [for (final j in _jobs) _interested.contains(j.jobId) ? j.withStatus('interested') : j];
  }

  @override
  Future<JobMatch> expressInterest(String jobId) async {
    await Future.delayed(const Duration(milliseconds: 400));
    _interested.add(jobId);
    changes.value++;
    return _jobs.firstWhere((j) => j.jobId == jobId).withStatus('interested');
  }

  @override
  Future<List<JobMatch>> interests() async =>
      [for (final j in _jobs) if (_interested.contains(j.jobId)) j.withStatus('interested')];

  @override
  Future<CaregiverProfile> profile() async => const CaregiverProfile(
        firstName: 'Grace',
        lastName: 'Wanjiku',
        email: 'grace@example.com',
        phone: '+254712345678',
        county: 'Nairobi',
        town: 'Kilimani',
        experienceYears: 5,
        onboardingStatus: 'verified',
        trustScore: 0.92,
        isVerified: true,
        skills: [ProfileSkill("Dementia & Alzheimer's Care", 'specialization')],
        documents: ['id_front', 'id_back', 'good_conduct'],
        documentsApproved: true,
      );

  @override
  Future<List<JobMatch>> savedJobs() async => _saved.values.toList();

  @override
  Future<NotificationFeed> notifications() async => NotificationFeed(1, [
        AppNotification(id: 'n1', type: 'verification_approved', title: 'You are verified',
            body: 'Your job matches are ready on the Home screen.', createdAt: DateTime.now()),
      ]);

  @override
  Future<void> markNotificationsRead() async {}

  @override
  Future<MatchInsights> insights() async => const MatchInsights(
        openJobsInCounty: 17,
        skills: [(skill: 'Medication Administration', jobs: 6), (skill: 'Wound Dressing', jobs: 4)],
        shifts: [(shift: 'night', jobs: 5)],
        needMoreExperience: 2,
      );

  @override
  Future<bool> toggleSaved(JobMatch job) async {
    final nowSaved = _saved.remove(job.jobId) == null;
    if (nowSaved) _saved[job.jobId] = job;
    changes.value++;
    return nowSaved;
  }
}
