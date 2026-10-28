import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/password_policy.dart';

/// Four-segment strength bar plus a compact two-column rule checklist.
class PasswordStrengthMeter extends StatelessWidget {
  final String password;

  const PasswordStrengthMeter({super.key, required this.password});

  static const _levelColors = [
    AppColors.stepInactive,
    AppColors.error,
    Color(0xFFE08A00),
    AppColors.success,
    AppColors.success,
  ];

  @override
  Widget build(BuildContext context) {
    final level = PasswordPolicy.strength(password);
    final color = _levelColors[level];

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: List.generate(4, (i) {
                    return Expanded(
                      child: Container(
                        height: 5,
                        margin: EdgeInsets.only(right: i == 3 ? 0 : 6),
                        decoration: BoxDecoration(
                          color: i < level ? color : AppColors.stepInactive,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    );
                  }),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 52,
                child: Text(
                  PasswordPolicy.strengthLabels[level],
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, c) {
            final half = (c.maxWidth - 8) / 2;
            return Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final rule in PasswordPolicy.rules)
                  SizedBox(
                    width: half,
                    child: _RuleRow(
                      label: rule.label,
                      met: rule.test(password),
                    ),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  final String label;
  final bool met;

  const _RuleRow({required this.label, required this.met});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          met ? Icons.check_circle : Icons.radio_button_unchecked,
          size: 15,
          color: met ? AppColors.success : AppColors.hint,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12.5,
              color: met ? AppColors.textDark : AppColors.textMuted,
            ),
          ),
        ),
      ],
    );
  }
}
