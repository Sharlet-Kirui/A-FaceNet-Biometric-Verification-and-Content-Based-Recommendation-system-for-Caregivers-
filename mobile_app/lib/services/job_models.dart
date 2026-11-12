// Models for the job-matching screens (GET /recommendations, /interests, /caregivers/me).

double? _toDouble(Object? v) =>
    v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

int? _toInt(Object? v) => v == null ? null : (v is num ? v.toInt() : int.tryParse(v.toString()));

List<String> _toStrings(Object? v) =>
    v is List ? v.map((e) => e.toString()).toList() : const [];

DateTime? _toDate(Object? v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

class JobMatch {
  final String jobId;
  final String title;
  final String description;
  final String category;
  final String county;
  final String? locationDetail;
  final String jobType;
  final String shift;
  final int minExperienceYears;
  final int? salaryMinKes;
  final int? salaryMaxKes;
  final DateTime? postedAt;
  final int matchPercent;
  final List<String> heldSkills;
  final List<String> missingSkills;
  final List<String> reasons;

  /// suggested | viewed | interested | dismissed
  final String status;

  /// open | filled | closed (only sent for interests)
  final String jobStatus;
  final DateTime? interestedAt;

  const JobMatch({
    required this.jobId,
    required this.title,
    required this.description,
    required this.category,
    required this.county,
    this.locationDetail,
    required this.jobType,
    required this.shift,
    required this.minExperienceYears,
    this.salaryMinKes,
    this.salaryMaxKes,
    this.postedAt,
    required this.matchPercent,
    this.heldSkills = const [],
    this.missingSkills = const [],
    this.reasons = const [],
    this.status = 'suggested',
    this.jobStatus = 'open',
    this.interestedAt,
  });

  factory JobMatch.fromJson(Map<String, dynamic> j) => JobMatch(
        jobId: j['jobId'] as String,
        title: (j['title'] as String?) ?? 'Caregiver role',
        description: (j['description'] as String?) ?? '',
        category: (j['category'] as String?) ?? '',
        county: (j['county'] as String?) ?? '',
        locationDetail: j['locationDetail'] as String?,
        jobType: (j['jobType'] as String?) ?? 'full_time',
        shift: (j['shift'] as String?) ?? 'morning',
        minExperienceYears: _toInt(j['minExperienceYears']) ?? 0,
        salaryMinKes: _toInt(j['salaryMinKes']),
        salaryMaxKes: _toInt(j['salaryMaxKes']),
        postedAt: _toDate(j['postedAt']),
        matchPercent: _toInt(j['matchPercent']) ?? 0,
        heldSkills: _toStrings(j['heldSkills']),
        missingSkills: _toStrings(j['missingSkills']),
        reasons: _toStrings(j['reasons']),
        status: (j['status'] as String?) ?? 'suggested',
        jobStatus: (j['jobStatus'] as String?) ?? 'open',
        interestedAt: _toDate(j['interestedAt']),
      );

  /// Kept on the device for the Saved tab.
  Map<String, dynamic> toJson() => {
        'jobId': jobId,
        'title': title,
        'description': description,
        'category': category,
        'county': county,
        'locationDetail': locationDetail,
        'jobType': jobType,
        'shift': shift,
        'minExperienceYears': minExperienceYears,
        'salaryMinKes': salaryMinKes,
        'salaryMaxKes': salaryMaxKes,
        'postedAt': postedAt?.toIso8601String(),
        'matchPercent': matchPercent,
        'heldSkills': heldSkills,
        'missingSkills': missingSkills,
        'reasons': reasons,
        'status': status,
      };

  JobMatch withStatus(String newStatus) => JobMatch.fromJson({...toJson(), 'status': newStatus});

  bool get isInterested => status == 'interested';
  bool get isOpen => jobStatus == 'open';

  String get place => [if (locationDetail != null && locationDetail!.isNotEmpty) locationDetail!, county]
      .join(', ');

  String get salaryText {
    if (salaryMinKes == null && salaryMaxKes == null) return 'Salary not stated';
    if (salaryMaxKes == null || salaryMaxKes == salaryMinKes) return 'KES ${money(salaryMinKes!)} / month';
    if (salaryMinKes == null) return 'Up to KES ${money(salaryMaxKes!)} / month';
    return 'KES ${money(salaryMinKes!)} - ${money(salaryMaxKes!)} / month';
  }

  String get jobTypeLabel => const {
        'full_time': 'Full-time',
        'part_time': 'Part-time',
        'live_in': 'Live-in',
        'temporary': 'Temporary',
      }[jobType] ??
      jobType;

  String get shiftLabel => const {
        'morning': 'Morning shift',
        'afternoon': 'Afternoon shift',
        'night': 'Night shift',
        'live_in': 'Live-in',
      }[shift] ??
      shift;

  String get postedAgo => ago(postedAt, prefix: 'Posted');
}

/// 25000 -> "25,000"
String money(int n) {
  final s = n.toString();
  final out = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) out.write(',');
    out.write(s[i]);
  }
  return out.toString();
}

String ago(DateTime? t, {required String prefix}) {
  if (t == null) return '';
  final d = DateTime.now().difference(t);
  if (d.inDays >= 1) return '$prefix ${d.inDays} day${d.inDays == 1 ? '' : 's'} ago';
  if (d.inHours >= 1) return '$prefix ${d.inHours} hour${d.inHours == 1 ? '' : 's'} ago';
  return '$prefix just now';
}

class ProfileSkill {
  final String name;
  final String category;
  const ProfileSkill(this.name, this.category);
}

class CaregiverProfile {
  final String firstName;
  final String lastName;
  final String email;
  final String? phone;
  final String? county;
  final String? town;
  final int experienceYears;
  final String onboardingStatus;
  final double? trustScore;
  final bool isVerified;
  final List<ProfileSkill> skills;

  /// Document types from the latest KYC submission, and whether it was approved.
  final List<String> documents;
  final bool documentsApproved;

  const CaregiverProfile({
    required this.firstName,
    required this.lastName,
    required this.email,
    this.phone,
    this.county,
    this.town,
    required this.experienceYears,
    required this.onboardingStatus,
    this.trustScore,
    required this.isVerified,
    this.skills = const [],
    this.documents = const [],
    this.documentsApproved = false,
  });

  factory CaregiverProfile.fromJson(Map<String, dynamic> me, Map<String, dynamic>? kyc) {
    final trust = me['trust'] as Map<String, dynamic>?;
    final skills = (me['skills'] as List?) ?? const [];
    return CaregiverProfile(
      firstName: (me['first_name'] as String?) ?? '',
      lastName: (me['last_name'] as String?) ?? '',
      email: (me['email'] as String?) ?? '',
      phone: me['phone'] as String?,
      county: me['county'] as String?,
      town: me['town'] as String?,
      experienceYears: _toInt(me['experience_years']) ?? 0,
      onboardingStatus: (me['onboarding_status'] as String?) ?? '',
      trustScore: _toDouble(trust?['score']),
      isVerified: trust?['is_verified'] == true,
      skills: [
        for (final s in skills)
          if (s is Map) ProfileSkill('${s['skill_name']}', '${s['category']}'),
      ],
      documents: _toStrings(kyc?['documents']),
      documentsApproved: kyc?['status'] == 'approved',
    );
  }

  String get fullName => '$firstName $lastName'.trim();
  String get initials =>
      [firstName, lastName].where((s) => s.isNotEmpty).map((s) => s[0].toUpperCase()).join();
  int? get trustScore100 => trustScore == null ? null : (trustScore! * 100).round();
    String get place => [if (town != null && town!.isNotEmpty) town!, ?county].join(', ');
}
