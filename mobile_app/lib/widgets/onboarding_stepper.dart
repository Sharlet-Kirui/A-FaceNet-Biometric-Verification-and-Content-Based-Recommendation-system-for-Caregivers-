import 'package:flutter/material.dart';

import '../core/app_theme.dart';

/// Shared progress header for the four onboarding steps
/// (Account/Verify, Details, Specialties, Background Check).
/// Completed steps are green with a tick, the current step is blue.
class OnboardingStepper extends StatelessWidget {
  final int currentStep;
  final int totalSteps;
  final String label;
  final bool showHeader;

  const OnboardingStepper({
    super.key,
    required this.currentStep,
    required this.label,
    this.totalSteps = 4,
    this.showHeader = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeader) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Step $currentStep of $totalSteps',
                style:
                    const TextStyle(fontSize: 15, color: AppColors.textMuted),
              ),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: List.generate(totalSteps, (i) {
            final done = i < currentStep - 1;
            final current = i == currentStep - 1;
            return Expanded(
              child: Container(
                height: 6,
                margin: EdgeInsets.only(right: i == totalSteps - 1 ? 0 : 8),
                decoration: BoxDecoration(
                  color: done
                      ? AppColors.success
                      : current
                          ? AppColors.primaryDark
                          : AppColors.stepInactive,
                  borderRadius: BorderRadius.circular(3),
                ),
                child: done
                    ? const Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: EdgeInsets.only(right: 3),
                          child:
                              Icon(Icons.check, size: 6, color: Colors.white),
                        ),
                      )
                    : null,
              ),
            );
          }),
        ),
      ],
    );
  }
}
