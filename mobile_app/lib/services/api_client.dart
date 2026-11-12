import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../core/api_config.dart';

/// An error the screens can show directly: [message] is written for the user.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  /// Machine-readable reason from the API, e.g. `email_not_verified`.
  final String? reason;

  /// Field-level validation errors, e.g. {'password': 'min 8 chars ...'}.
  final Map<String, dynamic>? fields;

  const ApiException(this.message, {this.statusCode, this.reason, this.fields});

  @override
  String toString() => 'ApiException($statusCode, $reason): $message';
}

/// Message to show for any error: the API's message when there is one,
/// otherwise [fallback].
String friendlyError(Object error, String fallback) =>
    error is ApiException ? error.message : fallback;

/// The one place the app talks HTTP. Adds the JWT, decodes JSON and turns
/// every failure into an [ApiException].
class ApiClient {
  ApiClient({http.Client? client, FlutterSecureStorage? storage})
      : _client = client ?? http.Client(),
        _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'auth_token';

  final http.Client _client;
  final FlutterSecureStorage _storage;
  String? _token;

  // ------------------------------------------------------------- token
  Future<String?> get token async => _token ??= await _storage.read(key: _tokenKey);

  /// Saving a new token starts a new session, so any submission id kept from
  /// a previous account on this phone is forgotten (it is re-read from the API).
  Future<void> saveToken(String token) async {
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.delete(key: 'kyc_submission_id');
  }

  Future<void> clearToken() async {
    _token = null;
    await _storage.delete(key: _tokenKey);
  }

  Future<String?> read(String key) => _storage.read(key: key);
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  Future<void> remove(String key) => _storage.delete(key: key);

  // ------------------------------------------------------------- JSON calls
  Future<Map<String, dynamic>> get(String path) =>
      _send(http.Request('GET', _uri(path)));

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) =>
      _send(_jsonRequest('POST', path, body));

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) =>
      _send(_jsonRequest('PUT', path, body));

  /// Multipart upload. [files] are (field name, file path) pairs, so the same
  /// field can appear more than once (e.g. several `selfie_turn` frames).
  Future<Map<String, dynamic>> upload(
    String path, {
    required List<(String, String)> files,
    Map<String, String> fields = const {},
    Duration? timeout,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path))..fields.addAll(fields);
    for (final (field, filePath) in files) {
      request.files.add(await http.MultipartFile.fromPath(
        field,
        filePath,
        contentType: _contentType(filePath),
      ));
    }
    return _send(request, timeout: timeout);
  }

  // ------------------------------------------------------------- internals
  Uri _uri(String path) => Uri.parse('${ApiConfig.baseUrl}$path');

  http.Request _jsonRequest(String method, String path, Map<String, dynamic>? body) {
    final request = http.Request(method, _uri(path))
      ..headers['Content-Type'] = 'application/json';
    if (body != null) request.body = jsonEncode(body);
    return request;
  }

  MediaType _contentType(String filePath) {
    final p = filePath.toLowerCase();
    if (p.endsWith('.png')) return MediaType('image', 'png');
    if (p.endsWith('.pdf')) return MediaType('application', 'pdf');
    return MediaType('image', 'jpeg');
  }

  Future<Map<String, dynamic>> _send(http.BaseRequest request, {Duration? timeout}) async {
    final t = await token;
    if (t != null) request.headers['Authorization'] = 'Bearer $t';
    request.headers['Accept'] = 'application/json';

    final http.Response response;
    try {
      final streamed = await _client.send(request).timeout(timeout ?? ApiConfig.requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException('The server took too long to respond. Please try again.');
    } on SocketException {
      throw const ApiException(
          'Cannot reach the server. Check your connection and that the API is running.');
    } on http.ClientException {
      throw const ApiException(
          'Cannot reach the server. Check your connection and that the API is running.');
    }

    Map<String, dynamic> body = {};
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) body = decoded;
      } on FormatException {
        // non-JSON body: keep the empty map
      }
    }
    if (kDebugMode) {
      debugPrint('[api] ${request.method} ${request.url.path} -> ${response.statusCode}');
    }

    if (response.statusCode >= 400) {
      if (response.statusCode == 401) await clearToken();
      throw ApiException(
        _messageFrom(body, response.statusCode),
        statusCode: response.statusCode,
        reason: body['reason'] as String?,
        fields: body['fields'] as Map<String, dynamic>?,
      );
    }
    return body;
  }

  /// Turns the API's error body into one readable sentence.
  String _messageFrom(Map<String, dynamic> body, int status) {
    final fields = body['fields'];
    if (fields is Map && fields.isNotEmpty) {
      final first = fields.entries.first;
      return '${_label(first.key.toString())}: ${first.value}';
    }
    final error = body['error'];
    if (error is String && error.isNotEmpty) return error;
    if (status == 401) return 'Your session has ended. Please log in again.';
    if (status >= 500) return 'Something went wrong on the server. Please try again.';
    return 'Request failed ($status).';
  }

  String _label(String key) => switch (key) {
        'firstName' || 'lastName' => 'Name',
        'idNumber' => 'ID number',
        'idType' => 'ID type',
        'dateOfBirth' => 'Date of birth',
        _ => '${key[0].toUpperCase()}${key.substring(1)}',
      };
}