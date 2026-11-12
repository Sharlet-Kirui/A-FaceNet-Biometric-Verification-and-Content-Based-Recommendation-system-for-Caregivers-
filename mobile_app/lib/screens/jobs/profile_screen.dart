import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import '../../widgets/job_widgets.dart';
import '../auth/login_screen.dart';
import '../auth/privacy_notice_screen.dart';
import '../onboarding/details_screen.dart';
import '../onboarding/specialties_screen.dart';

/// Caregiver's own profile: trust score, contact details, skills, documents.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  CaregiverProfile? _profile;
  String? _error;

  static const _docLabels = {
    'id_front': 'National ID (front)',
    'id_back': 'National ID (back)',
    'passport': 'Passport',
    'good_conduct': 'Certificate of Good Conduct',
    'tvet_cdacc': 'TVET CDACC / NITA Certificate',
    'license': 'Professional License',
    'cv': 'Curriculum Vitae (CV)',
    'other': 'Other Supporting Document',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await jobsService.profile();
      if (mounted) setState(() => _profile = p);
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not load your profile.'));
    }
  }

  /// Opens an edit screen; on save, reloads the profile and the job matches.
  Future<void> _edit(Widget screen) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => screen));
    if (saved == true) {
      await _load();
      jobsService.changes.value++; // skills, county or shifts may change the matches
    }
  }

  Widget _cardHeader(IconData icon, String title, VoidCallback onEdit) {
    return Row(
      children: [
        Expanded(child: SectionTitle(icon, title)),
        TextButton.icon(
          onPressed: onEdit,
          icon: const Icon(Icons.edit_outlined, size: 18),
          label: const Text('Edit'),
        ),
      ],
    );
  }

  Future<void> _logout() async {
    await authService.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.background,
        centerTitle: true,
        title: const Text('My Profile',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
      ),
      body: _error != null
          ? Center(
              child: MessageState(
                icon: Icons.cloud_off_outlined,
                title: 'Could not load your profile',
                message: _error!,
                actionLabel: 'Retry',
                onAction: _load,
              ),
            )
          : p == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      Center(
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 42,
                              backgroundColor: AppColors.stepInactive,
                              child: Text(p.initials,
                                  style: const TextStyle(
                                      fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.primary)),
                            ),
                            const SizedBox(height: 10),
                            Text(p.fullName,
                                style: const TextStyle(
                                    fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
                            if (p.place.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.location_on_outlined, size: 15, color: AppColors.textMuted),
                                  Text(p.place, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      TrustScoreCard(score: p.trustScore100, verified: p.isVerified),
                      const SizedBox(height: 16),
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _cardHeader(Icons.person_outline, 'Personal Info',
                                () => _edit(const DetailsScreen(editMode: true))),
                            _info('EMAIL', p.email),
                            if (p.phone != null && p.phone!.isNotEmpty) _info('PHONE', p.phone!),
                            _info('EXPERIENCE',
                                '${p.experienceYears} year${p.experienceYears == 1 ? '' : 's'}'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _cardHeader(Icons.psychology_outlined, 'Skills & Availability',
                                () => _edit(const SpecialtiesScreen(idType: 'National ID', editMode: true))),
                            if (p.skills.isEmpty)
                              const Text('No skills listed yet.', style: TextStyle(color: AppColors.textMuted))
                            else
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [for (final s in p.skills) SkillChip(s.name)],
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SectionTitle(Icons.folder_outlined, 'Documents'),
                            for (final d in p.documents.where(_docLabels.containsKey))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Row(
                                  children: [
                                    const Icon(Icons.description_outlined, color: AppColors.success),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(_docLabels[d]!,
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.w600, color: AppColors.textDark)),
                                          Text(p.documentsApproved ? 'Verified' : 'Submitted',
                                              style: TextStyle(
                                                  fontSize: 12,
                                                  color: p.documentsApproved
                                                      ? AppColors.success
                                                      : AppColors.textMuted)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (!p.documents.any(_docLabels.containsKey))
                              const Text('No documents uploaded yet.', style: TextStyle(color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextButton.icon(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const PrivacyNoticeScreen(askToAgree: false))),
                        icon: const Icon(Icons.privacy_tip_outlined),
                        label: const Text('Privacy Notice and your data rights'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _logout,
                        icon: const Icon(Icons.logout),
                        label: const Text('Log Out'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(color: AppColors.error),
                          minimumSize: const Size.fromHeight(48),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _info(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 15, color: AppColors.textDark)),
        ],
      ),
    );
  }
}
