import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_theme.dart';

OutlineInputBorder _border(Color color, [double width = 1]) {
  return OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: color, width: width),
  );
}

/// Shared input styling for text and dropdown fields.
InputDecoration appInputDecoration({
  String? hint,
  IconData? icon,
  Widget? suffix,
}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: AppColors.hint),
    prefixIcon: icon == null ? null : Icon(icon, color: AppColors.textMuted),
    suffixIcon: suffix,
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    border: _border(AppColors.border),
    enabledBorder: _border(AppColors.border),
    focusedBorder: _border(AppColors.primary, 1.5),
    errorBorder: _border(AppColors.error),
    focusedErrorBorder: _border(AppColors.error, 1.5),
  );
}

class FieldLabel extends StatelessWidget {
  final String text;

  const FieldLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppColors.textDark,
        ),
      ),
    );
  }
}

/// Labelled text field used across the auth and onboarding screens.
/// Set [isPassword] to get the show/hide toggle.
class AppTextField extends StatefulWidget {
  final String label;
  final String hint;
  final IconData? icon;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final bool isPassword;
  final String? helperText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final void Function(String)? onFieldSubmitted;
  final void Function(String)? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final AutovalidateMode? autovalidateMode;
  final bool readOnly;
  final VoidCallback? onTap;
  final int maxLines;

  const AppTextField({
    super.key,
    required this.label,
    required this.hint,
    required this.controller,
    this.icon,
    this.validator,
    this.isPassword = false,
    this.helperText,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.onFieldSubmitted,
    this.onChanged,
    this.inputFormatters,
    this.autovalidateMode,
    this.readOnly = false,
    this.onTap,
    this.maxLines = 1,
  });

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _obscure = widget.isPassword;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel(widget.label),
        TextFormField(
          controller: widget.controller,
          validator: widget.validator,
          autovalidateMode: widget.autovalidateMode,
          obscureText: _obscure,
          readOnly: widget.readOnly,
          onTap: widget.onTap,
          maxLines: widget.maxLines,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          textCapitalization: widget.textCapitalization,
          autofillHints: widget.autofillHints,
          inputFormatters: widget.inputFormatters,
          onFieldSubmitted: widget.onFieldSubmitted,
          onChanged: widget.onChanged,
          style: const TextStyle(fontSize: 16, color: AppColors.textDark),
          decoration: appInputDecoration(
            hint: widget.hint,
            icon: widget.icon,
            suffix: widget.isPassword
                ? IconButton(
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      color: AppColors.textMuted,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )
                : null,
          ),
        ),
        if (widget.helperText != null) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.info_outline,
                  size: 16, color: AppColors.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.helperText!,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
