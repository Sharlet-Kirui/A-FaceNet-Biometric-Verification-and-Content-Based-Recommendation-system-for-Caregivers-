import 'package:flutter/material.dart';

import '../core/app_theme.dart';

/// Back arrow + centred brand title used on onboarding steps after sign-up.
class OnboardingAppBar extends StatelessWidget {
  final VoidCallback? onBack;

  const OnboardingAppBar({super.key, this.onBack});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: AppColors.primaryDark),
              onPressed: onBack ?? () => Navigator.of(context).maybePop(),
            ),
          ),
          const Text(
            'CareMatch',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.primaryDark,
            ),
          ),
        ],
      ),
    );
  }
}
