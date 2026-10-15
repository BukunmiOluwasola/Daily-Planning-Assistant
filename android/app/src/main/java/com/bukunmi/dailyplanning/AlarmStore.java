package com.bukunmi.dailyplanning;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

// Persisted alarm queue: JSON in SharedPreferences, so schedules survive
// process death and can be re-registered after reboot. Each entry:
// {key, kind, label, at (epoch ms), activityId}.
public final class AlarmStore {
    private static final String PREFS = "dpa_alarms";
    private static final String KEY = "queue";

    private AlarmStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized void save(Context ctx, List<AlarmItem> items) {
        try {
            JSONArray arr = new JSONArray();
            for (AlarmItem it : items) {
                JSONObject o = new JSONObject();
                o.put("key", it.key);
                o.put("kind", it.kind);
                o.put("label", it.label);
                o.put("at", it.at);
                o.put("activityId", it.activityId);
                arr.put(o);
            }
            prefs(ctx).edit().putString(KEY, arr.toString()).apply();
        } catch (Exception ignored) {
            // Persistence is best-effort; in-memory schedule still fires this run.
        }
    }

    public static synchronized List<AlarmItem> load(Context ctx) {
        List<AlarmItem> out = new ArrayList<>();
        try {
            String raw = prefs(ctx).getString(KEY, "[]");
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out.add(new AlarmItem(
                    o.optString("key"), o.optString("kind"), o.optString("label"),
                    o.optLong("at"), o.optLong("activityId", -1)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    public static synchronized void clear(Context ctx) {
        prefs(ctx).edit().remove(KEY).apply();
    }

    public static synchronized void removeKey(Context ctx, String key) {
        List<AlarmItem> kept = new ArrayList<>();
        for (AlarmItem it : load(ctx)) {
            if (!it.key.equals(key)) kept.add(it);
        }
        save(ctx, kept);
    }

    public static final class AlarmItem {
        public final String key;
        public final String kind;
        public final String label;
        public final long at;
        public final long activityId;

        public AlarmItem(String key, String kind, String label, long at, long activityId) {
            this.key = key;
            this.kind = kind;
            this.label = label;
            this.at = at;
            this.activityId = activityId;
        }
    }
}
