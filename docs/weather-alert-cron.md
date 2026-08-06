# VAIVIA weather-alert monitor

Phase 2 is invoked through the protected server endpoint:

```text
POST /api/cron/weather-alerts
Authorization: Bearer <WEATHER_CRON_SECRET>
```

The endpoint processes at most 20 candidate trips per invocation. It uses a
three-hour run key in `weather_alert_job_runs`, so duplicate or concurrent
invocations for the same window are safely skipped.

The stable weather-notification key uses the user, trip, location, source
identity, six-hour start/end buckets, severity, and affected-plan fingerprint.
An identical alert therefore stays deduplicated after it is read or dismissed;
a severity escalation, a material window change, or newly affected plans can
create a new notification. Raw Google responses are never stored.

## Required secrets

Configure these only in the server deployment environment:

```text
GOOGLE_WEATHER_MONITOR_API_KEY
WEATHER_CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

`WEATHER_CRON_SECRET` should be a high-entropy random value distinct from other
application secrets. Never add any of these values to a `NEXT_PUBLIC_` variable.

## Recommended Supabase Cron configuration

Enable the `pg_cron`, `pg_net`, and Vault integrations for the project. Store
the production application origin and Cron secret in Vault. Do not substitute
real values in a committed migration or source file.

```sql
select vault.create_secret(
  'https://YOUR-APP-DOMAIN.example',
  'weather_monitor_app_url'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_WEATHER_CRON_SECRET_USED_BY_VERCEL',
  'weather_cron_secret'
);
```

Schedule the job every three hours with the standard five-field expression
`0 */3 * * *`:

```sql
select cron.schedule(
  'vaivia-weather-alerts',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'weather_monitor_app_url'
    ) || '/api/cron/weather-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'weather_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Supabase Cron schedules are UTC. The monitor itself evaluates every trip using
the primary destination's timezone returned by Google, so trip start and end
date-only fields do not shift at UTC midnight.

## Disable the job

```sql
select cron.unschedule('vaivia-weather-alerts');
```

## Protected manual test

Run this from a trusted terminal. Avoid shell history when supplying the real
secret.

```bash
curl --request POST \
  --header "Authorization: Bearer $WEATHER_CRON_SECRET" \
  --header "Content-Type: application/json" \
  "https://YOUR-APP-DOMAIN.example/api/cron/weather-alerts"
```

The response contains aggregate counts only. It does not include user IDs,
locations, weather payloads, prompts, or secrets.

## Inspect runs

Supabase Cron history:

```sql
select jobid, runid, status, start_time, end_time, return_message
from cron.job_run_details
order by start_time desc
limit 25;
```

VAIVIA idempotency history:

```sql
select run_key, status, trips_considered, trips_processed,
       locations_checked, notifications_created, errors,
       started_at, completed_at
from public.weather_alert_job_runs
order by started_at desc
limit 25;
```

Use the deployment's server logs to inspect the matching aggregate structured
log. Provider response bodies and precise locations are intentionally omitted.
