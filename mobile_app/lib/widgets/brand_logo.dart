import 'package:flutter/material.dart';

import '../core/app_theme.dart';

/// CareMatch mark (shield = verified trust, heart = care, tick = checked) and name.
/// The image is assets/brand/logo_mark.png, declared in pubspec.yaml.
class BrandLogo extends StatelessWidget {
  final double size;
  const BrandLogo({super.key, this.size = 34});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset('assets/brand/logo_mark.png', width: size, height: size),
        const SizedBox(width: 10),
        Text(
          'CareMatch',
          style: TextStyle(
            fontSize: size * 0.68,
            fontWeight: FontWeight.w800,
            color: AppColors.primaryDark,
          ),
        ),
      ],
    );
  }
}
