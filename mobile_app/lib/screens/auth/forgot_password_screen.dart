import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/app_theme.dart';
import '../../core/password_policy.dart';
import '../../services/api_client.dart';
import '../../services/service_locator.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_card.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/otp_input.dart';
import '../../widgets/password_strength_meter.dart';
import '../../widgets/primary_button.dart';

/// Forgot password: (1) email -> a 6-digit code is emailed; (2) code + new password.
class ForgotPasswordScreen extends StatefulWidget {
  final String initialEmail;
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  static const _resendSeconds = 60;

  final _emailForm = GlobalKey<FormState>();
  final _resetForm = GlobalKey<FormState>();
  late final _emailCtrl = TextEditingController(text: widget.initialEmail);
  final _codeCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;
  Timer? _timer;
  int _remaining = 0;

  static final _noSpaces = [FilteringTextInputFormatter.deny(RegExp(r'\s'))];

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in [_emailCtrl, _codeCtrl, _passwordCtrl, _confirmCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  void _startTimer(int seconds) {
    _timer?.cancel();
    setState(() => _remaining = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _remaining--);
      if (_remaining <= 0) t.cancel();
    });
  }

  Future<void> _sendCode() async {
    if (!_codeSent && !_emailForm.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await authService.requestPasswordReset(_emailCtrl.text.trim());
      if (!mounted) return;
      setState(() => _codeSent = true);
      _startTimer(_resendSeconds);
    } on ApiException catch (e) {
      if (!mounted) return;
      final wait = e.data?['retryAfter'];
      if (e.reason == 'cooldown' && wait is num) {
        setState(() => _codeSent = true);
        _startTimer(wait.toInt());
      }
      setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not send the code. Please try again.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reset() async {
    if (!_resetForm.currentState!.validate()) return;
    if (_codeCtrl.text.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the email');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await authService.resetPassword(
        email: _emailCtrl.text.trim(),
        code: _codeCtrl.text,
        newPassword: _passwordCtrl.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password changed. Log in with your new password.')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = switch (e.reason) {
            'wrong_code' => 'Incorrect code. Check the email and try again.',
            'expired' => 'This code has expired. Tap "Send a new code".',
            'too_many_attempts' => 'Too many attempts. Tap "Send a new code".',
            'no_active_code' => 'No active code. Tap "Send a new code".',
            _ => e.message,
          });
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e, 'Could not change the password. Please try again.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: AppColors.background),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const BrandLogo(),
              const SizedBox(height: 18),
              const Text('Reset Your Password',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.textDark)),
              const SizedBox(height: 6),
              Text(
                _codeSent
                    ? 'If an account exists for ${_emailCtrl.text.trim()}, we emailed it a 6-digit code. '
                        'It expires in 10 minutes.'
                    : 'Enter the email you registered with and we will send you a code.',
                style: const TextStyle(fontSize: 15, height: 1.4, color: AppColors.textMuted),
              ),
              const SizedBox(height: 16),
              AuthCard(
                child: _codeSent ? _resetStep() : _emailStep(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _errorText() => _error == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text(_error!, style: const TextStyle(color: AppColors.error)),
        );

  Widget _emailStep() {
    return Form(
      key: _emailForm,
      child: Column(
        children: [
          AppTextField(
            label: 'Email Address',
            hint: 'jane@example.com',
            icon: Icons.mail_outline,
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim())
                ? null
                : 'Enter a valid email address',
            onFieldSubmitted: (_) => _sendCode(),
          ),
          _errorText(),
          const SizedBox(height: 20),
          PrimaryButton(label: 'Send Code', isLoading: _loading, onPressed: _sendCode),
        ],
      ),
    );
  }

  Widget _resetStep() {
    return Form(
      key: _resetForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FieldLabel('Code from the email'),
          OtpInput(length: 6, controller: _codeCtrl, onChanged: (_) => setState(() => _error = null)),
          const SizedBox(height: 16),
          AppTextField(
            label: 'New Password',
            hint: 'At least 8 characters',
            icon: Icons.lock_outline,
            controller: _passwordCtrl,
            isPassword: true,
            inputFormatters: _noSpaces,
            onChanged: (_) => setState(() {}),
            validator: (v) => PasswordPolicy.validate(v, email: _emailCtrl.text),
          ),
          const SizedBox(height: 8),
          PasswordStrengthMeter(password: _passwordCtrl.text),
          const SizedBox(height: 12),
          AppTextField(
            label: 'Confirm New Password',
            hint: 'Repeat the password',
            icon: Icons.lock_outline,
            controller: _confirmCtrl,
            isPassword: true,
            inputFormatters: _noSpaces,
            validator: (v) => v == _passwordCtrl.text ? null : 'Passwords do not match',
          ),
          _errorText(),
          const SizedBox(height: 20),
          PrimaryButton(label: 'Change Password', isLoading: _loading, onPressed: _reset),
          Center(
            child: TextButton(
              onPressed: _remaining > 0 || _loading ? null : _sendCode,
              child: Text(_remaining > 0 ? 'Send a new code in ${_remaining}s' : 'Send a new code'),
            ),
          ),
        ],
      ),
    );
  }
}
