# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------
# Capacitor
#
# The bridge resolves plugins and their @PluginMethod entry points by
# reflection at runtime, so R8 sees no callers and strips them. The app
# then builds, installs, launches, and every native call fails at runtime
# -- in release only, which is the worst place to discover it. Keep the
# plugin surface.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod public <methods>;
}

# Plugins in this app, kept by package for the same reason.
-keep class com.capacitorjs.plugins.** { *; }

# Cordova compatibility layer that Capacitor still loads.
-keep class org.apache.cordova.** { *; }

# Firebase Cloud Messaging: the service is declared in the manifest and
# instantiated by the framework, never called from our code.
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# JavaScript interfaces are called from the WebView, which R8 cannot see.
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# Keep source line numbers so a Play Console crash report points at a real
# line; the file name itself is still obfuscated away.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
