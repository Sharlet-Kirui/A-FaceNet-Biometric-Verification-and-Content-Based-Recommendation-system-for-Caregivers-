import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../services/service_locator.dart';
import '../../widgets/onboarding_app_bar.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/primary_button.dart';
import 'kyc_screen.dart';

class _Group {
  final List<String> options;
  final Set<String> selected = {};
  final Set<String> custom = {};

  _Group(List<String> base) : options = [...base];
}

/// Onboarding step 2 of 4 (part 2): Specialties / Skill Vector inputs.
/// Every group lets the caregiver add an entry that isn't listed.
class SpecialtiesScreen extends StatefulWidget {
  final String idType;

  const SpecialtiesScreen({super.key, required this.idType});

  @override
  State<SpecialtiesScreen> createState() => _SpecialtiesScreenState();
}

class _SpecialtiesScreenState extends State<SpecialtiesScreen> {
  final _specs = _Group([
    'Dementia Care',
    'Newborn Care',
    'Post-op Recovery',
    'Palliative Care',
  ]);
  final _skills = _Group([
    'First Aid Certified',
    'Physiotherapy Basics',
    'Blood Pressure Monitoring',
    'Diabetes Care',
    'Wound Dressing',
    'Medication Management',
  ]);
  final _langs = _Group(['Swahili', 'English']);
  final _avail = _Group(['Live-in', 'Day-shift', 'Night-shift']);
  bool _loading = false;

  void _toggle(_Group g, String value) {
    setState(() =>
        g.selected.contains(value) ? g.selected.remove(value) : g.selected.add(value));
  }

  String? _addCustom(_Group g, String raw) {
    final value = raw.trim();
    if (value.isEmpty) return 'Enter a name';
    if (value.length > 40) return 'Keep it under 40 characters';
    final existing =
        g.options.where((o) => o.toLowerCase() == value.toLowerCase());
    setState(() {
      if (existing.isNotEmpty) {
        g.selected.add(existing.first);
      } else {
        g.options.add(value);
        g.custom.add(value);
        g.selected.add(value);
      }
    });
    return null;
  }

  void _removeCustom(_Group g, String value) {
    setState(() {
      g.options.remove(value);
      g.custom.remove(value);
      g.selected.remove(value);
    });
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _submit() async {
    if (_specs.selected.isEmpty ||
        _langs.selected.isEmpty ||
        _avail.selected.isEmpty) {
      _showMessage(
          'Select at least one specialization, language and availability.');
      return;
    }
    setState(() => _loading = true);
    try {
      await onboardingService.submitSpecialties({
        'specializations': _specs.selected.toList(),
        'technicalSkills': _skills.selected.toList(),
        'languages': _langs.selected.toList(),
        'availability': _avail.selected.toList(),
      });
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => KycScreen(idType: widget.idType)),
      );
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not save your specialties. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _section(
    String title,
    _Group g, {
    required String addHint,
    Color color = AppColors.primary,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final option in g.options)
                _SelectChip(
                  label: option,
                  selected: g.selected.contains(option),
                  color: color,
                  onTap: () => _toggle(g, option),
                  onRemove: g.custom.contains(option)
                      ? () => _removeCustom(g, option)
                      : null,
                ),
            ],
          ),
          const SizedBox(height: 12),
          _AddOwnField(hint: addHint, onAdd: (v) => _addCustom(g, v)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const OnboardingAppBar(),
                    const SizedBox(height: 8),
                    const Text(
                      'Select Your Specialties',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textDark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Build your Skill Vector to help families find the '
                      'perfect match for their specific needs.',
                      style: TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 20),
                    const OnboardingStepper(
                      currentStep: 2,
                      label: 'Specialties',
                      showHeader: false,
                    ),
                    const SizedBox(height: 24),
                    _section('Specializations', _specs,
                        addHint: 'Not listed? Add a specialization'),
                    _section('Technical Skills', _skills,
                        addHint: 'Not listed? Add a skill',
                        color: AppColors.success),
                    _section('Languages', _langs,
                        addHint: 'Add another language'),
                    _section('Availability', _avail,
                        addHint: 'Add other availability (e.g. Weekends)'),
                  ],
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppColors.cardBorder)),
              ),
              child: PrimaryButton(
                label: 'Continue to Background Check',
                trailingIcon: Icons.arrow_forward,
                isLoading: _loading,
                onPressed: _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddOwnField extends StatefulWidget {
  final String hint;
  final String? Function(String) onAdd;

  const _AddOwnField({required this.hint, required this.onAdd});

  @override
  State<_AddOwnField> createState() => _AddOwnFieldState();
}

class _AddOwnFieldState extends State<_AddOwnField> {
  final _ctrl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_ctrl.text.trim().isEmpty) return;
    final error = widget.onAdd(_ctrl.text);
    setState(() => _error = error);
    if (error == null) _ctrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _ctrl,
      textCapitalization: TextCapitalization.sentences,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => _submit(),
      onChanged: (_) {
        if (_error != null) setState(() => _error = null);
      },
      style: const TextStyle(fontSize: 15, color: AppColors.textDark),
      decoration: InputDecoration(
        hintText: widget.hint,
        hintStyle: const TextStyle(color: AppColors.hint, fontSize: 15),
        errorText: _error,
        isDense: true,
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        suffixIcon: IconButton(
          tooltip: 'Add',
          icon: const Icon(Icons.add_circle, color: AppColors.primary),
          onPressed: _submit,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }
}

class _SelectChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  final VoidCallback? onRemove;

  const _SelectChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? color : AppColors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 16,
                  color: selected ? color : AppColors.textMuted,
                ),
              ),
              if (selected) ...[
                const SizedBox(width: 8),
                Icon(Icons.check_circle, size: 20, color: color),
              ],
              if (onRemove != null) ...[
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: onRemove,
                  child: const Icon(Icons.close,
                      size: 20, color: AppColors.textMuted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
