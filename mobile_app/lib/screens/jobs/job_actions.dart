import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/job_models.dart';
import '../../services/service_locator.dart';
import 'interest_submitted_screen.dart';
import 'job_details_screen.dart';

void openJobDetails(BuildContext context, JobMatch job) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => JobDetailsScreen(job: job)));
}

/// Sends the interest, then shows the success screen. Returns the updated job,
/// or null if it failed (the error is shown as a snackbar).
Future<JobMatch?> expressInterest(BuildContext context, JobMatch job) async {
  try {
    final updated = await jobsService.expressInterest(job.jobId);
    if (!context.mounted) return updated;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => InterestSubmittedScreen(job: updated)),
    );
    return updated;
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyError(e, 'Could not send your interest. Please try again.'))),
      );
    }
    return null;
  }
}
