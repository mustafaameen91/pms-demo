import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../l10n/gen/app_localizations.dart';

/// Dates, amounts and "5 min ago" in the app's language (Western digits, like the website).
extension FormatX on BuildContext {
  String get _locale => Localizations.localeOf(this).toLanguageTag();

  /// "2026-10-25" → "Sun, Oct 25" / "الأحد، 25 أكتوبر".
  String day(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : DateFormat.MMMEd(_locale).format(d);
  }

  /// "2026-10-25" → "Oct 25".
  String shortDate(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : DateFormat.MMMd(_locale).format(d);
  }

  String weekday(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : DateFormat.EEEE(_locale).format(d);
  }

  /// 150000 IQD → "150,000 IQD"; 12.5 USD → "12.50 USD". Whole-unit currencies show no decimals.
  String money(double amount, String currency) {
    final whole = const {'IQD', 'JPY', 'KRW'}.contains(currency) || amount == amount.roundToDouble();
    final f = NumberFormat.decimalPatternDigits(locale: _locale, decimalDigits: whole ? 0 : 2);
    return '${f.format(amount)} $currency';
  }

  /// 2.5 → "2.5", 8.0 → "8".
  String hours(double h) => h == h.roundToDouble() ? h.toInt().toString() : h.toStringAsFixed(h * 10 == (h * 10).roundToDouble() ? 1 : 2);

  String ago(DateTime? t) {
    if (t == null) return '';
    final l = AppLocalizations.of(this);
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return l.justNow;
    if (d.inHours < 1) return l.minutesAgo(d.inMinutes);
    if (d.inHours < 24) return l.hoursAgo(d.inHours);
    if (d.inDays == 1) return l.yesterday;
    return DateFormat.MMMd(_locale).format(t);
  }
}

/// Today as "YYYY-MM-DD" on this phone.
String todayIso() => DateFormat('yyyy-MM-dd').format(DateTime.now());
String isoOf(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

/// The direction of text people typed (titles, descriptions, comments), from
/// its own words: an English note stays left-to-right inside the Arabic app,
/// like dir="auto" on the website.
TextDirection textDirOf(String text) => Bidi.detectRtlDirectionality(text) ? TextDirection.rtl : TextDirection.ltr;
