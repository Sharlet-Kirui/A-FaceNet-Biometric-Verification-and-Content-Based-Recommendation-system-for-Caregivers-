import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import 'home_screen.dart';
import 'my_applications_screen.dart';
import 'profile_screen.dart';
import 'recommended_jobs_screen.dart';

/// Home / Jobs / Applications / Profile, shared by every screen after verification.
class MainShell extends StatefulWidget {
  final int initialTab;
  const MainShell({super.key, this.initialTab = 0});

  static const home = 0;
  static const jobs = 1;
  static const applications = 2;
  static const profile = 3;

  /// Switches tab from any screen inside the shell (e.g. "View all" on Home).
  static void switchTab(BuildContext context, int tab) =>
      context.findAncestorStateOfType<_MainShellState>()?.select(tab);

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  late int _index = widget.initialTab;

  void select(int tab) => setState(() => _index = tab);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // IndexedStack keeps each tab's scroll position and loaded data
      body: IndexedStack(
        index: _index,
        children: const [
          HomeScreen(),
          RecommendedJobsScreen(),
          MyApplicationsScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: select,
        backgroundColor: Colors.white,
        indicatorColor: AppColors.stepInactive,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Jobs'),
          NavigationDestination(
              icon: Icon(Icons.assignment_turned_in_outlined),
              selectedIcon: Icon(Icons.assignment_turned_in),
              label: 'Applications'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
