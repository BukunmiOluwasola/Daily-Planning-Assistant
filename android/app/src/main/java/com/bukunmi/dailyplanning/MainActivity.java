package com.bukunmi.dailyplanning;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Full-screen shell for the Daily Planning Assistant PWA.
// All planning, auth, AI and storage run on the hosted app; this wrapper
// only renders it. In-app reminders always work; browser notifications
// follow the WebView's capabilities and degrade gracefully in the page.
//
// Native alarms (AlarmManager + notifications, independent of the WebView)
// are driven through the PlannerBridge by the confirmed web schedule.
public class MainActivity extends Activity implements PlannerBridge.Listener {
    private static final String START_URL =
        "https://6ad1056cda5658ea6a8c5afd--daily-planning-assistant.netlify.app/";
    private static final int REQ_NOTIFY = 1001;

    private WebView web;

    /** True when the OS will let us schedule exact alarms. */
    public static boolean exactAlarmsAllowed(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return am.canScheduleExactAlarms();
        }
        return true;
    }

    /** True when alert notifications may be posted. */
    public static boolean notificationsAllowed(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return nm.areNotificationsEnabled();
        }
        return true;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);

        AlarmReceiver.ensureChannel(this);
        requestNotificationPermission();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new PlannerBridge(this, this), "Android");
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        if (savedInstanceState == null) {
            web.loadUrl(START_URL);
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onAlarmsChanged() {
        // Hook for future status UI; the web dashboard polls getAlarmStatus().
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
            }
        }
    }

    /** Open system settings so the user can grant exact alarms (Android 12+). */
    public void openExactAlarmSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
