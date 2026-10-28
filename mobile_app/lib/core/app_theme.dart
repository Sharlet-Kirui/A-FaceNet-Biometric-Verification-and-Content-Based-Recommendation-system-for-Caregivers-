import 'package:flutter/material.dart';

/// Colours sampled from the Figma mockups.
/// Blue = trust and security, green = validation and safety (used later).
class AppColors {
  AppColors._();

  static const background = Color(0xFFF7F9FE);
  static const primary = Color(0xFF0049AC);
  static const primaryDark = Color(0xFF003B8E);
  static const textDark = Color(0xFF0B1B33);
  static const textMuted = Color(0xFF5B6475);
  static const hint = Color(0xFF8A90A0);
  static const border = Color(0xFFCBD0E0);
  static const cardBorder = Color(0xFFD5D9E6);
  static const stepInactive = Color(0xFFD6E4FA);
  static const error = Color(0xFFB3261E);
  static const success = Color(0xFF1E8E3E);
}

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
    ),
    scaffoldBackgroundColor: AppColors.background,
  );
}
