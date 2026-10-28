import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_theme.dart';
import '../core/date_input.dart';
import 'app_text_field.dart';

/// Typed mm/dd/yyyy input (slashes added automatically) with a calendar
/// button as an alternative.
class AppDateField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final DateTime firstDate;
  final DateTime lastDate;
  final DateTime initialDate;

  const AppDateField({
    super.key,
    required this.label,
    required this.controller,
    required this.firstDate,
    required this.lastDate,
    required this.initialDate,
    this.validator,
  });

  Future<void> _pick(BuildContext context) async {
    final typed = parseDate(controller.text);
    final start = (typed != null &&
            !typed.isBefore(firstDate) &&
            !typed.isAfter(lastDate))
        ? typed
        : initialDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: firstDate,
      lastDate: lastDate,
      helpText: label,
    );
    if (picked != null) controller.text = formatDate(picked);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel(label),
        TextFormField(
          controller: controller,
          validator: validator,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.next,
          inputFormatters: [DateInputFormatter()],
          style: const TextStyle(fontSize: 16, color: AppColors.textDark),
          decoration: appInputDecoration(
            hint: 'mm/dd/yyyy',
            icon: Icons.calendar_today_outlined,
            suffix: IconButton(
              tooltip: 'Pick from calendar',
              icon: const Icon(Icons.edit_calendar_outlined,
                  color: AppColors.primary),
              onPressed: () => _pick(context),
            ),
          ),
        ),
      ],
    );
  }
}
