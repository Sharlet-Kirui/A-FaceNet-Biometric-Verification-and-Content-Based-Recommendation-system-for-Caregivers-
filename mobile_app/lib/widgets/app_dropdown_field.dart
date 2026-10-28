import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import 'app_text_field.dart';

class AppDropdownField extends StatelessWidget {
  final String label;
  final String hint;
  final IconData icon;
  final String? value;
  final List<String> items;
  final ValueChanged<String?> onChanged;
  final String? Function(String?)? validator;

  const AppDropdownField({
    super.key,
    required this.label,
    required this.hint,
    required this.icon,
    required this.value,
    required this.items,
    required this.onChanged,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel(label),
        DropdownButtonFormField<String>(
          value: value,
          isExpanded: true,
          validator: validator,
          onChanged: onChanged,
          icon: const Icon(Icons.keyboard_arrow_down,
              color: AppColors.textMuted),
          hint: Text(hint,
              style: const TextStyle(fontSize: 16, color: AppColors.textDark)),
          style: const TextStyle(fontSize: 16, color: AppColors.textDark),
          decoration: appInputDecoration(icon: icon),
          items: [
            for (final item in items)
              DropdownMenuItem(value: item, child: Text(item)),
          ],
        ),
      ],
    );
  }
}
