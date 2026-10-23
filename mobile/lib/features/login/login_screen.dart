import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/providers.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/motion.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _obscure = true;
  bool _busy = false;
  bool _submitted = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitted = true;
      _error = null;
    });
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      await ref.read(sessionProvider.notifier).signIn(_email.text.trim(), _password.text);
      TextInput.finishAutofillContext();
      unawaited(HapticFeedback.lightImpact());
      // The router moves on by itself.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(context, e);
      });
      unawaited(HapticFeedback.mediumImpact());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final size = MediaQuery.sizeOf(context);
    final top = MediaQuery.paddingOf(context).top;
    final heroHeight = (size.height * 0.40).clamp(300.0, 380.0) + top;
    final expiredMessage = ref.watch(sessionProvider.select((s) => s.message));

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Stack(
            children: [
              SizedBox(
                height: heroHeight,
                width: double.infinity,
                child: BlueprintBackdrop(
                  child: Padding(
                    padding: EdgeInsetsDirectional.fromSTEB(Space.xxl, top + Space.sm, Space.md, 56),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Align(alignment: AlignmentDirectional.centerEnd, child: _LanguageSwitch()),
                        const Spacer(),
                        const Entrance(child: BrandMark(size: 60)),
                        const SizedBox(height: Space.xl),
                        Entrance(
                          delay: const Duration(milliseconds: 60),
                          child: Text(
                            l.appName,
                            style: context.text.displaySmall!.copyWith(color: Colors.white, letterSpacing: 1.5),
                          ),
                        ),
                        const SizedBox(height: Space.xs),
                        Entrance(
                          delay: const Duration(milliseconds: 120),
                          child: Text(
                            l.tagline,
                            style: context.text.bodyLarge!.copyWith(color: Colors.white.withValues(alpha: 0.82)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.only(top: heroHeight - 32),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: size.height - heroHeight + 32),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: context.colors.surface,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.xl)),
                    ),
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(Space.xxl, Space.xxxl, Space.xxl, MediaQuery.paddingOf(context).bottom + Space.xxl),
                      child: Entrance(
                        delay: const Duration(milliseconds: 160),
                        child: _buildForm(context, expiredMessage),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context, String? expiredMessage) {
    final l = context.l10n;
    final p = context.palette;
    return Form(
      key: _form,
      autovalidateMode: _submitted ? AutovalidateMode.onUserInteraction : AutovalidateMode.disabled,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text(l.signInTitle, style: context.text.headlineSmall)),
            const SizedBox(height: Space.xs),
            Text(l.signInSubtitle, style: context.text.bodyMedium!.copyWith(color: p.muted)),
            if (expiredMessage != null && _error == null) ...[
              const SizedBox(height: Space.lg),
              InlineBanner(icon: Icons.lock_clock_outlined, message: expiredMessage, tone: Tone.info),
            ],
            const SizedBox(height: Space.xxl),
            TextFormField(
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email, AutofillHints.username],
              autocorrect: false,
              enableSuggestions: false,
              // Email addresses are always written left to right, even in Arabic.
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: l.email, prefixIcon: const Icon(Icons.alternate_email_rounded)),
              validator: (v) {
                final value = v?.trim() ?? '';
                if (value.isEmpty) return l.emailRequired;
                if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value)) return l.emailInvalid;
                return null;
              },
              onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
            ),
            const SizedBox(height: Space.lg),
            TextFormField(
              controller: _password,
              focusNode: _passwordFocus,
              enabled: !_busy,
              obscureText: _obscure,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.password],
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                labelText: l.password,
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  tooltip: _obscure ? l.showPassword : l.hidePassword,
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              validator: (v) => (v ?? '').isEmpty ? l.passwordRequired : null,
              onFieldSubmitted: (_) => _submit(),
            ),
            AnimatedSwitcher(
              duration: Motion.medium,
              child: _error == null
                  ? const SizedBox(width: double.infinity)
                  : Padding(
                      key: ValueKey(_error),
                      padding: const EdgeInsets.only(top: Space.lg),
                      child: InlineBanner(icon: Icons.error_outline_rounded, message: _error!, tone: Tone.danger),
                    ),
            ),
            const SizedBox(height: Space.xxl),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: AnimatedSwitcher(
                duration: Motion.fast,
                child: _busy
                    ? SizedBox.square(
                        key: const ValueKey('busy'),
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: context.colors.onPrimary),
                      )
                    : Text(l.signIn, key: const ValueKey('idle')),
              ),
            ),
            const SizedBox(height: Space.lg),
            Text(l.forgotPassword, textAlign: TextAlign.center, style: context.text.bodySmall),
            if (kDebugMode) ...[
              const SizedBox(height: Space.lg),
              Text(apiUrl, textAlign: TextAlign.center, style: context.text.labelSmall!.copyWith(color: p.muted)),
            ],
          ],
        ),
      ),
    );
  }
}

/// English ⇄ العربية, right on the login screen.
class _LanguageSwitch extends ConsumerWidget {
  const _LanguageSwitch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arabic = resolveLanguage(ref.watch(languageProvider)) == 'ar';
    return TextButton.icon(
      style: TextButton.styleFrom(
        foregroundColor: Colors.white,
        backgroundColor: Colors.white.withValues(alpha: 0.12),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      ),
      onPressed: () {
        HapticFeedback.selectionClick();
        ref.read(languageProvider.notifier).set(arabic ? 'en' : 'ar');
      },
      icon: const Icon(Icons.translate_rounded, size: 18),
      // Each name is written in its own language, so anyone can find theirs.
      label: Text(arabic ? 'English' : 'العربية', style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }
}
