/// Single source of truth for password rules. The UI checklist and the
/// form validator both read from here so they can never disagree.
class PasswordRule {
  final String label;
  final String error;
  final bool Function(String password) test;

  const PasswordRule(this.label, this.error, this.test);
}

class PasswordPolicy {
  PasswordPolicy._();

  static const minLength = 8;
  static const strongLength = 12;

  static final rules = <PasswordRule>[
    PasswordRule(
      'At least $minLength characters',
      'Password must be at least $minLength characters',
      (p) => p.length >= minLength,
    ),
    PasswordRule(
      'Uppercase letter',
      'Add an uppercase letter',
      (p) => RegExp(r'[A-Z]').hasMatch(p),
    ),
    PasswordRule(
      'Lowercase letter',
      'Add a lowercase letter',
      (p) => RegExp(r'[a-z]').hasMatch(p),
    ),
    PasswordRule(
      'Number',
      'Add a number',
      (p) => RegExp(r'\d').hasMatch(p),
    ),
    PasswordRule(
      'Special character',
      'Add a special character (e.g. ! @ # \$)',
      (p) => RegExp(r'[^A-Za-z0-9\s]').hasMatch(p),
    ),
  ];

  static const _commonFragments = [
    'password',
    'qwerty',
    '12345',
    'letmein',
    'welcome',
    'iloveyou',
    'admin',
  ];

  /// 0 = empty, 1 = weak, 2 = fair, 3 = good, 4 = strong.
  static int strength(String p) {
    if (p.isEmpty) return 0;
    final passed = rules.where((r) => r.test(p)).length;
    if (passed <= 2) return 1;
    if (passed <= 4) return 2;
    return p.length >= strongLength ? 4 : 3;
  }

  static const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  /// Returns the first problem found, or null if the password is acceptable.
  static String? validate(String? p, {String? email, String? fullName}) {
    if (p == null || p.isEmpty) return 'Enter a password';
    if (p.contains(RegExp(r'\s'))) return 'Password cannot contain spaces';
    for (final rule in rules) {
      if (!rule.test(p)) return rule.error;
    }
    final lower = p.toLowerCase();
    if (_commonFragments.any(lower.contains)) {
      return 'Avoid common words or sequences';
    }
    final local = (email ?? '').split('@').first.toLowerCase();
    if (local.length >= 3 && lower.contains(local)) {
      return 'Password cannot contain your email name';
    }
    final nameParts = (fullName ?? '')
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((n) => n.length >= 3);
    if (nameParts.any(lower.contains)) {
      return 'Password cannot contain your name';
    }
    return null;
  }
}
