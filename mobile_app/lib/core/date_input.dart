import 'package:flutter/services.dart';

/// Formats typed digits as mm/dd/yyyy, inserting slashes as you type.
class DateInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 8) digits = digits.substring(0, 8);
    final typing = newValue.text.length > oldValue.text.length;

    final b = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i == 2 || i == 4) b.write('/');
      b.write(digits[i]);
    }
    // Show the next slash right away while typing, never while deleting.
    if (typing && (digits.length == 2 || digits.length == 4)) b.write('/');

    final text = b.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Parses a strict mm/dd/yyyy string; returns null for impossible dates.
DateTime? parseDate(String s) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(s.trim());
  if (m == null) return null;
  final month = int.parse(m.group(1)!);
  final day = int.parse(m.group(2)!);
  final year = int.parse(m.group(3)!);
  final d = DateTime(year, month, day);
  return (d.year == year && d.month == month && d.day == day) ? d : null;
}

String formatDate(DateTime d) =>
    '${d.month.toString().padLeft(2, '0')}/'
    '${d.day.toString().padLeft(2, '0')}/${d.year}';

String isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';
