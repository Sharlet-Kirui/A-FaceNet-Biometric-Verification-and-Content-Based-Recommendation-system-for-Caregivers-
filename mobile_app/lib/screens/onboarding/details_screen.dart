import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/app_theme.dart';
import '../../core/date_input.dart';
import '../../services/api_client.dart';
import '../../services/service_locator.dart';
import '../../widgets/app_date_field.dart';
import '../../widgets/app_dropdown_field.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_card.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/primary_button.dart';
import 'specialties_screen.dart';

class _WorkEntry {
  final employer = TextEditingController();
  final role = TextEditingController();
  final duties = TextEditingController();
  final from = TextEditingController();
  final to = TextEditingController();

  void dispose() {
    employer.dispose();
    role.dispose();
    duties.dispose();
    from.dispose();
    to.dispose();
  }
}

/// Onboarding step 2 of 4: personal, address, credentials, work history.
/// With [editMode] it opens from the Profile screen, prefilled, and saves in place.
/// After verification the identity fields (date of birth, nationality, ID) are locked.
class DetailsScreen extends StatefulWidget {
  final bool editMode;
  const DetailsScreen({super.key, this.editMode = false});

  @override
  State<DetailsScreen> createState() => _DetailsScreenState();
}

class _DetailsScreenState extends State<DetailsScreen> {
  static const _nationalities = [
    'Kenyan',
    'Ugandan',
    'Tanzanian',
    'Rwandan',
    'Burundian',
    'Ethiopian',
    'Somali',
    'South Sudanese',
    'Other',
  ];
  static const _idTypes = ['National ID', 'Passport'];
  static const _genders = ['Female', 'Male', 'Other', 'Prefer not to say'];
  static const _minAge = 18;
  static const _maxYears = 40;

  final _formKey = GlobalKey<FormState>();

  // Personal
  final _dobCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _idNumberCtrl = TextEditingController();
  String? _nationality;
  String? _gender;
  String _idType = _idTypes.first;

  // Address
  final _streetCtrl = TextEditingController();
  final _townCtrl = TextEditingController();
  final _countyCtrl = TextEditingController();
  final _postalCtrl = TextEditingController();
  final _countryCtrl = TextEditingController(text: 'Kenya');

  // Professional
  int _years = 0;
  final _conductRefCtrl = TextEditingController();
  final _conductAuthCtrl = TextEditingController();
  final _conductExpiryCtrl = TextEditingController();
  final _licenseNoCtrl = TextEditingController();
  final _licenseAuthCtrl = TextEditingController();
  final _licenseExpiryCtrl = TextEditingController();

  final _work = <_WorkEntry>[];
  bool _loading = false;
  bool _prefilling = false;
  bool _identityLocked = false;

  @override
  void initState() {
    super.initState();
    if (widget.editMode) _prefill();
  }

  /// Fills the form from GET /caregivers/me (edit mode).
  Future<void> _prefill() async {
    setState(() => _prefilling = true);
    try {
      final me = await onboardingService.loadMyProfile();
      if (!mounted) return;
      String? date(Object? iso) {
        final d = DateTime.tryParse('${iso ?? ''}');
        return d == null ? null : formatDate(d);
      }
      const genders = {'female': 'Female', 'male': 'Male', 'other': 'Other', 'prefer_not_to_say': 'Prefer not to say'};
      final credentials = {
        for (final c in (me['credentials'] as List? ?? const []))
          if (c is Map) '${c['credential_type']}': c,
      };
      setState(() {
        _dobCtrl.text = date(me['date_of_birth']) ?? '';
        _gender = genders[me['gender']];
        _phoneCtrl.text = '${me['phone'] ?? ''}';
        final nationality = me['nationality'] as String?;
        _nationality = _nationalities.contains(nationality) ? nationality : (nationality == null ? null : 'Other');
        _idType = me['id_type'] == 'passport' ? 'Passport' : 'National ID';
        _idNumberCtrl.text = '${me['id_number'] ?? ''}';
        _streetCtrl.text = '${me['street'] ?? ''}';
        _townCtrl.text = '${me['town'] ?? ''}';
        _countyCtrl.text = '${me['county'] ?? ''}';
        _postalCtrl.text = '${me['postal_code'] ?? ''}';
        _countryCtrl.text = '${me['country'] ?? 'Kenya'}';
        _years = ((me['experience_years'] as num?) ?? 0).clamp(0, _maxYears).toInt();
        final pc = credentials['police_clearance'];
        _conductRefCtrl.text = '${pc?['reference_number'] ?? ''}';
        _conductAuthCtrl.text = '${pc?['issuing_authority'] ?? ''}';
        _conductExpiryCtrl.text = date(pc?['expiry_date']) ?? '';
        final lic = credentials['professional_license'];
        _licenseNoCtrl.text = '${lic?['reference_number'] ?? ''}';
        _licenseAuthCtrl.text = '${lic?['issuing_authority'] ?? ''}';
        _licenseExpiryCtrl.text = date(lic?['expiry_date']) ?? '';
        for (final w in _work) {
          w.dispose();
        }
        _work.clear();
        for (final w in (me['work_history'] as List? ?? const [])) {
          if (w is! Map) continue;
          final e = _WorkEntry();
          e.employer.text = '${w['employer'] ?? ''}';
          e.role.text = '${w['role'] ?? ''}';
          e.duties.text = '${w['duties'] ?? ''}';
          e.from.text = '${w['from_year'] ?? ''}';
          e.to.text = w['to_year'] == null ? '' : '${w['to_year']}';
          _work.add(e);
        }
        _identityLocked = me['identity_locked'] == true;
      });
    } catch (e) {
      if (mounted) _showMessage(friendlyError(e, 'Could not load your details.'));
    } finally {
      if (mounted) setState(() => _prefilling = false);
    }
  }

  List<TextEditingController> get _conductGroup =>
      [_conductRefCtrl, _conductAuthCtrl, _conductExpiryCtrl];
  List<TextEditingController> get _licenseGroup =>
      [_licenseNoCtrl, _licenseAuthCtrl, _licenseExpiryCtrl];

  @override
  void dispose() {
    for (final c in [
      _dobCtrl,
      _phoneCtrl,
      _idNumberCtrl,
      _streetCtrl,
      _townCtrl,
      _countyCtrl,
      _postalCtrl,
      _countryCtrl,
      ..._conductGroup,
      ..._licenseGroup,
    ]) {
      c.dispose();
    }
    for (final w in _work) {
      w.dispose();
    }
    super.dispose();
  }

  // ---- validators ---------------------------------------------------------

  String? _required(String? v, String message) =>
      (v == null || v.trim().isEmpty) ? message : null;

  String? _validateDob(String? v) {
    if (_required(v, 'Enter your date of birth') != null) {
      return 'Enter your date of birth';
    }
    final d = parseDate(v!);
    if (d == null) return 'Use mm/dd/yyyy';
    final now = DateTime.now();
    final cutoff = DateTime(now.year - _minAge, now.month, now.day);
    if (d.isAfter(cutoff)) return 'You must be at least $_minAge years old';
    if (d.year < 1900) return 'Enter a valid date of birth';
    return null;
  }

  String? _validatePhone(String? v) {
    final value = (v ?? '').replaceAll(RegExp(r'[\s\-()]'), '');
    if (value.isEmpty) return 'Enter your phone number';
    final ok = RegExp(r'^\+?\d{9,15}$').hasMatch(value);
    return ok ? null : 'Enter a valid phone number';
  }

  String? _validateIdNumber(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Enter your ${_idType.toLowerCase()} number';
    return RegExp(r'^[A-Z0-9]{5,20}$').hasMatch(value)
        ? null
        : 'Use 5–20 letters or numbers';
  }

  /// Credential fields are optional as a group, but once any field in the
  /// group is filled the rest become required.
  String? _groupRequired(
      String? v, List<TextEditingController> group, String message) {
    if ((v ?? '').trim().isNotEmpty) return null;
    return group.any((c) => c.text.trim().isNotEmpty) ? message : null;
  }

  String? _validateExpiry(String? v, List<TextEditingController> group, {bool required = false}) {
    final missing = required
        ? _required(v, 'Enter the expiry date')
        : _groupRequired(v, group, 'Enter the expiry date');
    if (missing != null) return missing;
    if ((v ?? '').trim().isEmpty) return null;
    final d = parseDate(v!);
    if (d == null) return 'Use mm/dd/yyyy';
    final now = DateTime.now();
    if (d.isBefore(DateTime(now.year, now.month, now.day))) {
      return 'This has expired';
    }
    return null;
  }

  String? _validateYear(String? v, {String? notBefore}) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return null;
    final y = int.tryParse(value);
    if (y == null || value.length != 4) return 'Use yyyy';
    if (y < 1950 || y > DateTime.now().year) return 'Invalid year';
    final from = int.tryParse(notBefore ?? '');
    if (from != null && y < from) return 'Before start';
    return null;
  }

  // ---- helpers ------------------------------------------------------------

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      _showMessage('Please fix the highlighted fields.');
      return;
    }
    if (_years > 0 && _work.isEmpty) {
      _showMessage('You reported $_years year${_years == 1 ? '' : 's'} of experience: add at least one workplace.');
      return;
    }
    setState(() => _loading = true);
    try {
      String? orNull(TextEditingController c) =>
          c.text.trim().isEmpty ? null : c.text.trim();
      String? isoOrNull(TextEditingController c) {
        final d = parseDate(c.text);
        return d == null ? null : isoDate(d);
      }

      await onboardingService.submitDetails({
        'dateOfBirth': isoDate(parseDate(_dobCtrl.text)!),
        'gender': _gender,
        'phone': _phoneCtrl.text.trim(),
        'nationality': _nationality,
        'idType': _idType,
        'idNumber': _idNumberCtrl.text.trim(),
        'address': {
          'street': _streetCtrl.text.trim(),
          'town': _townCtrl.text.trim(),
          'county': _countyCtrl.text.trim(),
          'postalCode': _postalCtrl.text.trim(),
          'country': _countryCtrl.text.trim(),
        },
        'experienceYears': _years,
        'policeClearance': {
          'referenceNumber': orNull(_conductRefCtrl),
          'issuingAuthority': orNull(_conductAuthCtrl),
          'expiryDate': isoOrNull(_conductExpiryCtrl),
        },
        'professionalLicense': {
          'licenseNumber': orNull(_licenseNoCtrl),
          'issuingAuthority': orNull(_licenseAuthCtrl),
          'expiryDate': isoOrNull(_licenseExpiryCtrl),
        },
        'workHistory': [
          for (final w in _work)
            {
              'employer': w.employer.text.trim(),
              'role': w.role.text.trim(),
              'duties': w.duties.text.trim(),
              'fromYear': int.parse(w.from.text.trim()),
              'toYear': orNull(w.to) == null ? null : int.parse(w.to.text),
            },
        ],
      });
      if (!mounted) return;
      if (widget.editMode) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Details updated')));
        Navigator.of(context).pop(true);
        return;
      }
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => SpecialtiesScreen(idType: _idType)),
      );
    } catch (e) {
      if (!mounted) return;
      _showMessage(friendlyError(e, 'Could not save your details. Please try again.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---- UI -----------------------------------------------------------------

  Widget _cardTitle(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primaryDark, size: 24),
          const SizedBox(width: 10),
          Text(
            text,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.primaryDark,
            ),
          ),
        ],
      ),
    );
  }

  Widget _subTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 12),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: AppColors.textDark,
        ),
      ),
    );
  }

  Widget _gap([double h = 14]) => SizedBox(height: h);

  /// Identity fields cannot change after verification: shown greyed and not editable.
  Widget _lockable(Widget child) => _identityLocked
      ? IgnorePointer(child: Opacity(opacity: 0.55, child: child))
      : child;

  Widget _personalCard() {
    final now = DateTime.now();
    return AuthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(Icons.person_outline, 'Personal Info'),
          if (_identityLocked)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline, size: 18, color: AppColors.textMuted),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Date of birth, nationality and ID were verified and cannot be changed. '
                      'Contact support if they are wrong.',
                      style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                    ),
                  ),
                ],
              ),
            ),
          _lockable(AppDateField(
            label: 'Date of Birth',
            controller: _dobCtrl,
            validator: _validateDob,
            firstDate: DateTime(1940),
            lastDate: DateTime(now.year - _minAge, now.month, now.day),
            initialDate: DateTime(now.year - 25, now.month, now.day),
          )),
          _gap(),
          AppDropdownField(
            label: 'Gender',
            hint: 'Select gender',
            icon: Icons.person_outline,
            value: _gender,
            items: _genders,
            onChanged: (v) => setState(() => _gender = v),
            validator: (v) => v == null ? 'Select an option' : null,
          ),
          _gap(),
          AppTextField(
            label: 'Phone Number',
            hint: '+254 712 345 678',
            icon: Icons.phone_outlined,
            controller: _phoneCtrl,
            validator: _validatePhone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.telephoneNumber],
          ),
          _gap(),
          _lockable(AppDropdownField(
            label: 'Nationality',
            hint: 'Select Nationality',
            icon: Icons.public,
            value: _nationality,
            items: _nationalities,
            onChanged: (v) => setState(() => _nationality = v),
            validator: (v) => v == null ? 'Select your nationality' : null,
          )),
          _gap(),
          _lockable(AppDropdownField(
            label: 'ID Type',
            hint: 'Select ID type',
            icon: Icons.badge_outlined,
            value: _idType,
            items: _idTypes,
            onChanged: (v) => setState(() => _idType = v ?? _idTypes.first),
          )),
          _gap(),
          _lockable(AppTextField(
            label: '$_idType Number',
            hint: _idType == 'Passport' ? 'e.g. A1234567' : 'e.g. 12345678',
            icon: Icons.numbers,
            controller: _idNumberCtrl,
            validator: _validateIdNumber,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
              TextInputFormatter.withFunction(
                (o, n) => n.copyWith(text: n.text.toUpperCase()),
              ),
            ],
          )),
        ],
      ),
    );
  }

  Widget _addressCard() {
    String? req(String? v) => _required(v, 'Required');
    return AuthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(Icons.home_outlined, 'Residential Address'),
          AppTextField(
            label: 'Street Address',
            hint: 'Street, building, house no.',
            icon: Icons.signpost_outlined,
            controller: _streetCtrl,
            validator: (v) => _required(v, 'Enter your street address'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.streetAddressLine1],
          ),
          _gap(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  label: 'Town / City',
                  hint: 'e.g. Westlands',
                  controller: _townCtrl,
                  validator: req,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppTextField(
                  label: 'County / State',
                  hint: 'e.g. Nairobi',
                  controller: _countyCtrl,
                  validator: req,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                ),
              ),
            ],
          ),
          _gap(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  label: 'Postal / ZIP Code',
                  hint: 'e.g. 00100',
                  controller: _postalCtrl,
                  validator: req,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.characters,
                  autofillHints: const [AutofillHints.postalCode],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppTextField(
                  label: 'Country',
                  hint: 'e.g. Kenya',
                  controller: _countryCtrl,
                  validator: req,
                  textInputAction: TextInputAction.done,
                  textCapitalization: TextCapitalization.words,
                  autofillHints: const [AutofillHints.countryName],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _professionalCard() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final far = DateTime(now.year + 15, now.month, now.day);

    return AuthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(Icons.work_outline, 'Professional Info'),
          const FieldLabel('Caregiving Experience (Years)'),
          Row(
            children: [
              IconButton.outlined(
                tooltip: 'Fewer years',
                onPressed: _years > 0 ? () => setState(() => _years--) : null,
                icon: const Icon(Icons.remove),
              ),
              Container(
                width: 72,
                margin: const EdgeInsets.symmetric(horizontal: 10),
                padding: const EdgeInsets.symmetric(vertical: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.stepInactive,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$_years',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.primaryDark),
                ),
              ),
              IconButton.outlined(
                tooltip: 'More years',
                onPressed: _years < _maxYears ? () => setState(() => _years++) : null,
                icon: const Icon(Icons.add),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _years == 0 ? 'New to caregiving' : '$_years year${_years == 1 ? '' : 's'} of paid caregiving work',
                  style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                ),
              ),
            ],
          ),
          _subTitle('Certificate of Good Conduct (required)'),
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text(
              'Families need this before hiring. Apply on eCitizen (DCI) if you do not have a valid one.',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
          ),
          AppTextField(
            label: 'Reference Number',
            hint: 'Police clearance reference',
            controller: _conductRefCtrl,
            validator: (v) => _required(v, 'Enter the reference number'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.characters,
          ),
          _gap(),
          AppTextField(
            label: 'Issuing Authority',
            hint: 'e.g. Directorate of Criminal Investigations',
            controller: _conductAuthCtrl,
            validator: (v) => _required(v, 'Enter the issuing authority'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
          ),
          _gap(),
          AppDateField(
            label: 'Expiry Date',
            controller: _conductExpiryCtrl,
            validator: (v) => _validateExpiry(v, _conductGroup, required: true),
            firstDate: today,
            lastDate: far,
            initialDate: today,
          ),
          _subTitle('Professional License / Certification'),
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text(
              'Needed only if you hold a Nursing Council licence; you will upload it with your documents.',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
          ),
          AppTextField(
            label: 'License Number',
            hint: 'e.g. nursing or caregiver registration ID',
            controller: _licenseNoCtrl,
            validator: (v) =>
                _groupRequired(v, _licenseGroup, 'Enter the license number'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.characters,
          ),
          _gap(),
          AppTextField(
            label: 'Issuing Authority',
            hint: 'e.g. Nursing Council of Kenya',
            controller: _licenseAuthCtrl,
            validator: (v) => _groupRequired(
                v, _licenseGroup, 'Enter the issuing authority'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
          ),
          _gap(),
          AppDateField(
            label: 'Expiry Date',
            controller: _licenseExpiryCtrl,
            validator: (v) => _validateExpiry(v, _licenseGroup),
            firstDate: today,
            lastDate: far,
            initialDate: today,
          ),
        ],
      ),
    );
  }

  Widget _workCard() {
    return AuthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _cardTitle(Icons.history_edu_outlined, 'Work History'),
          if (_work.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _years > 0
                    ? 'Required: add at least one place you have worked and what you did there.'
                    : 'Add places you have worked and what you did there (optional while you are new).',
                style: TextStyle(fontSize: 15, color: _years > 0 ? AppColors.error : AppColors.textMuted),
              ),
            ),
          for (var i = 0; i < _work.length; i++) _workEntryCard(i),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: () => setState(() => _work.add(_WorkEntry())),
              icon: const Icon(Icons.add),
              label: const Text('Add workplace'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primaryDark,
                side: const BorderSide(color: AppColors.primaryDark),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _workEntryCard(int index) {
    final w = _work[index];
    return Container(
      key: ObjectKey(w),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Workplace ${index + 1}',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryDark,
                ),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Remove',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.delete_outline, color: AppColors.error),
                onPressed: () => setState(() {
                  _work.removeAt(index).dispose();
                }),
              ),
            ],
          ),
          AppTextField(
            label: 'Employer / Place',
            hint: 'e.g. Aga Khan Hospital, private family',
            controller: w.employer,
            validator: (v) => _required(v, 'Enter the place you worked'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
          ),
          _gap(12),
          AppTextField(
            label: 'Role',
            hint: 'e.g. Home caregiver',
            controller: w.role,
            validator: (v) => _required(v, 'Enter your role'),
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
          ),
          _gap(12),
          AppTextField(
            label: 'What you did',
            hint: 'Describe your duties',
            controller: w.duties,
            maxLines: 3,
            keyboardType: TextInputType.multiline,
            textCapitalization: TextCapitalization.sentences,
            validator: (v) => _required(v, 'Describe your duties'),
          ),
          _gap(12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  label: 'From (year)',
                  hint: 'yyyy',
                  controller: w.from,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  validator: (v) =>
                      _required(v, 'Required') ?? _validateYear(v),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppTextField(
                  label: 'To (year)',
                  hint: 'Present',
                  controller: w.to,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  validator: (v) => _validateYear(v, notBefore: w.from.text),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const OnboardingAppBar(),
                const SizedBox(height: 8),
                if (!widget.editMode) const OnboardingStepper(currentStep: 2, label: 'Details'),
                const SizedBox(height: 24),
                if (_prefilling) const LinearProgressIndicator(),
                Text(
                  widget.editMode ? 'Edit Your Details' : 'Personal & Professional Details',
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Please provide your background information to help us '
                  'match you with the right families.',
                  style: TextStyle(
                    fontSize: 16,
                    height: 1.4,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 20),
                _personalCard(),
                const SizedBox(height: 16),
                _addressCard(),
                const SizedBox(height: 16),
                _professionalCard(),
                const SizedBox(height: 16),
                _workCard(),
                const SizedBox(height: 24),
                Row(
                  children: [
                    SizedBox(
                      height: 52,
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primaryDark,
                          side: const BorderSide(color: AppColors.primaryDark),
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Back',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: PrimaryButton(
                        label: widget.editMode ? 'Save Changes' : 'Next Step',
                        trailingIcon: Icons.arrow_forward,
                        isLoading: _loading,
                        onPressed: _submit,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
