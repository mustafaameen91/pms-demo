import 'dart:convert';

import 'package:dio/dio.dart';

import 'config.dart';
import 'models.dart';

enum ApiFailure {
  /// No connection, timeout, DNS…
  network,

  /// Token missing, expired or revoked → back to the login screen.
  unauthorized,

  /// Wrong email or password.
  invalidCredentials,

  /// The company's subscription isn't active.
  locked,
  notFound,
  invalid,
  server,
}

/// A failed request. [message] comes from the server, already in the person's
/// language; when there is none (no connection) the screen shows its own text.
class ApiException implements Exception {
  const ApiException(this.failure, [this.message, this.fields = const {}]);
  final ApiFailure failure;
  final String? message;

  /// Per-field messages for a form (400), e.g. {"hours": "Enter an amount greater than 0"}.
  final Map<String, String> fields;

  @override
  String toString() => 'ApiException($failure, $message)';
}

/// The one Dio instance for the whole app. The token and language are read from
/// memory on every request (never from storage), so requests start instantly.
class ApiClient {
  ApiClient({required String? Function() token, required String Function() language, required void Function(String? message) onUnauthorized})
    : _onUnauthorized = onUnauthorized,
      _token = token,
      _dio = Dio(
        BaseOptions(
          baseUrl: '$apiUrl/api/mobile/v$apiVersion',
          connectTimeout: const Duration(seconds: 10),
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          responseType: ResponseType.json,
          contentType: Headers.jsonContentType,
        ),
      ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final t = options.extra['token'] as String? ?? token();
          if (t != null) options.headers['Authorization'] = 'Bearer $t';
          options.headers['Accept-Language'] = language();
          handler.next(options);
        },
      ),
    );
  }

  final Dio _dio;
  final String? Function() _token;
  final void Function(String? message) _onUnauthorized;

  /// POST /session → (token, me).
  Future<(String, Me)> signIn(String email, String password) async {
    final data = await _send(() => _dio.post<Object?>('/session', data: {'email': email, 'password': password}), signingIn: true);
    return (data['token'] as String, Me.fromJson((data['me'] as Map).cast<String, dynamic>()));
  }

  /// DELETE /session: ends this phone's token only. Best effort.
  Future<void> signOut(String token) async {
    try {
      await _dio.delete<Object?>('/session', options: Options(extra: {'token': token}));
    } catch (_) {}
  }

  Future<(Me, String)> me({String? token}) async {
    final data = await _send(() => _dio.get<Object?>('/me', options: Options(extra: {'token': ?token})));
    return (Me.fromJson(data), jsonEncode(data));
  }

  Future<(Home, String)> home(String slug) async {
    final data = await _send(() => _dio.get<Object?>('/w/${Uri.encodeComponent(slug)}/home'));
    return (Home.fromJson(data), jsonEncode(data));
  }

  // ── The rest of the API: plain JSON in and out; screens parse what they need. ──

  /// [path] is under /w/{slug}, e.g. '/tasks'.
  String _w(String slug, String path) => '/w/${Uri.encodeComponent(slug)}$path';

  Future<Json> get(String slug, String path, {Map<String, String>? query}) =>
      _send(() => _dio.get<Object?>(_w(slug, path), queryParameters: query));

  /// A change. The answer is { ok, warning?, info?, pending? }: see [ApiResult].
  Future<ApiResult> send(String method, String slug, String path, [Json? body]) async {
    final data = await _send(() => _dio.request<Object?>(_w(slug, path), data: body, options: Options(method: method)));
    return ApiResult.fromJson(data);
  }

  /// multipart/form-data with optional files (photos, receipts), shrunk on the phone first.
  Future<ApiResult> upload(String slug, String path, Map<String, String> fields, {Map<String, List<String>> files = const {}}) async {
    final form = FormData();
    fields.forEach((k, v) => form.fields.add(MapEntry(k, v)));
    for (final e in files.entries) {
      for (final file in e.value) {
        form.files.add(MapEntry(e.key, await MultipartFile.fromFile(file, filename: file.split('/').last)));
      }
    }
    final data = await _send(
      () => _dio.post<Object?>(
        _w(slug, path),
        data: form,
        options: Options(sendTimeout: const Duration(minutes: 2), contentType: 'multipart/form-data'),
      ),
    );
    return ApiResult.fromJson(data);
  }

  /// Full address of a server file (/api/files/…) and the header it needs.
  String fileUrl(String path) => path.startsWith('http') ? path : '$apiUrl$path';
  Map<String, String> get authHeaders {
    final t = _token();
    return {if (t != null) 'Authorization': 'Bearer $t'};
  }

  Future<Json> _send(Future<Response<Object?>> Function() request, {bool signingIn = false}) async {
    try {
      final res = await request();
      final body = res.data;
      if (body is Map) return body.cast<String, dynamic>();
      throw const ApiException(ApiFailure.server);
    } on DioException catch (e) {
      throw _map(e, signingIn: signingIn);
    }
  }

  ApiException _map(DioException e, {required bool signingIn}) {
    final res = e.response;
    if (res == null) return const ApiException(ApiFailure.network);
    final body = res.data;
    final error = body is Map ? body['error'] : null;
    final code = error is Map ? error['code'] as String? : null;
    final message = error is Map ? error['message'] as String? : null;
    switch (res.statusCode) {
      case 401:
        if (code == 'invalid_credentials' || signingIn) return ApiException(ApiFailure.invalidCredentials, message);
        _onUnauthorized(message);
        return ApiException(ApiFailure.unauthorized, message);
      case 402:
        return ApiException(ApiFailure.locked, message);
      case 404:
        return ApiException(ApiFailure.notFound, message);
      case 400:
        final fields = error is Map && error['fields'] is Map ? (error['fields'] as Map).map((k, v) => MapEntry('$k', '$v')) : const <String, String>{};
        return ApiException(ApiFailure.invalid, message, fields);
      default:
        return ApiException(ApiFailure.server, message);
    }
  }
}

/// What a change came back with. [warning]: saved, but worth knowing (e.g.
/// started while blocked). [pending]: saved and waiting for approval.
class ApiResult {
  const ApiResult({this.warning, this.info, this.pending = false, this.data});

  factory ApiResult.fromJson(Json j) =>
      ApiResult(warning: j['warning'] as String?, info: j['info'] as String?, pending: j['pending'] == true, data: j['data']);

  final String? warning;
  final String? info;
  final bool pending;
  final Object? data;
}
