/// CareMatch Privacy Notice, shown before an account is created.
///
/// [kPrivacyVersion] must equal PRIVACY_VERSION in api_backend/routes/auth.js:
/// the API records which version each caregiver accepted. Change both together
/// whenever the text changes, so everyone is asked to accept the new version.
const kPrivacyVersion = '1.0';
const kPrivacyUpdated = '12 November 2026';
const kPrivacyContact = 'carematch.project@gmail.com';

class PrivacySection {
  final String title;
  final String body;
  const PrivacySection(this.title, this.body);
}

const kPrivacySections = [
  PrivacySection('Who we are',
      'CareMatch verifies the identity of home caregivers and matches them with suitable care jobs. '
      'It is run as a final-year research project at Strathmore University, Nairobi. The project team '
      'decides how your data is used and is responsible for protecting it under the Kenya Data Protection '
      'Act, 2019. Contact us at $kPrivacyContact.'),
  PrivacySection('What we collect',
      '• Account: your name, email address, phone number and password (stored only in scrambled form).\n'
      '• Personal details: date of birth, gender, nationality, ID or passport number, and address.\n'
      '• Professional details: years of experience, Certificate of Good Conduct details, licences, work '
      'history, skills, languages and availability.\n'
      '• Documents: photos of your ID or passport, your Certificate of Good Conduct, CV and any other '
      'documents you upload.\n'
      '• Face data: your selfie, the head-turn photos, and the face measurements (face templates) worked '
      'out from them and from your ID photo.\n'
      '• Results: verification results, your trust score, the jobs matched to you, and the jobs you '
      'express interest in.'),
  PrivacySection('Why we use it',
      '• To confirm that you are who you say you are, and to prevent fraud.\n'
      '• To recommend jobs that fit your skills, location, experience and availability.\n'
      '• To send you verification codes and tell you about decisions on your application and jobs.\n'
      '• To keep a record of every decision, so it can be checked and corrected.\n'
      '• To measure how well the system works, using results that do not identify you.'),
  PrivacySection('Face data and your ID',
      'Face data is sensitive personal data under the Act. We use it only to check that '
      'your selfie matches your ID photo and that a real person took it. We never use it for anything else, '
      'and we never sell it. Your ID number is also protected: it is stored encrypted. Before the selfie step we ask for your '
      'separate, explicit consent to these checks and to checking your details against the national '
      'identity register. You can refuse, but your identity cannot then be verified.'),
  PrivacySection('Who can see it',
      '• Authorised CareMatch administrators, who review applications and manage jobs.\n'
      '• When you express interest in a job: the family or agency it belongs to, through our '
      'administrators, sees your name, county, experience, skills, trust badge, contact details and CV.\n'
      '• The identity register check, which receives only your ID number, name and date of birth.\n'
      '• Companies that host our servers and send our emails, only to provide those services.\n'
      'We do not sell your data or use it for advertising.'),
  PrivacySection('How we protect it',
      'Connections are encrypted. Passwords are scrambled, identity numbers are encrypted, and only '
      'administrators with an account can open documents. Every administrator decision is recorded. If a '
      'data breach puts you at risk, we will tell you and the Data Commissioner without delay.'),
  PrivacySection('How long we keep it',
      'We keep your data while your account is active. If you ask us to close your account, we delete your '
      'documents, photos and face data within 30 days. We keep only the record of past verification '
      'decisions, which shows no images, for up to 12 months to prevent fraud, then delete it as well.'),
  PrivacySection('Your rights',
      'You have the right to be told how your data is used, to see the data we hold about you, to correct '
      'it (most details can be edited in your profile), to ask us to delete it, to object to its use, and to '
      'withdraw your consent. Email $kPrivacyContact to use these rights. If you are not satisfied with our '
      'answer, you can complain to the Office of the Data Protection Commissioner (www.odpc.go.ke).'),
  PrivacySection('Age',
      'CareMatch is for people aged 18 and over. We do not knowingly collect data from anyone younger.'),
  PrivacySection('Changes to this notice',
      'If we change this notice, we will show you the new version and ask you to accept it again.'),
];
