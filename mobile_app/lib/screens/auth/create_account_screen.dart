import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/app_theme.dart';
import '../../core/password_policy.dart';
import '../../services/api_client.dart';
import '../../services/service_locator.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_card.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/onboarding_stepper.dart';
import '../../widgets/password_strength_meter.dart';
import '../../widgets/primary_button.dart';
import '../onboarding/verify_email_screen.dart';
import 'login_screen.dart';
import 'privacy_notice_screen.dart';

/// Onboarding step 1 of 4: Account (then email verification).
/// Phone number now lives on the Details screen to keep this form short.
class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _loading = false;
  bool _acceptedPrivacy = false;
  bool _privacyError = false;

  static final _noSpaces = [FilteringTextInputFormatter.deny(RegExp(r'\s'))];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  String? _validateName(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return 'Enter your full name';
    if (value.split(RegExp(r'\s+')).length < 2) {
      return 'Enter your first and last name';
    }
    return null;
  }

  String? _validateEmail(String? v) {
    final value = v?.trim() ?? '';
    if (value.isEmpty) return 'Enter your email address';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
    return ok ? null : 'Enter a valid email address';
  }

  String? _validatePassword(String? v) => PasswordPolicy.validate(
        v,
        email: _emailCtrl.text,
        fullName: _nameCtrl.text,
      );

  String? _validateConfirm(String? v) {
    if (v == null || v.isEmpty) return 'Confirm your password';
    return v == _passwordCtrl.text ? null : 'Passwords do not match';
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openPrivacyNotice() async {
    final agreed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const PrivacyNoticeScreen()),
    );
    if (agreed == true && mounted) {
      setState(() {
        _acceptedPrivacy = true;
        _privacyError = false;
      });
    }
  }

  Future<void> _submit() async {
    final valid = _formKey.currentState!.validate();
    if (!_acceptedPrivacy) setState(() => _privacyError = true);
    if (!valid || !_acceptedPrivacy) return;
    setState(() => _loading = true);
    try {
      final email = _emailCtrl.text.trim();
      await onboardingService.registerAccount(
        fullName: _nameCtrl.text.trim(),
        email: email,
        password: _passwordCtrl.text,
      );
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => VerifyEmailScreen(email: email)),
      );
    } catch (e) {
      if (!mounted) return;
      _showMessage(friendlyError(e, 'Could not create your account. Please try again.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _goToLogin() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const BrandLogo(),
              const SizedBox(height: 18),
              const OnboardingStepper(currentStep: 1, label: 'Account'),
              const SizedBox(height: 18),
              const Text(
                'Create Your Account',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Enter your details to start the verification process.',
                style: TextStyle(
                  fontSize: 15,
                  height: 1.4,
                  color: AppColors.textMuted,
                ),
              ),
              const SizedBox(height: 16),
              AuthCard(
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      AppTextField(
                        label: 'Full Name',
                        hint: 'Jane Doe',
                        icon: Icons.person_outline,
                        controller: _nameCtrl,
                        validator: _validateName,
                        keyboardType: TextInputType.name,
                        textInputAction: TextInputAction.next,
                        textCapitalization: TextCapitalization.words,
                        autofillHints: const [AutofillHints.name],
                      ),
                      const SizedBox(height: 12),
                      AppTextField(
                        label: 'Email Address',
                        hint: 'jane@example.com',
                        icon: Icons.mail_outline,
                        controller: _emailCtrl,
                        validator: _validateEmail,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                      ),
                      const SizedBox(height: 12),
                      AppTextField(
                        label: 'Password',
                        hint: '••••••••',
                        icon: Icons.lock_outline,
                        controller: _passwordCtrl,
                        validator: _validatePassword,
                        isPassword: true,
                        inputFormatters: _noSpaces,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.newPassword],
                        onChanged: (_) => setState(() {}),
                      ),
                      if (_passwordCtrl.text.isNotEmpty)
                        PasswordStrengthMeter(password: _passwordCtrl.text),
                      const SizedBox(height: 12),
                      AppTextField(
                        label: 'Confirm Password',
                        hint: '••••••••',
                        icon: Icons.lock_outline,
                        controller: _confirmCtrl,
                        validator: _validateConfirm,
                        autovalidateMode: AutovalidateMode.onUserInteraction,
                        isPassword: true,
                        inputFormatters: _noSpaces,
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submit(),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Checkbox(
                            value: _acceptedPrivacy,
                            isError: _privacyError,
                            onChanged: (v) => setState(() {
                              _acceptedPrivacy = v ?? false;
                              _privacyError = false;
                            }),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Wrap(
                                children: [
                                  const Text('I have read and agree to the ',
                                      style: TextStyle(fontSize: 14, color: AppColors.textDark)),
                                  GestureDetector(
                                    onTap: _openPrivacyNotice,
                                    child: const Text(
                                      'Privacy Notice',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.primary,
                                        decoration: TextDecoration.underline,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (_privacyError)
                        const Padding(
                          padding: EdgeInsets.only(left: 12, bottom: 4),
                          child: Text('Read and accept the Privacy Notice to continue',
                              style: TextStyle(fontSize: 13, color: AppColors.error)),
                        ),
                      const SizedBox(height: 12),
                      PrimaryButton(
                        label: 'Create Account',
                        trailingIcon: Icons.arrow_forward,
                        isLoading: _loading,
                        onPressed: _submit,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text(
                            'Already have an account?',
                            style: TextStyle(
                              fontSize: 15,
                              color: AppColors.textMuted,
                            ),
                          ),
                          TextButton(
                            onPressed: _goToLogin,
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              minimumSize: const Size(0, 36),
                            ),
                            child: const Text(
                              'Log In',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
