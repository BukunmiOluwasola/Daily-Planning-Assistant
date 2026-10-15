package com.bukunmi.dailyplanning;

import android.content.Context;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

// Safe JavaScript bridge: the website posts its confirmed schedule here so
// alarms survive without JavaScript timers. Only task titles/times cross the
// bridge (the same data already shown on screen); no credentials ever do.
public class PlannerBridge {
    private final Context appCtx;
    private final Listener listener;

    public interface Listener {
        void onAlarmsChanged();
    }

    public PlannerBridge(Context ctx, Listener listener) {
        this.appCtx = ctx.getApplicationContext();
        this.listener = listener;
    }

    private static String keyOf(String kind, long activityId, long at) {
        return kind + ":" + activityId + ":" + at;
    }

    /** Replace the native queue with the confirmed web schedule.
     *  JSON: [{kind:"start"|"end"|"break", activityId, title, at (epoch ms)}] */
    @JavascriptInterface
    public String scheduleAlarms(String json) {
        try {
            JSONArray arr = new JSONArray(json);
            List<AlarmStore.AlarmItem> items = new ArrayList<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String kind = o.optString("kind", "");
                if (!kind.equals("start") && !kind.equals("end") && !kind.equals("break")) continue;
                long at = o.optLong("at", 0);
                if (at <= now || at - now > 24L * 3600 * 1000) continue; // future-only, 24h cap
                long aid = o.optLong("activityId", -1);
                String title = o.optString("title", "");
                if (title.length() > 120) title = title.substring(0, 120);
                AlarmStore.AlarmItem it = new AlarmStore.AlarmItem(
                    keyOf(kind, aid, at), kind, title, at, aid);
                items.add(it);
                AlarmReceiver.schedule(appCtx, it);
            }
            AlarmStore.save(appCtx, items);
            if (listener != null) listener.onAlarmsChanged();
            return "{\"ok\":true,\"scheduled\":" + items.size() + "}";
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    /** Clear every native alarm (e.g. schedule paused or day finished). */
    @JavascriptInterface
    public String cancelAllAlarms() {
        try {
            for (AlarmStore.AlarmItem it : AlarmStore.load(appCtx)) {
                AlarmReceiver.cancel(appCtx, it);
            }
            AlarmStore.clear(appCtx);
            if (listener != null) listener.onAlarmsChanged();
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    /** Machine-readable capability report for the web UI. */
    @JavascriptInterface
    public String getAlarmStatus() {
        try {
            JSONObject o = new JSONObject();
            o.put("native", true);
            o.put("queued", AlarmStore.load(appCtx).size());
            o.put("exactAllowed", MainActivity.exactAlarmsAllowed(appCtx));
            o.put("notifications", MainActivity.notificationsAllowed(appCtx));
            return o.toString();
        } catch (Exception e) {
            return "{\"native\":true}";
        }
    }
}
