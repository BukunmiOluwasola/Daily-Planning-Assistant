package com.bukunmi.dailyplanning;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.List;

// Re-registers future alarms after a device reboot. Past times are dropped
// (reported as missed by the web UI when the app next opens).
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {
            return;
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            return; // user revoked exact alarms; web fallback only until re-granted
        }
        long now = System.currentTimeMillis();
        List<AlarmStore.AlarmItem> kept = new java.util.ArrayList<>();
        for (AlarmStore.AlarmItem it : AlarmStore.load(ctx)) {
            if (it.at > now) {
                AlarmReceiver.schedule(ctx, it);
                kept.add(it);
            }
        }
        AlarmStore.save(ctx, kept);
    }
}
