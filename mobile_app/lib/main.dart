import 'package:flutter/material.dart';

import 'core/app_theme.dart';
import 'screens/auth/create_account_screen.dart';

void main() => runApp(const CareGiversApp());

class CareGiversApp extends StatelessWidget {
  const CareGiversApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CareGivers',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const CreateAccountScreen(),
    );
  }
}
