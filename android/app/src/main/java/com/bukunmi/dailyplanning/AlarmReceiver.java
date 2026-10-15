package com.bukunmi.dailyplanning;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

// Fires when a scheduled task/break time arrives: plays the alarm sound,
// posts an ongoing notification with an Acknowledge action, then removes
// the entry so it cannot fire twice. Framework APIs only (no new dependencies).
public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "dpa_alarms";
    public static final String ACTION_ALARM = "com.bukunmi.dailyplanning.ALARM";
    public static final String ACTION_ACK = "com.bukunmi.dailyplanning.ACK";
    public static final String EXTRA_KEY = "key";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_LABEL = "label";

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Planning alerts", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Task start, task end and break reminders.");
            nm.createNotificationChannel(ch);
        }
    }

    public static void schedule(Context ctx, AlarmStore.AlarmItem item) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_ALARM);
        intent.putExtra(EXTRA_KEY, item.key);
        intent.putExtra(EXTRA_KIND, item.kind);
        intent.putExtra(EXTRA_LABEL, item.label);
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx, (int) (item.at & 0x7fffffff), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, item.at, pi);
            }
        } catch (SecurityException e) {
            // Exact-alarm permission revoked: fall back to an inexact window.
            am.set(AlarmManager.RTC_WAKEUP, item.at, pi);
        }
    }

    public static void cancel(Context ctx, AlarmStore.AlarmItem item) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_ALARM);
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx, (int) (item.at & 0x7fffffff), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String key = intent.getStringExtra(EXTRA_KEY);
        if (ACTION_ACK.equals(action)) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && key != null) nm.cancel(key.hashCode());
            if (key != null) AlarmStore.removeKey(ctx, key);
            stopSound();
            return;
        }
        if (!ACTION_ALARM.equals(action)) return;
        String kind = intent.getStringExtra(EXTRA_KIND);
        String label = intent.getStringExtra(EXTRA_LABEL);
        if (key != null) AlarmStore.removeKey(ctx, key); // fire once, never repeat
        ensureChannel(ctx);
        playSound(ctx);
        String title = "start".equals(kind) ? "Starting now"
            : "end".equals(kind) ? "Time up" : "Break time";
        Intent ack = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_ACK);
        ack.putExtra(EXTRA_KEY, key);
        PendingIntent ackPi = PendingIntent.getBroadcast(
            ctx, (key == null ? 0 : key.hashCode()), ack,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nb = new Notification.Builder(ctx, CHANNEL_ID);
        } else {
            nb = new Notification.Builder(ctx);
            nb.setPriority(Notification.PRIORITY_MAX);
        }
        nb.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title + ": " + (label == null ? "" : label))
            .setContentText("Tap Acknowledge to silence.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setAutoCancel(false)
            .setOngoing(true)
            .addAction(0, "Acknowledge", ackPi);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(key == null ? 0 : key.hashCode(), nb.build());
    }

    private static Ringtone current;
    private static synchronized void playSound(Context ctx) {
        stopSound();
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            current = RingtoneManager.getRingtone(ctx.getApplicationContext(), uri);
            if (current != null) current.play();
        } catch (Exception ignored) {
        }
    }
    private static synchronized void stopSound() {
        try {
            if (current != null && current.isPlaying()) current.stop();
        } catch (Exception ignored) {
        }
        current = null;
    }
}
